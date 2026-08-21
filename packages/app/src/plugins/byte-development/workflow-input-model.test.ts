import { describe, expect, it } from "vitest";
import { sanitizeByteDevelopmentWorkflowInput } from "./workflow-input-model";

describe("sanitizeByteDevelopmentWorkflowInput", () => {
  it("keeps fields supported by the current Workflow input schema", () => {
    expect(
      sanitizeByteDevelopmentWorkflowInput({
        flow_title: "抖音省",
        projectId: "prj_flow",
        prd: "实现需求",
        repository_path: "/workspace/project",
        approve_development: false,
      }),
    ).toEqual({
      flow_title: "抖音省",
      projectId: "prj_flow",
      prd: "实现需求",
      repository_path: "/workspace/project",
      approve_development: false,
    });
  });

  it("keeps the plugin project's default Agent and drops unsupported fields", () => {
    expect(
      sanitizeByteDevelopmentWorkflowInput({
        flow_title: "抖音省",
        projectId: "prj_flow",
        sourceProjectId: "legacy-source-project",
        prd: "实现需求",
        repository_path: "/workspace/project",
        agent_provider: "codex",
        agent_model: "gpt-5.6",
        stage_collaboration: {
          prd: { status: "in_progress", agentId: "agent-1" },
        },
        project_id: "legacy-project",
        unexpected: true,
      }),
    ).toEqual({
      flow_title: "抖音省",
      projectId: "prj_flow",
      prd: "实现需求",
      repository_path: "/workspace/project",
      agent_provider: "codex",
      agent_model: "gpt-5.6",
      approve_development: false,
      stage_collaboration: {
        prd: { status: "in_progress", agentId: "agent-1" },
      },
    });
  });

  it("defaults missing development approval to the safe read-only branch", () => {
    expect(
      sanitizeByteDevelopmentWorkflowInput({
        flow_title: "历史开发流程",
        projectId: "prj_flow",
      }),
    ).toEqual({
      flow_title: "历史开发流程",
      projectId: "prj_flow",
      approve_development: false,
    });
  });
});
