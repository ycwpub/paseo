import type { WorkflowNodeRun, WorkflowRun } from "@getpaseo/protocol/workflow/types";
import type { DevelopmentStageId } from "./flow-model";

const STAGE_STEP_IDS: Record<DevelopmentStageId, readonly string[]> = {
  prd: ["prd"],
  technical_design: ["technical_design"],
  agent_instruction: ["agent_instruction"],
  development: ["development", "development_plan", "development_mode"],
  review: ["review"],
  deploy: ["deploy"],
  test: ["test"],
  release: ["release", "finalize"],
};

export interface DevelopmentStageDetail {
  stageId: DevelopmentStageId;
  runs: WorkflowNodeRun[];
  latestRun: WorkflowNodeRun | null;
}

export function resolveDevelopmentStageDetail(
  run: WorkflowRun | null,
  stageId: DevelopmentStageId,
): DevelopmentStageDetail {
  const stepIds = new Set(STAGE_STEP_IDS[stageId]);
  const runs = (run?.nodeRuns ?? []).filter((nodeRun) => stepIds.has(nodeRun.stepId));
  return {
    stageId,
    runs,
    latestRun: runs.at(-1) ?? null,
  };
}

export function developmentStageStatusLabel(detail: DevelopmentStageDetail): string {
  const status = detail.latestRun?.status;
  if (!status) return "尚未执行";
  switch (status) {
    case "running":
      return "执行中";
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

export function parseWorkflowPayload(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
