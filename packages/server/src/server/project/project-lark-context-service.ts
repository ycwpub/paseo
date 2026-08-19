import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type pino from "pino";
import type { PaseoProjectLarkGroup } from "@getpaseo/protocol/paseo-config-schema";
import { writeJsonFileAtomic } from "../atomic-file.js";
import type {
  LarkChannelClientAdapter,
  LarkChatMessageListOptions,
} from "../channels/lark/lark-client-adapter.js";
import type { LarkChannelStore } from "../channels/lark/lark-channel-store.js";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import type { PersistedProjectRecord, ProjectRegistry } from "../workspace-registry.js";
import { readProjectConfigForProject } from "./project-config-storage.js";
import {
  ProjectLarkContextSnapshotSchema,
  readProjectLarkContextSnapshots,
  resolveProjectLarkContextDirectory,
  type ProjectLarkContextMessage,
  type ProjectLarkContextSnapshot,
} from "./project-lark-context.js";

const DEFAULT_MESSAGE_LIMIT = 50;
const SYNC_INTERVAL_MS = 60_000;
const MAX_MESSAGE_TEXT_CHARS = 8_000;

interface ActiveBinding {
  projectId: string;
  binding: PaseoProjectLarkGroup;
}

function snapshotFileName(bindingId: string): string {
  return `${createHash("sha256").update(bindingId).digest("hex").slice(0, 24)}.json`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordString(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function recordNumber(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = record?.[key];
    let parsed = NaN;
    if (typeof value === "number") {
      parsed = value;
    } else if (typeof value === "string") {
      parsed = Number(value);
    }
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseTextContent(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = asRecord(JSON.parse(raw) as unknown);
    return recordString(parsed, "text");
  } catch {
    return raw.trim() || null;
  }
}

function normalizeApiMessage(value: unknown): ProjectLarkContextMessage | null {
  const message = asRecord(value);
  if (!message) return null;
  const messageType = recordString(message, "msg_type", "message_type", "messageType");
  if (messageType && messageType !== "text") return null;
  const body = asRecord(message.body);
  const text = parseTextContent(recordString(body, "content") ?? recordString(message, "content"));
  const messageId = recordString(message, "message_id", "messageId");
  if (!messageId || !text) return null;
  const sender = asRecord(message.sender);
  const senderId = asRecord(sender?.sender_id) ?? asRecord(sender?.senderId);
  const rawSenderId = recordString(sender, "id");
  return {
    messageId,
    threadId: recordString(message, "thread_id", "threadId"),
    senderId: recordString(senderId, "open_id", "openId", "user_id", "userId") ?? rawSenderId,
    senderType: recordString(sender, "sender_type", "senderType"),
    senderName:
      recordString(message, "sender_name", "senderName") ??
      recordString(sender, "sender_name", "senderName", "name") ??
      "飞书用户",
    text: text.slice(0, MAX_MESSAGE_TEXT_CHARS),
    createTime: recordNumber(message, "create_time", "createTime"),
  };
}

function eventToMessage(event: NormalizedLarkMessageEvent): ProjectLarkContextMessage {
  return {
    messageId: event.messageId,
    threadId: event.threadId,
    senderId: event.openId ?? event.unionId,
    senderType: event.senderType ?? null,
    senderName: event.displayName || "飞书用户",
    text: event.text.slice(0, MAX_MESSAGE_TEXT_CHARS),
    createTime: event.createTime,
  };
}

function mergeMessages(
  existing: readonly ProjectLarkContextMessage[],
  incoming: readonly ProjectLarkContextMessage[],
  limit: number,
): ProjectLarkContextMessage[] {
  const byId = new Map<string, ProjectLarkContextMessage>();
  for (const message of [...existing, ...incoming]) {
    byId.set(message.messageId, message);
  }
  return [...byId.values()]
    .sort((left, right) => {
      const timeDelta = (left.createTime ?? 0) - (right.createTime ?? 0);
      return timeDelta !== 0 ? timeDelta : left.messageId.localeCompare(right.messageId);
    })
    .slice(-limit);
}

export class ProjectLarkContextService {
  private readonly paseoHome: string;
  private readonly projectRegistry: Pick<ProjectRegistry, "list">;
  private readonly channelStore: Pick<LarkChannelStore, "getBot">;
  private readonly adapter: LarkChannelClientAdapter;
  private readonly logger: pino.Logger;
  private readonly bindingsByRoute = new Map<string, ActiveBinding[]>();
  private readonly writeQueues = new Map<string, Promise<void>>();
  private timer: NodeJS.Timeout | null = null;
  private syncPromise: Promise<void> | null = null;

  constructor(options: {
    paseoHome: string;
    projectRegistry: Pick<ProjectRegistry, "list">;
    channelStore: Pick<LarkChannelStore, "getBot">;
    adapter: LarkChannelClientAdapter;
    logger: pino.Logger;
  }) {
    this.paseoHome = options.paseoHome;
    this.projectRegistry = options.projectRegistry;
    this.channelStore = options.channelStore;
    this.adapter = options.adapter;
    this.logger = options.logger.child({ module: "project-lark-context-service" });
  }

  async start(): Promise<void> {
    if (this.timer) return;
    void this.syncAllProjects();
    this.timer = setInterval(() => {
      void this.syncAllProjects();
    }, SYNC_INTERVAL_MS);
    this.timer.unref?.();
  }

  async syncNow(): Promise<void> {
    await this.syncAllProjects();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.syncPromise;
    await Promise.all(this.writeQueues.values());
  }

  async observeIncomingMessage(botId: string, event: NormalizedLarkMessageEvent): Promise<void> {
    const bindings = this.bindingsByRoute.get(this.routeKey(botId, event.chatId)) ?? [];
    await Promise.all(
      bindings.map(({ projectId, binding }) =>
        this.updateSnapshot(projectId, binding, (snapshot) => ({
          ...snapshot,
          messages: mergeMessages(
            snapshot.messages,
            [eventToMessage(event)],
            binding.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
          ),
          lastSyncedAt: new Date().toISOString(),
          error: null,
        })),
      ),
    );
  }

  private async syncAllProjects(): Promise<void> {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.performSyncAllProjects().finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async performSyncAllProjects(): Promise<void> {
    const projects = (await this.projectRegistry.list()).filter(
      (project) => project.archivedAt === null,
    );
    const activeBindings: ActiveBinding[] = [];
    for (const project of projects) {
      const bindings = this.readBindings(project);
      activeBindings.push(
        ...bindings
          .filter((binding) => binding.enabled !== false)
          .map((binding) => ({ projectId: project.projectId, binding })),
      );
      await this.removeStaleSnapshots(
        project.projectId,
        new Set(bindings.filter((binding) => binding.enabled !== false).map((entry) => entry.id)),
      );
    }
    this.rebuildRouteIndex(activeBindings);
    await Promise.all(
      activeBindings.map(({ projectId, binding }) => this.syncBinding(projectId, binding)),
    );
  }

  private readBindings(project: PersistedProjectRecord): PaseoProjectLarkGroup[] {
    const result = readProjectConfigForProject({
      paseoHome: this.paseoHome,
      project,
    });
    if (!result.ok || !result.config?.project?.larkGroups) return [];
    return result.config.project.larkGroups;
  }

  private async syncBinding(projectId: string, binding: PaseoProjectLarkGroup): Promise<void> {
    try {
      const bot = this.channelStore.getBot(binding.botId);
      if (!bot) throw new Error(`未找到飞书机器人：${binding.botId}`);
      const appId = bot.config.appId?.trim();
      if (!appId || !bot.config.appSecret?.trim()) {
        throw new Error("飞书机器人缺少 App ID 或 App Secret");
      }
      const options: LarkChatMessageListOptions = {
        pageSize: binding.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
      };
      let history: unknown[] = [];
      if (this.adapter.listChatMessages) {
        try {
          history = await this.adapter.listChatMessages(bot.config, binding.chatId, options);
        } catch {
          if (!this.adapter.addBotToChat) {
            throw new Error("当前飞书适配器不支持自动邀请机器人入群");
          }
          await this.adapter.addBotToChat(bot.config, binding.chatId, appId);
          history = await this.adapter.listChatMessages(bot.config, binding.chatId, options);
        }
      } else {
        if (!this.adapter.addBotToChat) {
          throw new Error("当前飞书适配器不支持自动邀请机器人入群");
        }
        await this.adapter.addBotToChat(bot.config, binding.chatId, appId);
      }
      const messages = history
        .map(normalizeApiMessage)
        .filter((message): message is ProjectLarkContextMessage => message !== null);
      await this.updateSnapshot(projectId, binding, (snapshot) => ({
        ...snapshot,
        messages: mergeMessages(
          snapshot.messages,
          messages,
          binding.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
        ),
        lastSyncedAt: new Date().toISOString(),
        error: null,
      }));
    } catch (error) {
      this.logger.warn(
        { err: error, projectId, bindingId: binding.id, chatId: binding.chatId },
        "Failed to synchronize Project Lark context",
      );
      await this.updateSnapshot(projectId, binding, (snapshot) => ({
        ...snapshot,
        error: errorMessage(error),
      }));
    }
  }

  private rebuildRouteIndex(bindings: readonly ActiveBinding[]): void {
    this.bindingsByRoute.clear();
    for (const active of bindings) {
      const key = this.routeKey(active.binding.botId, active.binding.chatId);
      const current = this.bindingsByRoute.get(key) ?? [];
      current.push(active);
      this.bindingsByRoute.set(key, current);
    }
  }

  private routeKey(botId: string, chatId: string): string {
    return `${botId}\u0000${chatId}`;
  }

  private snapshotPath(projectId: string, bindingId: string): string {
    return path.join(
      resolveProjectLarkContextDirectory(this.paseoHome, projectId),
      snapshotFileName(bindingId),
    );
  }

  private async updateSnapshot(
    projectId: string,
    binding: PaseoProjectLarkGroup,
    updater: (snapshot: ProjectLarkContextSnapshot) => ProjectLarkContextSnapshot,
  ): Promise<void> {
    const filePath = this.snapshotPath(projectId, binding.id);
    const previous = this.writeQueues.get(filePath) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const existing = readProjectLarkContextSnapshots(this.paseoHome, projectId).find(
          (snapshot) => snapshot.bindingId === binding.id,
        ) ?? {
          version: 1 as const,
          projectId,
          bindingId: binding.id,
          botId: binding.botId,
          chatId: binding.chatId,
          messages: [],
          lastSyncedAt: null,
          error: null,
        };
        const snapshot = ProjectLarkContextSnapshotSchema.parse(
          updater({
            ...existing,
            botId: binding.botId,
            chatId: binding.chatId,
          }),
        );
        await writeJsonFileAtomic(filePath, snapshot);
        return undefined;
      });
    this.writeQueues.set(filePath, next);
    try {
      await next;
    } finally {
      if (this.writeQueues.get(filePath) === next) this.writeQueues.delete(filePath);
    }
  }

  private async removeStaleSnapshots(
    projectId: string,
    activeBindingIds: Set<string>,
  ): Promise<void> {
    const directory = resolveProjectLarkContextDirectory(this.paseoHome, projectId);
    const snapshots = readProjectLarkContextSnapshots(this.paseoHome, projectId);
    await Promise.all(
      snapshots
        .filter((snapshot) => !activeBindingIds.has(snapshot.bindingId))
        .map((snapshot) =>
          fs.rm(path.join(directory, snapshotFileName(snapshot.bindingId)), { force: true }),
        ),
    );
  }
}
