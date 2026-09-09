import type pino from "pino";
import type {
  LarkDirectory,
  LarkSubstituteMode,
  LarkSubstituteTask,
  LarkSubstituteTaskFailureStage,
  LarkSubstituteTaskScanRange,
} from "@getpaseo/protocol/messages";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import type { LarkChannelStore, StoredLarkChannelConfig } from "./lark-channel-store.js";
import {
  normalizeLarkApiMessage,
  type LarkSubstituteTrigger,
  type NormalizedLarkMessageEvent,
} from "./lark-message-format.js";
import { hasPrivateSubstituteAudienceAllowlist } from "./lark-substitute-audience-policy.js";
import { LarkSubstitutePrivateRelayStore } from "./lark-substitute-private-relay-store.js";
import { buildLarkSubstitutePrivateRelayMessage } from "./lark-substitute-private-relay-message.js";
import { LarkSubstitutePrivateScanScheduler } from "./lark-substitute-private-scan-scheduler.js";
import {
  matchLarkSubstituteMode,
  type MatchedLarkSubstituteMode,
} from "./lark-substitute-rule-matcher.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

interface LarkSubstitutePrivatePollerAdapter extends Pick<
  LarkChannelClientAdapter,
  "createSubstituteRelayChat" | "searchPrivateMessagesAsUser" | "sendTextWithResult"
> {}

export interface LarkPrivateSubstituteReplyPreparationInput {
  botId: string;
  modeId: string;
  taskId?: string;
  matchedMode: MatchedLarkSubstituteMode;
  event: NormalizedLarkMessageEvent;
  supplementalEvents: NormalizedLarkMessageEvent[];
}

export type LarkPrivateSubstituteReplyPreparation =
  | { kind: "skip" }
  | {
      kind: "answer";
      taskId: string;
      agentId: string;
      text: string;
      trigger: LarkSubstituteTrigger;
    };

export interface LarkPrivateSubstituteReplyDeliveryInput {
  botId: string;
  relayChatId: string;
  forwardedMessageId: string;
  source: NormalizedLarkMessageEvent;
  prepared: Extract<LarkPrivateSubstituteReplyPreparation, { kind: "answer" }>;
}

interface LarkSubstitutePrivatePollerOptions {
  paseoHome: string;
  channelStore: Pick<LarkChannelStore, "getBot">;
  adapter: LarkSubstitutePrivatePollerAdapter;
  userOAuthService: Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">;
  getDirectory?: () => LarkDirectory | null;
  logger: pino.Logger;
  onPrivateMessageObserved?: (
    config: StoredLarkChannelConfig,
    event: NormalizedLarkMessageEvent,
  ) => Promise<void> | void;
  prepareReply: (
    input: LarkPrivateSubstituteReplyPreparationInput,
  ) => Promise<LarkPrivateSubstituteReplyPreparation>;
  deliverReply: (input: LarkPrivateSubstituteReplyDeliveryInput) => Promise<void>;
  onScanFailure?: (input: {
    mode: LarkSubstituteMode;
    event?: NormalizedLarkMessageEvent;
    stage: LarkSubstituteTaskFailureStage;
    error: string;
  }) => Promise<void> | void;
  now?: () => Date;
}

class LarkPrivateSubstituteStageError extends Error {
  constructor(
    readonly stage: Extract<LarkSubstituteTaskFailureStage, "processing" | "reply">,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

function isHumanMessage(event: NormalizedLarkMessageEvent): boolean {
  const senderType = event.senderType?.toLowerCase();
  return senderType !== "app" && senderType !== "bot";
}

function getLatestUnansweredMessages(
  events: NormalizedLarkMessageEvent[],
  authorizedUserOpenId: string,
): { latest: NormalizedLarkMessageEvent; context: NormalizedLarkMessageEvent[] }[] {
  const byChat = new Map<string, NormalizedLarkMessageEvent[]>();
  for (const event of events) {
    if (!event.chatId || !event.openId || !isHumanMessage(event)) continue;
    const messages = byChat.get(event.chatId) ?? [];
    messages.push(event);
    byChat.set(event.chatId, messages);
  }
  const result: { latest: NormalizedLarkMessageEvent; context: NormalizedLarkMessageEvent[] }[] =
    [];
  for (const messages of byChat.values()) {
    messages.sort((left, right) => (left.createTime ?? 0) - (right.createTime ?? 0));
    const latest = messages.at(-1);
    if (!latest || latest.openId === authorizedUserOpenId) continue;
    const lastAuthorizedReplyAt = messages.reduce(
      (latestTime, message) =>
        message.openId === authorizedUserOpenId
          ? Math.max(latestTime, message.createTime ?? 0)
          : latestTime,
      0,
    );
    if (lastAuthorizedReplyAt > (latest.createTime ?? 0)) continue;
    result.push({ latest, context: messages.filter((message) => message !== latest) });
  }
  return result;
}

function relayChatName(mode: LarkSubstituteMode, peerName: string): string {
  return `${mode.name} · ${peerName || "私聊用户"}`.slice(0, 100);
}

function formatPrivateScanFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("99991400") ||
    message.includes("request trigger frequency limit") ||
    message.includes("HTTP 429")
  ) {
    return [
      "飞书接口请求过于频繁（code=99991400），已按飞书返回的限流时间自动重试，但仍有消息读取失败。",
      "请稍后点击“立刻执行一次扫描”。",
      `原始错误：${message}`,
    ].join(" ");
  }
  if (message.includes("im:chat:create_by_user") || message.includes("im:chat:create")) {
    return [
      "飞书用户 OAuth 缺少 im:chat:create_by_user 权限，无法创建替身私聊转发群。",
      "请在飞书开发者后台开通该用户身份权限，并在 Paseo 中点击“立即授权”重新授权。",
      `原始错误：${message}`,
    ].join(" ");
  }
  if (message.includes("im:message:readonly") || message.includes("im:message 权限")) {
    return [
      "飞书用户 OAuth 缺少 im:message:readonly 权限。",
      "请在飞书开发者后台开通该用户身份权限，并在 Paseo 中重新授权飞书用户。",
      `原始错误：${message}`,
    ].join(" ");
  }
  if (message.includes("99991679")) {
    return [
      "飞书用户 OAuth 缺少当前操作所需的用户身份权限。",
      "请根据原始错误中的权限名称在飞书开发者后台开通权限，并在 Paseo 中点击“立即授权”重新授权。",
      `原始错误：${message}`,
    ].join(" ");
  }
  return message;
}

export class LarkSubstitutePrivatePoller {
  private readonly store: LarkSubstitutePrivateRelayStore;
  private readonly timers = new Map<
    string,
    { timer: ReturnType<typeof setInterval>; fingerprint: string }
  >();
  private readonly running = new Set<string>();
  private readonly now: () => Date;
  private readonly eligibilityScheduler: LarkSubstitutePrivateScanScheduler;

  constructor(private readonly options: LarkSubstitutePrivatePollerOptions) {
    this.store = new LarkSubstitutePrivateRelayStore(options.paseoHome);
    this.now = options.now ?? (() => new Date());
    this.eligibilityScheduler = new LarkSubstitutePrivateScanScheduler({
      now: () => this.now().getTime(),
      run: async (mode) => {
        if (this.running.has(mode.id)) {
          this.eligibilityScheduler.schedule(mode, this.now().getTime() + 1_000);
          return;
        }
        await this.runMode(mode);
      },
    });
  }

  sync(modes: readonly LarkSubstituteMode[]): void {
    const activeModes = new Map(
      modes
        .filter(
          (mode) =>
            mode.enabled && mode.privateScan.enabled && hasPrivateSubstituteAudienceAllowlist(mode),
        )
        .map((mode) => [mode.id, mode] as const),
    );
    this.eligibilityScheduler.retain(new Set(activeModes.keys()));
    for (const [modeId, scheduled] of this.timers) {
      const mode = activeModes.get(modeId);
      const fingerprint = mode ? JSON.stringify(mode.privateScan) : null;
      if (fingerprint === scheduled.fingerprint) continue;
      clearInterval(scheduled.timer);
      this.timers.delete(modeId);
      this.eligibilityScheduler.cancel(modeId);
    }
    for (const mode of activeModes.values()) {
      if (this.timers.has(mode.id)) continue;
      const fingerprint = JSON.stringify(mode.privateScan);
      const timer = setInterval(
        () => void this.runMode(mode),
        mode.privateScan.intervalMinutes * 60 * 1_000,
      );
      this.timers.set(mode.id, { timer, fingerprint });
      void this.runMode(mode);
    }
  }

  stop(): void {
    for (const scheduled of this.timers.values()) clearInterval(scheduled.timer);
    this.timers.clear();
    this.eligibilityScheduler.clear();
  }

  deleteMode(modeId: string): void {
    const scheduled = this.timers.get(modeId);
    if (scheduled) clearInterval(scheduled.timer);
    this.timers.delete(modeId);
    this.eligibilityScheduler.cancel(modeId);
    this.store.deleteMode(modeId);
  }

  async runMode(mode: LarkSubstituteMode, scanRange?: LarkSubstituteTaskScanRange): Promise<void> {
    if (
      this.running.has(mode.id) ||
      !mode.enabled ||
      !mode.privateScan.enabled ||
      !hasPrivateSubstituteAudienceAllowlist(mode)
    ) {
      return;
    }
    this.running.add(mode.id);
    try {
      const bot = this.options.channelStore.getBot(mode.botId);
      if (!bot?.config.enabled || !bot.config.appId) return;
      const oauth = this.options.userOAuthService.getStatus(bot.config.appId);
      if (!oauth.authorized || !oauth.openId) {
        await this.reportScanFailure(
          mode,
          "飞书用户 OAuth 未授权、已过期或缺少替身私聊扫描、建群所需权限，请点击“立即授权”重新授权。",
        );
        return;
      }
      const search = this.options.adapter.searchPrivateMessagesAsUser;
      if (!search) throw new Error("当前飞书连接不支持扫描授权用户私聊消息");
      const now = this.now().getTime();
      const lookbackMinutes = scanRange?.lookbackMinutes ?? mode.privateScan.lookbackMinutes;
      const rawMessages = await search.call(
        this.options.adapter,
        bot.config,
        {
          startTime: Math.floor((now - lookbackMinutes * 60 * 1_000) / 1_000),
          // Include recent messages so a recent reply from the authorized user
          // suppresses an older unanswered candidate.
          endTime: Math.floor(now / 1_000),
        },
        await this.options.userOAuthService.getValidUserAccessToken(bot.config.appId),
      );
      const events = rawMessages
        .map((message) => normalizeLarkApiMessage(message, ""))
        .filter((event): event is NormalizedLarkMessageEvent => Boolean(event))
        .map((event) => Object.assign(event, { chatType: "p2p" as const }));
      await this.observePrivateMessages(bot.config, events, oauth.openId);
      const nextEligibleAt = await this.processPrivateMessageCandidates({
        config: bot.config,
        mode,
        authorizedUser: {
          openId: oauth.openId,
          name: oauth.displayName,
          email: oauth.email,
        },
        events,
        now,
        excludeRecentMinutes:
          scanRange?.excludeRecentMinutes ?? mode.privateScan.excludeRecentMinutes,
      });
      if (!scanRange) {
        if (nextEligibleAt === null) {
          this.eligibilityScheduler.cancel(mode.id);
        } else {
          this.eligibilityScheduler.schedule(mode, nextEligibleAt);
        }
      }
    } catch (error) {
      const failure = formatPrivateScanFailure(error);
      this.options.logger.warn(
        { err: error, modeId: mode.id, botId: mode.botId },
        "Failed to scan Lark private messages for substitute mode",
      );
      await this.reportScanFailure(mode, failure);
    } finally {
      this.running.delete(mode.id);
    }
  }

  async retryTask(mode: LarkSubstituteMode, task: LarkSubstituteTask): Promise<void> {
    const bot = this.options.channelStore.getBot(mode.botId);
    if (!bot?.config.enabled || !bot.config.appId) {
      throw new Error("替身绑定的飞书机器人不存在或未启用");
    }
    const oauth = this.options.userOAuthService.getStatus(bot.config.appId);
    if (!oauth.authorized || !oauth.openId) {
      throw new Error(
        "飞书用户 OAuth 未授权、已过期或缺少替身私聊扫描、建群所需权限，请点击“立即授权”重新授权。",
      );
    }
    if (!task.senderOpenId) throw new Error("原任务缺少私聊发送者 open_id，无法重试");
    const event: NormalizedLarkMessageEvent = {
      eventId: `private-retry:${task.id}`,
      messageId: task.messageId,
      chatId: task.chatId,
      chatType: "p2p",
      messageType: "text",
      threadId: null,
      rootMessageId: null,
      openId: task.senderOpenId,
      unionId: null,
      displayName: task.senderName ?? "",
      topicName: task.senderName ?? mode.name,
      text: task.content,
      createTime: Date.parse(task.createdAt),
      mentions: [],
    };
    const matched = matchLarkSubstituteMode({
      modes: [mode],
      botId: mode.botId,
      appId: bot.config.appId,
      event,
      directory: this.options.getDirectory?.() ?? null,
      authorizedUser: {
        openId: oauth.openId,
        name: oauth.displayName,
        email: oauth.email,
      },
      now: this.now(),
    });
    if (!matched) throw new Error("原消息不再命中当前替身名单或时间段配置");
    await this.relayPrivateMessage(bot.config, mode, matched, oauth.openId, event, [], task.id);
  }

  private async observePrivateMessages(
    config: StoredLarkChannelConfig,
    events: readonly NormalizedLarkMessageEvent[],
    authorizedUserOpenId: string,
  ): Promise<void> {
    for (const event of events) {
      if (!event.openId || event.openId === authorizedUserOpenId || !isHumanMessage(event)) {
        continue;
      }
      await this.options.onPrivateMessageObserved?.(config, event);
    }
  }

  private async processPrivateMessageCandidates(input: {
    config: StoredLarkChannelConfig;
    mode: LarkSubstituteMode;
    authorizedUser: { openId: string; name: string | null; email: string | null };
    events: NormalizedLarkMessageEvent[];
    now: number;
    excludeRecentMinutes: number;
  }): Promise<number | null> {
    const { config, mode, authorizedUser, events, now, excludeRecentMinutes } = input;
    const eligibleBefore = now - excludeRecentMinutes * 60 * 1_000;
    let nextEligibleAt: number | null = null;
    for (const candidate of getLatestUnansweredMessages(events, authorizedUser.openId)) {
      const candidateTime = candidate.latest.createTime ?? 0;
      if (this.store.hasProcessed(candidate.latest.messageId) || !candidate.latest.openId) continue;
      const matched = matchLarkSubstituteMode({
        modes: [mode],
        botId: mode.botId,
        appId: config.appId,
        event: candidate.latest,
        directory: this.options.getDirectory?.() ?? null,
        authorizedUser,
        now: this.now(),
      });
      if (!matched) continue;
      if (candidateTime <= 0) continue;
      if (candidateTime > eligibleBefore) {
        const eligibleAt = candidateTime + excludeRecentMinutes * 60 * 1_000;
        nextEligibleAt =
          nextEligibleAt === null ? eligibleAt : Math.min(nextEligibleAt, eligibleAt);
        continue;
      }
      try {
        await this.relayPrivateMessage(
          config,
          mode,
          matched,
          authorizedUser.openId,
          candidate.latest,
          candidate.context,
        );
        this.store.markProcessed(candidate.latest.messageId);
      } catch (error) {
        const failure = formatPrivateScanFailure(error);
        this.options.logger.warn(
          {
            err: error,
            modeId: mode.id,
            botId: mode.botId,
            chatId: candidate.latest.chatId,
            messageId: candidate.latest.messageId,
          },
          "Failed to process scanned Lark private message for substitute mode",
        );
        const stage = error instanceof LarkPrivateSubstituteStageError ? error.stage : "processing";
        await this.reportScanFailure(mode, failure, candidate.latest, stage);
      }
    }
    return nextEligibleAt;
  }

  private async reportScanFailure(
    mode: LarkSubstituteMode,
    error: string,
    event?: NormalizedLarkMessageEvent,
    stage: LarkSubstituteTaskFailureStage = "private_scan",
  ): Promise<void> {
    try {
      await this.options.onScanFailure?.({ mode, event, stage, error });
    } catch (recordError) {
      this.options.logger.warn(
        { err: recordError, modeId: mode.id, botId: mode.botId },
        "Failed to record Lark private-message scan failure",
      );
    }
  }

  private async relayPrivateMessage(
    config: StoredLarkChannelConfig,
    mode: LarkSubstituteMode,
    matchedMode: MatchedLarkSubstituteMode,
    authorizedUserOpenId: string,
    source: NormalizedLarkMessageEvent,
    context: NormalizedLarkMessageEvent[],
    taskId?: string,
  ): Promise<void> {
    if (!source.openId || !config.appId) return;
    let prepared: LarkPrivateSubstituteReplyPreparation;
    try {
      prepared = await this.options.prepareReply({
        botId: mode.botId,
        modeId: mode.id,
        ...(taskId ? { taskId } : {}),
        matchedMode,
        event: {
          ...source,
          eventId: `private-scan:${source.messageId}`,
          chatType: "p2p",
        },
        supplementalEvents: context,
      });
    } catch (error) {
      throw new LarkPrivateSubstituteStageError("processing", error);
    }
    if (prepared.kind === "skip") return;

    try {
      const token = await this.options.userOAuthService.getValidUserAccessToken(config.appId);
      let relay = this.store.get(mode.id, source.openId);
      if (relay && relay.authorizedUserOpenId !== authorizedUserOpenId) {
        this.store.remove(mode.id, source.openId);
        relay = null;
      }
      if (!relay) {
        relay = await this.createRelay(config, mode, authorizedUserOpenId, source, token);
      }
      const send = this.options.adapter.sendTextWithResult;
      if (!send) throw new Error("当前飞书连接不支持创建替身私聊话题");
      let forwarded;
      try {
        forwarded = await send.call(
          this.options.adapter,
          config,
          relay.chatId,
          buildLarkSubstitutePrivateRelayMessage(source),
        );
      } catch {
        this.store.remove(mode.id, source.openId);
        relay = await this.createRelay(config, mode, authorizedUserOpenId, source, token);
        forwarded = await send.call(
          this.options.adapter,
          config,
          relay.chatId,
          buildLarkSubstitutePrivateRelayMessage(source),
        );
      }
      if (!forwarded.messageId) throw new Error("转发私聊消息后未返回 message_id");
      await this.options.deliverReply({
        botId: mode.botId,
        relayChatId: relay.chatId,
        forwardedMessageId: forwarded.messageId,
        source,
        prepared,
      });
    } catch (error) {
      throw new LarkPrivateSubstituteStageError("reply", error);
    }
  }

  private async createRelay(
    config: StoredLarkChannelConfig,
    mode: LarkSubstituteMode,
    authorizedUserOpenId: string,
    source: NormalizedLarkMessageEvent,
    token: string,
  ) {
    if (!source.openId || !config.appId || !this.options.adapter.createSubstituteRelayChat) {
      throw new Error("当前飞书连接不支持创建替身私聊转发群");
    }
    const chatId = await this.options.adapter.createSubstituteRelayChat(
      config,
      {
        name: relayChatName(mode, source.displayName),
        authorizedUserOpenId,
        peerOpenId: source.openId,
        botAppId: config.appId,
      },
      token,
    );
    const now = this.now().toISOString();
    const relay = {
      modeId: mode.id,
      botId: mode.botId,
      authorizedUserOpenId,
      peerOpenId: source.openId,
      chatId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.upsert(relay);
    return relay;
  }
}
