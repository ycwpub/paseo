import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export type AlertTroubleshooterQueueTrigger = "message" | "schedule" | "table" | "manual";

const QueueItemSchema = z.object({
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
export type AlertTroubleshooterQueueItem = z.infer<typeof QueueItemSchema>;

const QueueFileSchema = z.object({
  version: z.literal(1),
  items: z.array(QueueItemSchema),
});

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
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
      messageId?: string | null;
      trigger: AlertTroubleshooterQueueTrigger;
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
    const item = QueueItemSchema.parse({
      id: randomUUID(),
      recordId: input.recordId,
      messageId: input.messageId ?? null,
      trigger: input.trigger,
      status: "queued",
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

  private patch(
    projectId: string,
    itemId: string,
    patch: Pick<AlertTroubleshooterQueueItem, "status" | "error"> &
      Partial<Pick<AlertTroubleshooterQueueItem, "agentId">>,
  ): void {
    const state = this.read(projectId);
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
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
      const parsed = QueueFileSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
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
      return { version: 1, items: [] };
    }
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
