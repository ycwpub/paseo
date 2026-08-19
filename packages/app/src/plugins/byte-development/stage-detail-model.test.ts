import { describe, expect, it } from "vitest";
import type { WorkflowRun } from "@getpaseo/protocol/workflow/types";
import {
  developmentStageStatusLabel,
  parseWorkflowPayload,
  resolveDevelopmentStageDetail,
} from "./stage-detail-model";

const run = {
  nodeRuns: [
    {
      stepId: "prd",
      status: "succeeded",
      inputPayload: '{"data":{"prd":"需求"}}',
      outputPayload: '{"data":{"summary":"分析"}}',
    },
    {
      stepId: "review",
      status: "failed",
      inputPayload: "{}",
      outputPayload: null,
    },
  ],
} as WorkflowRun;

describe("development stage detail model", () => {
  it("selects only the runs belonging to the clicked stage", () => {
    const detail = resolveDevelopmentStageDetail(run, "review");
    expect(detail.runs.map((nodeRun) => nodeRun.stepId)).toEqual(["review"]);
    expect(developmentStageStatusLabel(detail)).toBe("失败");
  });

  it("parses structured node payloads and preserves text", () => {
    expect(parseWorkflowPayload('{"answer":"ok"}')).toEqual({ answer: "ok" });
    expect(parseWorkflowPayload("plain text")).toBe("plain text");
  });
});
