import type pino from "pino";
import {
  getLarkSubstituteGroupScan,
  type LarkSubstituteMode,
  type LarkSubstituteTaskScanRange,
} from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { hasGroupSubstituteAudienceAllowlist } from "./lark-substitute-audience-policy.js";

interface LarkSubstituteGroupScanFailure {
  mode: LarkSubstituteMode;
  chatId?: string;
  event?: NormalizedLarkMessageEvent;
  error: string;
}

interface LarkSubstituteGroupPollerOptions {
  logger: pino.Logger;
  listChatMessages: (
    botId: string,
    chatId: string,
    window: { start: Date; end: Date },
  ) => Promise<NormalizedLarkMessageEvent[]>;
  listChatIds: (mode: LarkSubstituteMode) => Promise<string[]> | string[];
  getAuthorizedUserOpenId: (botId: string) => string | null;
  hasTask: (modeId: string, messageId: string) => boolean;
  onMessage: (botId: string, event: NormalizedLarkMessageEvent, modeId: string) => Promise<void>;
  onScanFailure?: (input: LarkSubstituteGroupScanFailure) => Promise<void> | void;
  now?: () => Date;
}

function mentionsUser(event: NormalizedLarkMessageEvent, openId: string): boolean {
  return event.mentions?.some((mention) => mention.openId === openId) ?? false;
}

export class LarkSubstituteGroupPoller {
  private readonly timers = new Map<
    string,
    { timer: ReturnType<typeof setInterval>; fingerprint: string }
  >();
  private readonly running = new Set<string>();
  private readonly observed = new Set<string>();
  private readonly now: () => Date;

  constructor(private readonly options: LarkSubstituteGroupPollerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  sync(modes: readonly LarkSubstituteMode[]): void {
    const activeModes = new Map(
      modes
        .filter(
          (mode) =>
            mode.enabled &&
            getLarkSubstituteGroupScan(mode).enabled &&
            hasGroupSubstituteAudienceAllowlist(mode),
        )
        .map((mode) => [mode.id, mode] as const),
    );
    for (const [modeId, scheduled] of this.timers) {
      const mode = activeModes.get(modeId);
      const fingerprint = mode ? this.fingerprint(mode) : null;
      if (fingerprint === scheduled.fingerprint) continue;
      clearInterval(scheduled.timer);
      this.timers.delete(modeId);
    }
    for (const mode of activeModes.values()) {
      if (this.timers.has(mode.id)) continue;
      const scan = getLarkSubstituteGroupScan(mode);
      const timer = setInterval(() => void this.runMode(mode), scan.intervalMinutes * 60 * 1_000);
      this.timers.set(mode.id, { timer, fingerprint: this.fingerprint(mode) });
      void this.runMode(mode);
    }
  }

  stop(): void {
    for (const scheduled of this.timers.values()) clearInterval(scheduled.timer);
    this.timers.clear();
    this.running.clear();
    this.observed.clear();
  }

  deleteMode(modeId: string): void {
    const scheduled = this.timers.get(modeId);
    if (scheduled) clearInterval(scheduled.timer);
    this.timers.delete(modeId);
    for (const key of this.observed) {
      if (key.startsWith(`${modeId}:`)) this.observed.delete(key);
    }
  }

  async runMode(mode: LarkSubstituteMode, scanRange?: LarkSubstituteTaskScanRange): Promise<void> {
    const scan = getLarkSubstituteGroupScan(mode);
    if (
      this.running.has(mode.id) ||
      !mode.enabled ||
      !scan.enabled ||
      !hasGroupSubstituteAudienceAllowlist(mode)
    ) {
      return;
    }
    this.running.add(mode.id);
    try {
      const authorizedUserOpenId = this.options.getAuthorizedUserOpenId(mode.botId);
      if (!authorizedUserOpenId) {
        await this.reportScanFailure({
          mode,
          error: "飞书用户 OAuth 未授权或已过期，无法扫描群消息，请重新授权。",
        });
        return;
      }
      const chatIds = await this.options.listChatIds(mode);
      if (chatIds.length === 0) return;
      const now = this.now().getTime();
      const lookbackMinutes = scanRange?.lookbackMinutes ?? scan.lookbackMinutes;
      const excludeRecentMinutes = scanRange?.excludeRecentMinutes ?? scan.excludeRecentMinutes;
      const window = {
        start: new Date(now - lookbackMinutes * 60 * 1_000),
        end: new Date(now - excludeRecentMinutes * 60 * 1_000),
      };
      for (const chatId of chatIds) {
        await this.scanChat(mode, chatId, window, authorizedUserOpenId);
      }
    } catch (error) {
      this.options.logger.warn(
        { err: error, modeId: mode.id, botId: mode.botId },
        "Failed to scan Lark group messages for substitute mode",
      );
      await this.reportScanFailure({
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running.delete(mode.id);
    }
  }

  private async scanChat(
    mode: LarkSubstituteMode,
    chatId: string,
    window: { start: Date; end: Date },
    authorizedUserOpenId: string,
  ): Promise<void> {
    let events: NormalizedLarkMessageEvent[];
    try {
      events = await this.options.listChatMessages(mode.botId, chatId, window);
    } catch (error) {
      await this.reportScanFailure({
        mode,
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    for (const event of events) {
      await this.processScannedEvent(mode, chatId, event, authorizedUserOpenId);
    }
  }

  private async processScannedEvent(
    mode: LarkSubstituteMode,
    chatId: string,
    event: NormalizedLarkMessageEvent,
    authorizedUserOpenId: string,
  ): Promise<void> {
    const key = `${mode.id}:${event.messageId}`;
    if (
      this.observed.has(key) ||
      this.options.hasTask(mode.id, event.messageId) ||
      !mentionsUser(event, authorizedUserOpenId)
    ) {
      return;
    }
    try {
      await this.options.onMessage(
        mode.botId,
        {
          ...event,
          eventId: `group-scan:${event.messageId}`,
          chatType: "group",
        },
        mode.id,
      );
      this.observed.add(key);
    } catch (error) {
      await this.reportScanFailure({
        mode,
        chatId,
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async reportScanFailure(input: LarkSubstituteGroupScanFailure): Promise<void> {
    try {
      await this.options.onScanFailure?.(input);
    } catch (error) {
      this.options.logger.warn(
        { err: error, modeId: input.mode.id, botId: input.mode.botId },
        "Failed to record Lark group-message scan failure",
      );
    }
  }

  private fingerprint(mode: LarkSubstituteMode): string {
    return JSON.stringify({ botId: mode.botId, scan: getLarkSubstituteGroupScan(mode) });
  }
}
