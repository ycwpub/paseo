import type pino from "pino";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import type { LarkChannelStore, StoredLarkChannelConfig } from "./lark-channel-store.js";
import { normalizeLarkApiMessage, type NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { LarkSubstitutePrivateRelayStore } from "./lark-substitute-private-relay-store.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

interface LarkSubstitutePrivatePollerAdapter extends Pick<
  LarkChannelClientAdapter,
  "createSubstituteRelayChat" | "searchPrivateMessagesAsUser" | "sendTextWithResult"
> {}

interface LarkSubstitutePrivatePollerOptions {
  paseoHome: string;
  channelStore: Pick<LarkChannelStore, "getBot">;
  adapter: LarkSubstitutePrivatePollerAdapter;
  userOAuthService: Pick<LarkUserOAuthService, "getStatus" | "getValidUserAccessToken">;
  logger: pino.Logger;
  onRelayMessage: (input: {
    botId: string;
    modeId: string;
    event: NormalizedLarkMessageEvent;
    supplementalEvents: NormalizedLarkMessageEvent[];
  }) => Promise<void>;
  now?: () => Date;
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

function buildRelayMessage(event: NormalizedLarkMessageEvent): string {
  const sender = event.displayName.trim() || event.openId || "飞书用户";
  return [`【替身私聊转发】${sender}`, event.text, "", `来源消息：${event.messageId}`].join("\n");
}

function relayChatName(mode: LarkSubstituteMode, peerName: string): string {
  return `${mode.name} · ${peerName || "私聊用户"}`.slice(0, 100);
}

export class LarkSubstitutePrivatePoller {
  private readonly store: LarkSubstitutePrivateRelayStore;
  private readonly timers = new Map<
    string,
    { timer: ReturnType<typeof setInterval>; fingerprint: string }
  >();
  private readonly running = new Set<string>();
  private readonly now: () => Date;

  constructor(private readonly options: LarkSubstitutePrivatePollerOptions) {
    this.store = new LarkSubstitutePrivateRelayStore(options.paseoHome);
    this.now = options.now ?? (() => new Date());
  }

  sync(modes: readonly LarkSubstituteMode[]): void {
    const activeModes = new Map(
      modes
        .filter((mode) => mode.enabled && mode.privateScan.enabled)
        .map((mode) => [mode.id, mode] as const),
    );
    for (const [modeId, scheduled] of this.timers) {
      const mode = activeModes.get(modeId);
      const fingerprint = mode ? JSON.stringify(mode.privateScan) : null;
      if (fingerprint === scheduled.fingerprint) continue;
      clearInterval(scheduled.timer);
      this.timers.delete(modeId);
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
  }

  deleteMode(modeId: string): void {
    const scheduled = this.timers.get(modeId);
    if (scheduled) clearInterval(scheduled.timer);
    this.timers.delete(modeId);
    this.store.deleteMode(modeId);
  }

  async runMode(mode: LarkSubstituteMode): Promise<void> {
    if (this.running.has(mode.id) || !mode.enabled || !mode.privateScan.enabled) return;
    this.running.add(mode.id);
    try {
      const bot = this.options.channelStore.getBot(mode.botId);
      if (!bot?.config.enabled || !bot.config.appId) return;
      const oauth = this.options.userOAuthService.getStatus(bot.config.appId);
      if (!oauth.authorized || !oauth.openId) return;
      const search = this.options.adapter.searchPrivateMessagesAsUser;
      if (!search) throw new Error("当前飞书连接不支持扫描授权用户私聊消息");
      const now = this.now().getTime();
      const rawMessages = await search.call(
        this.options.adapter,
        bot.config,
        {
          startTime: Math.floor((now - mode.privateScan.lookbackMinutes * 60 * 1_000) / 1_000),
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
      for (const candidate of getLatestUnansweredMessages(events, oauth.openId)) {
        const candidateTime = candidate.latest.createTime ?? 0;
        const eligibleBefore = now - mode.privateScan.excludeRecentMinutes * 60 * 1_000;
        if (candidateTime <= 0 || candidateTime > eligibleBefore) continue;
        if (this.store.hasProcessed(candidate.latest.messageId) || !candidate.latest.openId) {
          continue;
        }
        await this.relayPrivateMessage(
          bot.config,
          mode,
          oauth.openId,
          candidate.latest,
          candidate.context,
        );
        this.store.markProcessed(candidate.latest.messageId);
      }
    } catch (error) {
      this.options.logger.warn(
        { err: error, modeId: mode.id, botId: mode.botId },
        "Failed to scan Lark private messages for substitute mode",
      );
    } finally {
      this.running.delete(mode.id);
    }
  }

  private async relayPrivateMessage(
    config: StoredLarkChannelConfig,
    mode: LarkSubstituteMode,
    authorizedUserOpenId: string,
    source: NormalizedLarkMessageEvent,
    context: NormalizedLarkMessageEvent[],
  ): Promise<void> {
    if (!source.openId || !config.appId) return;
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
        buildRelayMessage(source),
      );
    } catch {
      this.store.remove(mode.id, source.openId);
      relay = await this.createRelay(config, mode, authorizedUserOpenId, source, token);
      forwarded = await send.call(
        this.options.adapter,
        config,
        relay.chatId,
        buildRelayMessage(source),
      );
    }
    if (!forwarded.messageId) throw new Error("转发私聊消息后未返回 message_id");
    await this.options.onRelayMessage({
      botId: mode.botId,
      modeId: mode.id,
      event: {
        ...source,
        eventId: `private-scan:${source.messageId}`,
        messageId: forwarded.messageId,
        chatId: relay.chatId,
        chatType: "group",
        threadId: null,
        rootMessageId: null,
        mentions: [
          {
            key: null,
            name: null,
            openId: authorizedUserOpenId,
            userId: null,
            appId: null,
            idType: "open_id",
          },
        ],
      },
      supplementalEvents: context,
    });
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
