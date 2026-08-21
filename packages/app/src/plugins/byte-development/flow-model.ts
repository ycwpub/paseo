import type { PluginHttpJob } from "@getpaseo/protocol/messages";
import {
  developmentStageCollaborationsFromInput,
  type DevelopmentStageCollaborations,
} from "./development-stage-collaboration-model";

export const DEVELOPMENT_PLUGIN_ID = "byte-development";
export const DEVELOPMENT_SERVICE_NAME = "development";

export const DEVELOPMENT_STAGES = [
  { id: "prd", label: "PRD" },
  { id: "technical_design", label: "技术方案" },
  { id: "agent_instruction", label: "Agent 指令" },
  { id: "development", label: "开发" },
  { id: "review", label: "Review" },
  { id: "deploy", label: "部署" },
  { id: "test", label: "测试" },
  { id: "release", label: "发布" },
] as const;

export type DevelopmentStageId = (typeof DEVELOPMENT_STAGES)[number]["id"];

export interface DevelopmentFlow {
  id: string;
  job: PluginHttpJob;
  projectId: string | null;
  title: string;
  summary: string;
  currentStage: DevelopmentStageId | null;
  stages: DevelopmentStageCollaborations;
  updatedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function truncateTitle(value: string): string {
  const firstLine = value.split(/\r?\n/u)[0]?.trim() ?? "";
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 57)}…`;
}

function resolveStage(job: PluginHttpJob): DevelopmentStageId | null {
  const collaborations = developmentStageCollaborationsFromInput(job.input);
  const active = DEVELOPMENT_STAGES.find(
    (stage) => collaborations[stage.id]?.status === "in_progress",
  );
  const firstIncomplete = DEVELOPMENT_STAGES.find(
    (stage) => collaborations[stage.id]?.status !== "completed",
  );
  if (Object.keys(collaborations).length > 0) {
    return active?.id ?? firstIncomplete?.id ?? "release";
  }
  const result = asRecord(job.result);
  const data = asRecord(result?.data);
  const stage = readText(data, "stage", "currentStage", "current_stage");
  if (stage && DEVELOPMENT_STAGES.some((candidate) => candidate.id === stage)) {
    return stage as DevelopmentStageId;
  }
  if (job.status === "draft" || job.status === "queued") return "prd";
  if (job.status === "succeeded") return "release";
  return null;
}

export function developmentFlowFromJob(job: PluginHttpJob): DevelopmentFlow | null {
  if (job.pluginId !== DEVELOPMENT_PLUGIN_ID || job.serviceName !== DEVELOPMENT_SERVICE_NAME) {
    return null;
  }
  const input = asRecord(job.input);
  const projectId = readText(input, "projectId", "project_id");
  const requestedTitle = readText(input, "flow_title", "title");
  const prd = readText(input, "prd");
  const title = truncateTitle(requestedTitle ?? prd ?? `研发流程 ${job.id.slice(0, 8)}`);
  return {
    id: job.id,
    job,
    projectId,
    title,
    summary: prd ?? "暂无需求摘要",
    currentStage: resolveStage(job),
    stages: developmentStageCollaborationsFromInput(job.input),
    updatedAt: job.endedAt ?? job.startedAt ?? job.createdAt,
  };
}

export function developmentFlowStatusLabel(flow: DevelopmentFlow): string {
  const stages = Object.values(flow.stages);
  if (stages.length === 0)
    return flow.job.status === "draft" ? "待协作" : developmentJobStatusLabel(flow.job.status);
  if (DEVELOPMENT_STAGES.every((stage) => flow.stages[stage.id]?.status === "completed")) {
    return "已完成";
  }
  if (stages.some((stage) => stage?.status === "in_progress")) return "协作中";
  if (stages.some((stage) => stage?.status === "completed")) return "进行中";
  return "待协作";
}

export function developmentFlowsFromJobs(jobs: readonly PluginHttpJob[]): DevelopmentFlow[] {
  return jobs
    .flatMap((job) => {
      const flow = developmentFlowFromJob(job);
      return flow ? [flow] : [];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function developmentJobStatusLabel(status: PluginHttpJob["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "queued":
      return "等待中";
    case "running":
      return "进行中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "timed_out":
      return "已超时";
  }
}

export function developmentStageLabel(stage: DevelopmentStageId | null): string {
  return DEVELOPMENT_STAGES.find((candidate) => candidate.id === stage)?.label ?? "处理中";
}

export function developmentJobIsActive(job: PluginHttpJob): boolean {
  return job.status === "queued" || job.status === "running";
}
