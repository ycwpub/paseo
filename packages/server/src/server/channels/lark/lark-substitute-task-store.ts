import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  LarkSubstituteTaskSchema,
  type LarkSubstituteTask,
  type LarkSubstituteTaskFailureStage,
  type LarkSubstituteTaskSource,
  type LarkSubstituteTaskStatus,
} from "@getpaseo/protocol/messages";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";

const LARK_SUBSTITUTE_TASK_STORE_VERSION = 1;
const MAX_STORED_TASKS = 2_000;

const LarkSubstituteTaskStorePayloadSchema = z.object({
  version: z.literal(LARK_SUBSTITUTE_TASK_STORE_VERSION),
  tasks: z.array(LarkSubstituteTaskSchema),
});

type LarkSubstituteTaskStorePayload = z.infer<typeof LarkSubstituteTaskStorePayloadSchema>;

export interface EnqueueLarkSubstituteTaskInput {
  modeId: string;
  modeName: string;
  botId: string;
  source: LarkSubstituteTaskSource;
  chatId: string;
  chatName: string | null;
  messageId: string;
  senderOpenId: string | null;
  senderName: string | null;
  content: string;
  scheduledAt: string | null;
}

export interface RecordLarkSubstituteTaskFailureInput {
  modeId: string;
  modeName: string;
  botId: string;
  source: LarkSubstituteTaskSource;
  stage: LarkSubstituteTaskFailureStage;
  chatId?: string | null;
  chatName?: string | null;
  messageId?: string | null;
  senderOpenId?: string | null;
  senderName?: string | null;
  content?: string | null;
  error: string;
}

function cloneTask(task: LarkSubstituteTask): LarkSubstituteTask {
  return LarkSubstituteTaskSchema.parse(JSON.parse(JSON.stringify(task)));
}

export class LarkSubstituteTaskStore {
  private readonly filePath: string;
  private loaded = false;
  private payload: LarkSubstituteTaskStorePayload = {
    version: LARK_SUBSTITUTE_TASK_STORE_VERSION,
    tasks: [],
  };

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "channels", "lark-substitute-tasks.json");
  }

  list(): LarkSubstituteTask[] {
    this.ensureLoaded();
    return this.payload.tasks
      .map(cloneTask)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  get(taskId: string): LarkSubstituteTask | null {
    this.ensureLoaded();
    const task = this.payload.tasks.find((entry) => entry.id === taskId);
    return task ? cloneTask(task) : null;
  }

  hasMessage(modeId: string, messageId: string): boolean {
    this.ensureLoaded();
    return this.payload.tasks.some(
      (task) => task.modeId === modeId && task.messageId === messageId,
    );
  }

  enqueue(input: EnqueueLarkSubstituteTaskInput, now: string): LarkSubstituteTask {
    this.ensureLoaded();
    const existingIndex = this.payload.tasks.findIndex(
      (task) =>
        task.modeId === input.modeId &&
        task.chatId === input.chatId &&
        task.source === input.source &&
        task.status === "pending",
    );
    if (existingIndex >= 0) {
      const current = this.payload.tasks[existingIndex]!;
      const updated = LarkSubstituteTaskSchema.parse({
        ...current,
        ...input,
        failureStage: null,
        error: null,
        updatedAt: now,
      });
      const tasks = [...this.payload.tasks];
      tasks[existingIndex] = updated;
      this.persistTasks(tasks);
      return cloneTask(updated);
    }
    const task = LarkSubstituteTaskSchema.parse({
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
    this.persistTasks([...this.payload.tasks, task]);
    return cloneTask(task);
  }

  markRunning(taskId: string, now: string): LarkSubstituteTask | null {
    return this.updateStatus(taskId, "running", now, {
      startedAt: now,
      completedAt: null,
      error: null,
      failureStage: null,
    });
  }

  attachAgent(taskId: string, agentId: string, now: string): LarkSubstituteTask | null {
    return this.update(taskId, { agentId, updatedAt: now });
  }

  markCompleted(
    taskId: string,
    status: Extract<LarkSubstituteTaskStatus, "completed" | "skipped" | "failed">,
    now: string,
    error: string | null = null,
    failureStage: LarkSubstituteTaskFailureStage | null = null,
  ): LarkSubstituteTask | null {
    return this.updateStatus(taskId, status, now, {
      completedAt: now,
      error,
      failureStage: status === "failed" ? (failureStage ?? "processing") : null,
    });
  }

  recordOperationalFailure(
    input: RecordLarkSubstituteTaskFailureInput,
    now: string,
  ): LarkSubstituteTask {
    this.ensureLoaded();
    const chatId = input.chatId?.trim() || `${input.source}:${input.modeId}`;
    const messageId = input.messageId?.trim() || `${input.source}-failure:${input.stage}:${chatId}`;
    const messageTask = input.messageId
      ? this.payload.tasks.find(
          (task) => task.modeId === input.modeId && task.messageId === messageId,
        )
      : null;
    const existing =
      messageTask ??
      this.payload.tasks.find(
        (task) =>
          task.modeId === input.modeId &&
          task.source === input.source &&
          task.chatId === chatId &&
          task.failureStage === input.stage &&
          task.status === "failed",
      );
    if (existing) {
      const updated = this.update(existing.id, {
        modeName: input.modeName,
        botId: input.botId,
        messageId,
        chatName: input.chatName ?? existing.chatName,
        senderOpenId: input.senderOpenId ?? existing.senderOpenId,
        senderName: input.senderName ?? existing.senderName,
        content: input.content?.trim() || existing.content,
        status: "failed",
        scheduledAt: null,
        completedAt: now,
        error: input.error,
        failureStage: input.stage,
        updatedAt: now,
      });
      if (!updated) throw new Error(`无法更新替身失败任务 ${existing.id}`);
      return updated;
    }
    const task = LarkSubstituteTaskSchema.parse({
      id: randomUUID(),
      modeId: input.modeId,
      modeName: input.modeName,
      botId: input.botId,
      source: input.source,
      chatId,
      chatName: input.chatName ?? null,
      messageId,
      senderOpenId: input.senderOpenId ?? null,
      senderName: input.senderName ?? null,
      content: input.content?.trim() || this.failureContent(input.stage),
      status: "failed",
      scheduledAt: null,
      startedAt: null,
      completedAt: now,
      agentId: null,
      error: input.error,
      failureStage: input.stage,
      createdAt: now,
      updatedAt: now,
    });
    this.persistTasks([...this.payload.tasks, task]);
    return cloneTask(task);
  }

  recordPrivateScanFailure(
    input: Pick<EnqueueLarkSubstituteTaskInput, "modeId" | "modeName" | "botId">,
    now: string,
    error: string,
  ): LarkSubstituteTask {
    return this.recordOperationalFailure(
      {
        ...input,
        source: "private_scan",
        stage: "private_scan",
        chatId: `private-scan:${input.modeId}`,
        chatName: "授权用户私聊扫描",
        content: "扫描授权用户的新增私聊消息",
        error,
      },
      now,
    );
  }

  pause(taskIds: readonly string[], now: string): string[] {
    this.ensureLoaded();
    const requested = new Set(taskIds);
    const pausedTaskIds: string[] = [];
    const tasks = this.payload.tasks.map((task) => {
      if (!requested.has(task.id) || task.status !== "pending") return task;
      pausedTaskIds.push(task.id);
      return LarkSubstituteTaskSchema.parse({
        ...task,
        status: "paused",
        scheduledAt: null,
        updatedAt: now,
      });
    });
    if (pausedTaskIds.length > 0) this.persistTasks(tasks);
    return pausedTaskIds;
  }

  pausePendingForMode(modeId: string, now: string): string[] {
    this.ensureLoaded();
    return this.pause(
      this.payload.tasks
        .filter((task) => task.modeId === modeId && task.status === "pending")
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
      return LarkSubstituteTaskSchema.parse({
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
    if (retriedTaskIds.length > 0) this.persistTasks(tasks);
    return retriedTaskIds;
  }

  deleteMany(taskIds: readonly string[]): string[] {
    this.ensureLoaded();
    const requested = new Set(taskIds);
    const existing = new Set(this.payload.tasks.map((task) => task.id));
    const deletedTaskIds = taskIds.filter((taskId) => existing.has(taskId));
    if (deletedTaskIds.length === 0) return [];
    this.persistTasks(this.payload.tasks.filter((task) => !requested.has(task.id)));
    return deletedTaskIds;
  }

  private updateStatus(
    taskId: string,
    status: LarkSubstituteTaskStatus,
    now: string,
    patch: Partial<LarkSubstituteTask>,
  ): LarkSubstituteTask | null {
    return this.update(taskId, { ...patch, status, updatedAt: now });
  }

  private update(taskId: string, patch: Partial<LarkSubstituteTask>): LarkSubstituteTask | null {
    this.ensureLoaded();
    const index = this.payload.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return null;
    const updated = LarkSubstituteTaskSchema.parse({
      ...this.payload.tasks[index],
      ...patch,
    });
    const tasks = [...this.payload.tasks];
    tasks[index] = updated;
    this.persistTasks(tasks);
    return cloneTask(updated);
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (existsSync(this.filePath)) {
      ensurePrivateFile(this.filePath);
      const parsed = LarkSubstituteTaskStorePayloadSchema.parse(
        JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
      );
      const now = new Date().toISOString();
      const tasks = parsed.tasks.map((task) =>
        task.status === "pending" || task.status === "running"
          ? LarkSubstituteTaskSchema.parse({
              ...task,
              status: "failed",
              completedAt: now,
              error: "Paseo daemon 重启前任务未完成",
              failureStage: "processing",
              updatedAt: now,
            })
          : task,
      );
      this.payload = { version: LARK_SUBSTITUTE_TASK_STORE_VERSION, tasks };
      if (tasks.some((task, index) => task !== parsed.tasks[index])) {
        this.persistTasks(tasks);
      }
    }
    this.loaded = true;
  }

  private persistTasks(tasks: LarkSubstituteTask[]): void {
    const limited = [...tasks]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(-MAX_STORED_TASKS);
    const payload = LarkSubstituteTaskStorePayloadSchema.parse({
      version: LARK_SUBSTITUTE_TASK_STORE_VERSION,
      tasks: limited,
    });
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(payload, null, 2));
    this.payload = payload;
    this.loaded = true;
  }

  private failureContent(stage: LarkSubstituteTaskFailureStage): string {
    switch (stage) {
      case "listener":
        return "监听飞书消息";
      case "group_scan":
        return "扫描飞书群消息";
      case "private_scan":
        return "扫描授权用户的新增私聊消息";
      case "processing":
        return "处理替身回答任务";
      case "reply":
        return "发送替身回答";
    }
  }
}
