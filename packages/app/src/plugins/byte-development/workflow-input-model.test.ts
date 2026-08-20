import { describe, expect, it } from "vitest";
import { sanitizeByteDevelopmentWorkflowInput } from "./workflow-input-model";

describe("sanitizeByteDevelopmentWorkflowInput", () => {
  it("keeps fields supported by the current Workflow input schema", () => {
    expect(
      sanitizeByteDevelopmentWorkflowInput({
        flow_title: "抖音省",
        projectId: "prj_flow",
        sourceProjectId: "prj_source",
        prd: "实现需求",
        repository_path: "/workspace/project",
        approve_development: false,
      }),
    ).toEqual({
      flow_title: "抖音省",
      projectId: "prj_flow",
      sourceProjectId: "prj_source",
      prd: "实现需求",
      repository_path: "/workspace/project",
      approve_development: false,
    });
  });

  it("drops fields left by older persisted development console documents", () => {
    expect(
      sanitizeByteDevelopmentWorkflowInput({
        flow_title: "抖音省",
        projectId: "prj_flow",
        sourceProjectId: "prj_source",
        prd: "实现需求",
        repository_path: "/workspace/project",
        agent_provider: "codex",
        agent_model: "gpt-5.6",
        project_id: "legacy-project",
        unexpected: true,
      }),
    ).toEqual({
      flow_title: "抖音省",
      projectId: "prj_flow",
      sourceProjectId: "prj_source",
      prd: "实现需求",
      repository_path: "/workspace/project",
    });
  });
});
