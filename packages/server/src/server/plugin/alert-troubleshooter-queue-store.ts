import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  AlertTroubleshooterTaskSchema,
  type AlertTroubleshooterTask,
  type AlertTroubleshooterTaskTrigger,
} from "@getpaseo/protocol/messages";

export type AlertTroubleshooterQueueTrigger = AlertTroubleshooterTaskTrigger;

const LegacyQueueItemSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  messageId: z.string().nullable(),
  trigger: z.enum(["message", "schedule", "table", "manual"]),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  attempts: z.number().int().nonnegative(),
  queuedAt: z.string(),
  updatedAt: z.string(),
  agentId: z.string().nullable(),
  error: z.string().nullable(),
});
export type AlertTroubleshooterQueueItem = AlertTroubleshooterTask;

const QueueFileSchema = z.object({
  version: z.literal(2),
  items: z.array(AlertTroubleshooterTaskSchema),
});

const LegacyQueueFileSchema = z.object({
  version: z.literal(1),
  items: z.array(LegacyQueueItemSchema),
});

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
}

function cloneTask(task: AlertTroubleshooterQueueItem): AlertTroubleshooterQueueItem {
  return AlertTroubleshooterTaskSchema.parse(task);
}

export class AlertTroubleshooterQueueStore {
  private readonly recoveredProjects = new Set<string>();

  constructor(
    private readonly paseoHome: string,
    private readonly pluginId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  enqueue(
    projectId: string,
    input: {
      recordId: string;
      uniqueId?: string;
      resultId?: string | null;
      tableDate?: string;
      messageId?: string | null;
      trigger: AlertTroubleshooterQueueTrigger;
      matchedCount?: number;
      force?: boolean;
    },
  ): AlertTroubleshooterQueueItem {
    const state = this.read(projectId);
    if (!input.force) {
      const existing = state.items.find(
        (item) =>
          item.recordId === input.recordId &&
          (item.status === "queued" || item.status === "running" || item.status === "succeeded"),
      );
      if (existing) return existing;
    }
    const timestamp = this.now().toISOString();
    const item = AlertTroubleshooterTaskSchema.parse({
      id: randomUUID(),
      recordId: input.recordId,
      uniqueId: input.uniqueId ?? `record_id:${input.recordId}`,
      resultId: input.resultId ?? null,
      tableDate: input.tableDate ?? this.now().toISOString().slice(0, 10).replaceAll("-", ""),
      messageId: input.messageId ?? null,
      trigger: input.trigger,
      status: "queued",
      matchedCount: input.matchedCount ?? 1,
      attempts: 0,
      queuedAt: timestamp,
      updatedAt: timestamp,
      agentId: null,
      error: null,
    });
    state.items.push(item);
    this.write(projectId, state);
    return item;
  }

  recordFailure(
    projectId: string,
    input: {
      uniqueId: string;
      resultId?: string | null;
      messageId?: string | null;
      trigger: AlertTroubleshooterQueueTrigger;
      matchedCount?: number;
      error: string;
    },
  ): AlertTroubleshooterQueueItem {
    const timestamp = this.now().toISOString();
    const item = AlertTroubleshooterTaskSchema.parse({
      id: randomUUID(),
      recordId: `failed:${randomUUID()}`,
      uniqueId: input.uniqueId,
      resultId: input.resultId ?? null,
      tableDate: timestamp.slice(0, 10).replaceAll("-", ""),
      messageId: input.messageId ?? null,
      trigger: input.trigger,
      status: "failed",
      matchedCount: input.matchedCount ?? 1,
      attempts: 0,
      queuedAt: timestamp,
      updatedAt: timestamp,
      agentId: null,
      error: input.error,
    });
    const state = this.read(projectId);
    state.items.push(item);
    this.write(projectId, state);
    return item;
  }

  claimNext(
    projectId: string,
    options?: { trigger?: AlertTroubleshooterQueueTrigger },
  ): AlertTroubleshooterQueueItem | null {
    const state = this.read(projectId);
    const item = state.items.find(
      (candidate) =>
        candidate.status === "queued" &&
        (options?.trigger === undefined || candidate.trigger === options.trigger),
    );
    if (!item) return null;
    item.status = "running";
    item.attempts += 1;
    item.updatedAt = this.now().toISOString();
    item.error = null;
    this.write(projectId, state);
    return { ...item };
  }

  complete(projectId: string, itemId: string, agentId: string): void {
    this.patch(projectId, itemId, {
      status: "succeeded",
      agentId,
      error: null,
    });
  }

  fail(projectId: string, itemId: string, error: string): void {
    this.patch(projectId, itemId, {
      status: "failed",
      error,
    });
  }

  countQueued(projectId: string): number {
    return this.read(projectId).items.filter((item) => item.status === "queued").length;
  }

  list(projectId: string): AlertTroubleshooterQueueItem[] {
    return this.read(projectId)
      .items.map(cloneTask)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  get(projectId: string, itemId: string): AlertTroubleshooterQueueItem | null {
    const item = this.read(projectId).items.find((candidate) => candidate.id === itemId);
    return item ? { ...item } : null;
  }

  attachAgent(projectId: string, itemId: string, agentId: string): void {
    this.patch(projectId, itemId, { status: "running", agentId, error: null });
  }

  pause(projectId: string, taskIds: readonly string[]): AlertTroubleshooterQueueItem[] {
    const state = this.read(projectId);
    const requested = new Set(taskIds);
    const updatedAt = this.now().toISOString();
    let changed = false;
    for (const item of state.items) {
      if (!requested.has(item.id) || (item.status !== "queued" && item.status !== "running")) {
        continue;
      }
      item.status = "paused";
      item.updatedAt = updatedAt;
      changed = true;
    }
    if (changed) this.write(projectId, state);
    return state.items
      .filter((item) => requested.has(item.id) && item.status === "paused")
      .map(cloneTask);
  }

  deleteMany(projectId: string, taskIds: readonly string[]): AlertTroubleshooterQueueItem[] {
    const state = this.read(projectId);
    const requested = new Set(taskIds);
    const deleted = state.items.filter((item) => requested.has(item.id)).map(cloneTask);
    if (deleted.length === 0) return [];
    state.items = state.items.filter((item) => !requested.has(item.id));
    this.write(projectId, state);
    return deleted;
  }

  private patch(
    projectId: string,
    itemId: string,
    patch: Partial<Pick<AlertTroubleshooterQueueItem, "status" | "error" | "agentId">>,
  ): void {
    const state = this.read(projectId);
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item || item.status === "paused") return;
    Object.assign(item, patch, { updatedAt: this.now().toISOString() });
    this.write(projectId, state);
  }

  private filePath(projectId: string): string {
    return path.join(
      this.paseoHome,
      "projects",
      safeSegment(projectId),
      "plugin-data",
      safeSegment(this.pluginId),
      "alert-queue.json",
    );
  }

  private read(projectId: string): z.infer<typeof QueueFileSchema> {
    const filePath = this.filePath(projectId);
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      const current = QueueFileSchema.safeParse(raw);
      const parsed = current.success ? current.data : this.migrateLegacy(raw);
      if (!this.recoveredProjects.has(projectId)) {
        this.recoveredProjects.add(projectId);
        let changed = false;
        for (const item of parsed.items) {
          if (item.status !== "running") continue;
          item.status = "queued";
          item.updatedAt = this.now().toISOString();
          changed = true;
        }
        if (changed) this.write(projectId, parsed);
      }
      return parsed;
    } catch {
      this.recoveredProjects.add(projectId);
      return { version: 2, items: [] };
    }
  }

  private migrateLegacy(raw: unknown): z.infer<typeof QueueFileSchema> {
    const legacy = LegacyQueueFileSchema.parse(raw);
    const items = legacy.items.map((item) =>
      AlertTroubleshooterTaskSchema.parse({
        ...item,
        uniqueId: `record_id:${item.recordId}`,
        resultId: null,
        tableDate: item.queuedAt.slice(0, 10).replaceAll("-", ""),
        matchedCount: 1,
      }),
    );
    return { version: 2, items };
  }

  private write(projectId: string, state: z.infer<typeof QueueFileSchema>): void {
    const filePath = this.filePath(projectId);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(QueueFileSchema.parse(state), null, 2)}\n`,
      "utf8",
    );
    renameSync(temporaryPath, filePath);
  }
}
