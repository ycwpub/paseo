import { describe, expect, it } from "vitest";
import type { PluginHttpJob } from "@getpaseo/protocol/messages";
import { prependDevelopmentFlow } from "./use-development-flows";

const job: PluginHttpJob = {
  id: "11111111-1111-4111-8111-111111111111",
  pluginId: "byte-development",
  serviceName: "development",
  status: "queued",
  input: { projectId: "project-1", flow_title: "新流程" },
  result: null,
  workflowRunId: null,
  error: null,
  errorCode: null,
  createdAt: "2026-08-19T08:00:00.000Z",
  startedAt: null,
  endedAt: null,
};

describe("development flow query helpers", () => {
  it("prepends a submitted job without duplicating the flow", () => {
    const once = prependDevelopmentFlow([], job);
    expect(prependDevelopmentFlow(once, job)).toHaveLength(1);
    expect(once[0]?.title).toBe("新流程");
  });
});
