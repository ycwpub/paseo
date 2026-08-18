import type pino from "pino";
import {
  LarkReminderCreateInputSchema,
  type LarkReminder,
  type LarkReminderCreateInput,
  type LarkReminderReply,
} from "@getpaseo/protocol/messages";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import type { LarkChannelStore, StoredLarkChannelConfig } from "./lark-channel-store.js";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { LarkReminderStore } from "./lark-reminder-store.js";

const MAX_TIMER_DELAY_MS = 2_147_000_000;

interface ReminderMessage {
  messageId: string;
  openId: string | null;
  senderType: string | null;
  displayName: string;
  text: string;
  createTime: number | null;
}

interface LarkReminderAdapter extends Pick<
  LarkChannelClientAdapter,
  "sendText" | "sendTextAsUser" | "listChatMessages"
> {}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function parseMessageText(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const parsed = asRecord(JSON.parse(value) as unknown);
    return parsed ? (stringValue(parsed, "text")?.trim() ?? "") : "";
  } catch {
    return value.trim();
  }
}

function parseApiMessage(value: unknown): ReminderMessage | null {
  const record = asRecord(value);
  if (!record) return null;
  const sender = asRecord(record.sender) ?? {};
  const senderId = asRecord(sender.sender_id) ?? asRecord(sender.senderId) ?? {};
  const senderIdType = stringValue(sender, "id_type", "idType");
  const directSenderId = stringValue(sender, "id");
  const messageId = stringValue(record, "message_id", "messageId");
  if (!messageId) return null;
  const rawCreateTime = record.create_time ?? record.createTime;
  let createTime = NaN;
  if (typeof rawCreateTime === "number") {
    createTime = rawCreateTime;
  } else if (typeof rawCreateTime === "string") {
    createTime = Number(rawCreateTime);
  }
  return {
    messageId,
    openId:
      stringValue(senderId, "open_id", "openId") ??
      (senderIdType === "open_id" ? directSenderId : null),
    senderType: stringValue(sender, "sender_type", "senderType"),
    displayName:
      stringValue(record, "sender_name", "senderName") ??
      stringValue(sender, "sender_name", "senderName", "name") ??
      "Lark user",
    text: parseMessageText(record.body ? asRecord(record.body)?.content : record.content),
    createTime: Number.isFinite(createTime) ? createTime : null,
  };
}

function escapeMention(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function reminderText(reminder: LarkReminder): string {
  const mentions = reminder.targetOpenIds
    .map((openId) => `<at user_id="${escapeMention(openId)}"></at>`)
    .join(" ");
  return `${mentions} ${reminder.message}`.trim();
}

function isHumanSender(senderType: string | null | undefined): boolean {
  const normalized = senderType?.toLowerCase();
  return normalized !== "app" && normalized !== "bot";
}

export interface LarkReminderServiceOptions {
  paseoHome: string;
  channelStore: LarkChannelStore;
  adapter: LarkReminderAdapter;
  logger: pino.Logger;
  emitChanged: (reminders: LarkReminder[]) => void;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

export class LarkReminderService {
  private readonly store: LarkReminderStore;
  private readonly channelStore: LarkChannelStore;
  private readonly adapter: LarkReminderAdapter;
  private readonly logger: pino.Logger;
  private readonly emitChanged: (reminders: LarkReminder[]) => void;
  private readonly now: () => Date;
  private readonly env: NodeJS.ProcessEnv;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly running = new Set<string>();
  private started = false;

  constructor(options: LarkReminderServiceOptions) {
    this.store = new LarkReminderStore(options.paseoHome);
    this.channelStore = options.channelStore;
    this.adapter = options.adapter;
    this.logger = options.logger.child({ module: "lark-reminder-service" });
    this.emitChanged = options.emitChanged;
    this.now = options.now ?? (() => new Date());
    this.env = options.env ?? process.env;
  }

  list(): LarkReminder[] {
    return this.store.list();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const reminder of this.store.list()) {
      if (reminder.status === "active") this.schedule(reminder);
    }
  }

  stop(): void {
    this.started = false;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  create(input: LarkReminderCreateInput): LarkReminder {
    const parsed = LarkReminderCreateInputSchema.parse(input);
    this.requireBotConfig(parsed.botId);
    this.validateSender(parsed.sender);
    const reminder = this.store.create(parsed, this.now().toISOString());
    if (reminder.status === "active") this.schedule(reminder);
    this.emit();
    return reminder;
  }

  setEnabled(id: string, enabled: boolean): LarkReminder {
    const current = this.store.get(id);
    if (!current) throw new Error("Lark reminder not found");
    this.cancelTimer(id);
    const now = this.now().toISOString();
    const updated = this.store.update(id, (reminder) => ({
      ...reminder,
      status: enabled ? "active" : "paused",
      updatedAt: now,
      startedAt: enabled ? now : reminder.startedAt,
      completedAt: enabled ? null : reminder.completedAt,
      nextRunAt: enabled ? now : null,
      lastError: null,
      reply: enabled ? null : reminder.reply,
    }));
    if (!updated) throw new Error("Lark reminder not found");
    if (enabled) {
      this.requireBotConfig(updated.botId);
      this.validateSender(updated.sender);
      this.schedule(updated);
    }
    this.emit();
    return updated;
  }

  delete(id: string): boolean {
    this.cancelTimer(id);
    const deleted = this.store.delete(id);
    if (deleted) this.emit();
    return deleted;
  }

  handleBotDeleted(botId: string): void {
    let changed = false;
    const now = this.now().toISOString();
    for (const reminder of this.store.list()) {
      if (reminder.botId !== botId || reminder.status !== "active") continue;
      this.cancelTimer(reminder.id);
      this.store.update(reminder.id, (current) => ({
        ...current,
        status: "error",
        nextRunAt: null,
        lastError: `Lark bot not found: ${botId}`,
        updatedAt: now,
      }));
      changed = true;
    }
    if (changed) this.emit();
  }

  handleIncomingEvent(botId: string, event: NormalizedLarkMessageEvent): void {
    if (!event.openId || !isHumanSender(event.senderType) || !event.text.trim()) return;
    const timestamp = event.createTime ?? this.now().getTime();
    for (const reminder of this.store.list()) {
      if (
        reminder.status !== "active" ||
        reminder.botId !== botId ||
        reminder.chatId !== event.chatId ||
        !reminder.targetOpenIds.includes(event.openId) ||
        !this.isAfterStart(reminder, timestamp)
      ) {
        continue;
      }
      this.completeFromReply(reminder, {
        messageId: event.messageId,
        openId: event.openId,
        displayName: event.displayName,
        text: event.text,
        repliedAt: new Date(timestamp).toISOString(),
      });
    }
  }

  private schedule(reminder: LarkReminder): void {
    if (!this.started || reminder.status !== "active") return;
    this.cancelTimer(reminder.id);
    const target = reminder.nextRunAt ? Date.parse(reminder.nextRunAt) : this.now().getTime();
    const delay = Math.max(0, Math.min(target - this.now().getTime(), MAX_TIMER_DELAY_MS));
    const timer = setTimeout(() => {
      this.timers.delete(reminder.id);
      void this.run(reminder.id);
    }, delay);
    this.timers.set(reminder.id, timer);
  }

  private async run(id: string): Promise<void> {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      const reminder = this.store.get(id);
      if (!reminder || reminder.status !== "active") return;
      const remoteReply = await this.findRemoteReply(reminder);
      if (remoteReply) {
        this.completeFromReply(reminder, remoteReply);
        return;
      }
      // The task may have been completed, paused, or deleted while the remote
      // reply check was in flight. Re-read persisted state before sending so a
      // stale timer cannot emit another reminder after the task has stopped.
      const activeReminder = this.store.get(id);
      if (!activeReminder || activeReminder.status !== "active") return;
      const config = this.requireBotConfig(activeReminder.botId);
      this.validateSender(activeReminder.sender);
      const now = this.now();
      const nextRunAt = new Date(
        now.getTime() + activeReminder.frequencySeconds * 1000,
      ).toISOString();
      this.store.update(id, (stored) => ({
        ...stored,
        nextRunAt,
        updatedAt: now.toISOString(),
        lastError: null,
      }));
      await this.send(config, activeReminder);
      const updated = this.store.update(id, (stored) => ({
        ...stored,
        lastSentAt: now.toISOString(),
        sendCount: stored.sendCount + 1,
        updatedAt: now.toISOString(),
      }));
      if (updated) this.schedule(updated);
      this.emit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const now = this.now();
      const updated = this.store.update(id, (current) => {
        const fatal =
          message.includes("not found") ||
          message.includes("disabled") ||
          message.includes("user access token");
        return {
          ...current,
          status: fatal ? "error" : current.status,
          nextRunAt: fatal
            ? null
            : new Date(now.getTime() + current.frequencySeconds * 1000).toISOString(),
          lastError: message,
          updatedAt: now.toISOString(),
        };
      });
      if (updated?.status === "active") this.schedule(updated);
      this.logger.warn({ err: error, reminderId: id }, "Lark reminder run failed");
      this.emit();
    } finally {
      this.running.delete(id);
    }
  }

  private async findRemoteReply(reminder: LarkReminder): Promise<LarkReminderReply | null> {
    if (!this.adapter.listChatMessages) return null;
    const since = Date.parse(reminder.lastSentAt ?? reminder.startedAt ?? reminder.createdAt);
    if (!Number.isFinite(since)) return null;
    const config = this.requireBotConfig(reminder.botId);
    const messages = await this.adapter.listChatMessages(config, reminder.chatId, {
      startTime: Math.floor(since / 1000),
      pageSize: 100,
    });
    for (const rawMessage of messages) {
      const message = parseApiMessage(rawMessage);
      if (
        !message?.openId ||
        !isHumanSender(message.senderType) ||
        !message.text ||
        !reminder.targetOpenIds.includes(message.openId) ||
        !this.isAfterStart(reminder, message.createTime ?? 0)
      ) {
        continue;
      }
      return {
        messageId: message.messageId,
        openId: message.openId,
        displayName: message.displayName,
        text: message.text,
        repliedAt: new Date(message.createTime ?? this.now().getTime()).toISOString(),
      };
    }
    return null;
  }

  private async send(config: StoredLarkChannelConfig, reminder: LarkReminder): Promise<void> {
    const text = reminderText(reminder);
    if (reminder.sender.type === "bot") {
      await this.adapter.sendText(config, reminder.chatId, text);
      return;
    }
    const token = this.env[reminder.sender.userAccessTokenEnv]?.trim();
    if (!token) {
      throw new Error(
        `Lark user access token is missing from environment variable ${reminder.sender.userAccessTokenEnv}`,
      );
    }
    if (!this.adapter.sendTextAsUser) {
      throw new Error("Lark user identity sending is not supported by this host");
    }
    await this.adapter.sendTextAsUser(config, reminder.chatId, text, token);
  }

  private completeFromReply(reminder: LarkReminder, reply: LarkReminderReply): void {
    this.cancelTimer(reminder.id);
    const now = this.now().toISOString();
    this.store.update(reminder.id, (current) => ({
      ...current,
      status: "completed",
      completedAt: reply.repliedAt,
      nextRunAt: null,
      reply,
      lastError: null,
      updatedAt: now,
    }));
    this.emit();
  }

  private requireBotConfig(botId: string): StoredLarkChannelConfig {
    const bot = this.channelStore.getBot(botId);
    if (!bot) throw new Error(`Lark bot not found: ${botId}`);
    if (!bot.config.enabled) throw new Error(`Lark bot is disabled: ${botId}`);
    if (!bot.config.appId || !bot.config.appSecret) {
      throw new Error(`Lark bot credentials are incomplete: ${botId}`);
    }
    return bot.config;
  }

  private validateSender(sender: LarkReminder["sender"]): void {
    if (sender.type !== "user") return;
    const token = this.env[sender.userAccessTokenEnv]?.trim();
    if (!token) {
      throw new Error(
        `Lark user access token is missing from environment variable ${sender.userAccessTokenEnv}`,
      );
    }
  }

  private isAfterStart(reminder: LarkReminder, timestamp: number): boolean {
    const startedAt = Date.parse(reminder.startedAt ?? reminder.createdAt);
    return Number.isFinite(startedAt) && timestamp >= startedAt;
  }

  private cancelTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  private emit(): void {
    this.emitChanged(this.store.list());
  }
}
