import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  type AlertTroubleshooterRunReport,
  AlertTroubleshooterTaskSchema,
  type AlertTroubleshooterTask,
  type AlertTroubleshooterTaskTrigger,
} from "@getpaseo/protocol/messages";
import {
  isAlertTroubleshooterRetryDue,
  nextAlertTroubleshooterRetryAt,
} from "./alert-troubleshooter-retry-policy.js";
import { localAlertTroubleshooterRecordId } from "./alert-troubleshooter-task-reference.js";

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
      const existing = state.items.find((item) => item.recordId === input.recordId);
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
      nextRetryAt: null,
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
      recordId: localAlertTroubleshooterRecordId(input.uniqueId),
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
      nextRetryAt: null,
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
    options?: {
      trigger?: AlertTroubleshooterQueueTrigger;
      maxAutomaticRetries?: number;
    },
  ): AlertTroubleshooterQueueItem | null {
    const state = this.read(projectId);
    const item = state.items.find(
      (candidate) =>
        candidate.status === "queued" &&
        candidate.attempts <= (options?.maxAutomaticRetries ?? 0) &&
        (options?.trigger === undefined || candidate.trigger === options.trigger),
    );
    if (!item) return null;
    item.status = "running";
    item.attempts += 1;
    item.updatedAt = this.now().toISOString();
    item.nextRetryAt = null;
    item.retryStopped = false;
    item.error = null;
    this.write(projectId, state);
    return { ...item };
  }

  complete(
    projectId: string,
    itemId: string,
    agentId: string | null,
    status: "succeeded" | "pending" | "not_support" = "succeeded",
    warning?: string,
    report?: AlertTroubleshooterRunReport,
  ): void {
    this.patch(projectId, itemId, {
      status,
      agentId,
      nextRetryAt: null,
      error: warning?.trim() || null,
      report,
    });
  }

  fail(
    projectId: string,
    itemId: string,
    error: string,
    retry: { intervalMinutes: number; maxAutomaticRetries: number },
  ): AlertTroubleshooterQueueItem | null {
    const state = this.read(projectId);
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item || item.status === "paused") return null;
    const failedAt = this.now();
    item.status = "failed";
    item.updatedAt = failedAt.toISOString();
    item.retryStopped = false;
    item.nextRetryAt = nextAlertTroubleshooterRetryAt({
      failedAt,
      attempts: item.attempts,
      intervalMinutes: retry.intervalMinutes,
      maxAutomaticRetries: retry.maxAutomaticRetries,
    });
    item.error = error;
    this.write(projectId, state);
    return cloneTask(item);
  }

  stopRetry(projectId: string, itemId: string, error: string): void {
    this.patch(projectId, itemId, {
      status: "failed",
      nextRetryAt: null,
      retryStopped: true,
      error,
    });
  }

  promoteDueRetries(
    projectId: string,
    retry: { intervalMinutes: number; maxAutomaticRetries: number },
  ): number {
    const state = this.read(projectId);
    const now = this.now();
    let promoted = 0;
    let changed = false;
    for (const item of state.items) {
      if (item.status === "queued" && item.attempts > retry.maxAutomaticRetries) {
        item.status = "failed";
        item.updatedAt = now.toISOString();
        item.nextRetryAt = null;
        item.error ??= `已达到自动重试上限（${retry.maxAutomaticRetries} 次）`;
        changed = true;
        continue;
      }
      if (item.status !== "failed") continue;
      if (item.retryStopped) {
        if (item.nextRetryAt !== null) {
          item.nextRetryAt = null;
          changed = true;
        }
        continue;
      }
      const failedAt = new Date(item.updatedAt);
      const nextRetryAt = Number.isFinite(failedAt.getTime())
        ? nextAlertTroubleshooterRetryAt({
            failedAt,
            attempts: item.attempts,
            intervalMinutes: retry.intervalMinutes,
            maxAutomaticRetries: retry.maxAutomaticRetries,
          })
        : null;
      if (item.nextRetryAt !== nextRetryAt) {
        item.nextRetryAt = nextRetryAt;
        changed = true;
      }
      if (!isAlertTroubleshooterRetryDue(nextRetryAt, now)) continue;
      item.status = "queued";
      item.updatedAt = now.toISOString();
      item.nextRetryAt = null;
      promoted += 1;
      changed = true;
    }
    if (changed) this.write(projectId, state);
    return promoted;
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

  replaceRecordReference(
    projectId: string,
    itemId: string,
    input: {
      recordId: string;
      uniqueId: string;
      resultId: string | null;
      tableDate: string;
      messageId: string | null;
    },
  ): AlertTroubleshooterQueueItem | null {
    const state = this.read(projectId);
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    Object.assign(item, input, { updatedAt: this.now().toISOString() });
    this.write(projectId, state);
    return cloneTask(item);
  }

  pause(projectId: string, taskIds: readonly string[]): AlertTroubleshooterQueueItem[] {
    const state = this.read(projectId);
    const requested = new Set(taskIds);
    const updatedAt = this.now().toISOString();
    let changed = false;
    for (const item of state.items) {
      if (
        !requested.has(item.id) ||
        (item.status !== "queued" && item.status !== "running" && !item.nextRetryAt)
      ) {
        continue;
      }
      item.status = "paused";
      item.updatedAt = updatedAt;
      item.nextRetryAt = null;
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
    patch: Partial<
      Pick<
        AlertTroubleshooterQueueItem,
        "status" | "error" | "agentId" | "nextRetryAt" | "retryStopped" | "report"
      >
    >,
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
