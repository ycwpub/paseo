import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  LarkGroupMessageProcessorTaskSchema,
  type LarkGroupMessageProcessorTask,
  type LarkGroupMessageProcessorTaskFailureStage,
  type LarkGroupMessageProcessorTaskSource,
  type LarkGroupMessageProcessorTaskStatus,
} from "@getpaseo/protocol/messages";

import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";

const STORE_VERSION = 1;
const MAX_STORED_TASKS = 2_000;
const PayloadSchema = z.object({
  version: z.literal(STORE_VERSION),
  tasks: z.array(LarkGroupMessageProcessorTaskSchema),
});
type Payload = z.infer<typeof PayloadSchema>;

export interface EnqueueLarkGroupMessageProcessorTaskInput {
  processorId: string;
  processorName: string;
  botId: string;
  source: LarkGroupMessageProcessorTaskSource;
  chatId: string;
  chatName: string | null;
  messageId: string;
  senderOpenId: string | null;
  senderName: string | null;
  content: string;
  scheduledAt: string | null;
}

function cloneTask(task: LarkGroupMessageProcessorTask): LarkGroupMessageProcessorTask {
  return LarkGroupMessageProcessorTaskSchema.parse(JSON.parse(JSON.stringify(task)));
}

export class LarkGroupMessageProcessorTaskStore {
  private readonly filePath: string;
  private loaded = false;
  private payload: Payload = { version: STORE_VERSION, tasks: [] };

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "channels", "lark-group-processor-tasks.json");
  }

  list(processorId?: string): LarkGroupMessageProcessorTask[] {
    this.ensureLoaded();
    return this.payload.tasks
      .filter((task) => !processorId || task.processorId === processorId)
      .map(cloneTask)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  get(taskId: string): LarkGroupMessageProcessorTask | null {
    this.ensureLoaded();
    const task = this.payload.tasks.find((entry) => entry.id === taskId);
    return task ? cloneTask(task) : null;
  }

  hasMessage(processorId: string, messageId: string): boolean {
    this.ensureLoaded();
    return this.payload.tasks.some(
      (task) => task.processorId === processorId && task.messageId === messageId,
    );
  }

  enqueue(
    input: EnqueueLarkGroupMessageProcessorTaskInput,
    now: string,
  ): LarkGroupMessageProcessorTask {
    this.ensureLoaded();
    const existing = this.payload.tasks.find(
      (task) => task.processorId === input.processorId && task.messageId === input.messageId,
    );
    if (existing) return cloneTask(existing);
    const task = LarkGroupMessageProcessorTaskSchema.parse({
      ...input,
      id: randomUUID(),
      status: "pending",
      startedAt: null,
      completedAt: null,
      agentId: null,
      error: null,
      failureStage: null,
      createdAt: now,
      updatedAt: now,
    });
    this.persist([...this.payload.tasks, task]);
    return cloneTask(task);
  }

  markRunning(taskId: string, now: string): LarkGroupMessageProcessorTask | null {
    return this.update(taskId, {
      status: "running",
      startedAt: now,
      completedAt: null,
      error: null,
      failureStage: null,
      updatedAt: now,
    });
  }

  attachAgent(taskId: string, agentId: string, now: string): LarkGroupMessageProcessorTask | null {
    return this.update(taskId, { agentId, updatedAt: now });
  }

  markCompleted(
    taskId: string,
    status: Extract<LarkGroupMessageProcessorTaskStatus, "completed" | "skipped" | "failed">,
    now: string,
    error: string | null = null,
    failureStage: LarkGroupMessageProcessorTaskFailureStage | null = null,
  ): LarkGroupMessageProcessorTask | null {
    return this.update(taskId, {
      status,
      completedAt: now,
      error,
      failureStage: status === "failed" ? (failureStage ?? "processing") : null,
      updatedAt: now,
    });
  }

  pause(taskIds: readonly string[], now: string): string[] {
    this.ensureLoaded();
    const requested = new Set(taskIds);
    const pausedTaskIds: string[] = [];
    const tasks = this.payload.tasks.map((task) => {
      if (!requested.has(task.id) || task.status !== "pending") return task;
      pausedTaskIds.push(task.id);
      return LarkGroupMessageProcessorTaskSchema.parse({
        ...task,
        status: "paused",
        scheduledAt: null,
        updatedAt: now,
      });
    });
    if (pausedTaskIds.length > 0) this.persist(tasks);
    return pausedTaskIds;
  }

  pausePendingForProcessor(processorId: string, now: string): string[] {
    this.ensureLoaded();
    return this.pause(
      this.payload.tasks
        .filter((task) => task.processorId === processorId && task.status === "pending")
        .map((task) => task.id),
      now,
    );
  }

  resetFailedForRetry(taskIds: readonly string[], now: string): string[] {
    this.ensureLoaded();
    const requested = new Set(taskIds);
    const retriedTaskIds: string[] = [];
    const tasks = this.payload.tasks.map((task) => {
      if (!requested.has(task.id) || task.status !== "failed") return task;
      retriedTaskIds.push(task.id);
      return LarkGroupMessageProcessorTaskSchema.parse({
        ...task,
        status: "pending",
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        agentId: null,
        error: null,
        failureStage: null,
        updatedAt: now,
      });
    });
    if (retriedTaskIds.length > 0) this.persist(tasks);
    return retriedTaskIds;
  }

  deleteMany(taskIds: readonly string[]): string[] {
    this.ensureLoaded();
    const requested = new Set(taskIds);
    const deletedTaskIds = this.payload.tasks
      .filter((task) => requested.has(task.id))
      .map((task) => task.id);
    if (deletedTaskIds.length > 0) {
      this.persist(this.payload.tasks.filter((task) => !requested.has(task.id)));
    }
    return deletedTaskIds;
  }

  private update(
    taskId: string,
    patch: Partial<LarkGroupMessageProcessorTask>,
  ): LarkGroupMessageProcessorTask | null {
    this.ensureLoaded();
    const index = this.payload.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return null;
    const updated = LarkGroupMessageProcessorTaskSchema.parse({
      ...this.payload.tasks[index],
      ...patch,
    });
    const tasks = [...this.payload.tasks];
    tasks[index] = updated;
    this.persist(tasks);
    return cloneTask(updated);
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (existsSync(this.filePath)) {
      ensurePrivateFile(this.filePath);
      const parsed = PayloadSchema.parse(
        JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
      );
      const now = new Date().toISOString();
      const tasks = parsed.tasks.map((task) =>
        task.status === "pending" || task.status === "running"
          ? LarkGroupMessageProcessorTaskSchema.parse({
              ...task,
              status: "failed",
              completedAt: now,
              error: "Paseo daemon 重启前任务未完成",
              failureStage: "processing",
              updatedAt: now,
            })
          : task,
      );
      this.payload = { version: STORE_VERSION, tasks };
      if (tasks.some((task, index) => task !== parsed.tasks[index])) this.persist(tasks);
    }
    this.loaded = true;
  }

  private persist(tasks: LarkGroupMessageProcessorTask[]): void {
    const limited = [...tasks]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(-MAX_STORED_TASKS);
    const payload = PayloadSchema.parse({ version: STORE_VERSION, tasks: limited });
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(payload, null, 2));
    this.payload = payload;
    this.loaded = true;
  }
}
