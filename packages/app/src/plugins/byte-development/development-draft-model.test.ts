import { describe, expect, it } from "vitest";
import {
  buildDevelopmentCopyInput,
  buildDevelopmentCopyTitle,
  buildDevelopmentDraftInput,
  buildDevelopmentPrdInput,
  validateDevelopmentDraftStart,
} from "./development-draft-model";
import { EMPTY_DEVELOPMENT_PRD_SOURCE } from "./development-prd-source-model";

describe("byte development draft model", () => {
  it("creates a development task without requiring PRD content", () => {
    expect(
      buildDevelopmentDraftInput({
        flowTitle: " 支付链路优化 ",
        projectId: " project-1 ",
        defaultAgent: { provider: "codex", model: "gpt-5.6" },
      }),
    ).toEqual({
      flow_title: "支付链路优化",
      projectId: "project-1",
      agent_provider: "codex",
      agent_model: "gpt-5.6",
      prd_source: "manual",
      prd: "",
      meego_url: "",
      meego_project_key: "",
      meego_work_item_id: "",
      meego_title: "",
    });
  });

  it("requires a default Provider and model", () => {
    expect(() =>
      buildDevelopmentDraftInput({
        flowTitle: "支付链路优化",
        projectId: "project-1",
        defaultAgent: { provider: "codex", model: "" },
      }),
    ).toThrow("请选择默认 Provider 和模型");
  });

  it("writes PRD node values into the persisted workflow input", () => {
    expect(
      buildDevelopmentPrdInput({
        currentInput: { flow_title: "支付链路优化", approve_development: false },
        projectId: "project-1",
        prdSource: {
          ...EMPTY_DEVELOPMENT_PRD_SOURCE,
          prd: "降低支付延迟",
        },
        fixedFormValues: {
          repository_path: "/workspace/payment",
        },
      }),
    ).toMatchObject({
      flow_title: "支付链路优化",
      projectId: "project-1",
      prd: "降低支付延迟",
      repository_path: "/workspace/payment",
      approve_development: false,
    });
  });

  it("copies plugin project configuration into a uniquely named draft", () => {
    expect(buildDevelopmentCopyTitle("支付链路优化", ["支付链路优化 副本"])).toBe(
      "支付链路优化 副本 2",
    );
    expect(
      buildDevelopmentCopyInput({
        currentInput: {
          flow_title: "支付链路优化",
          projectId: "project-1",
          prd: "降低支付延迟",
          approve_development: true,
          unexpected_runtime_field: "drop",
        },
        sourceTitle: "支付链路优化",
        existingTitles: ["支付链路优化", "支付链路优化 副本"],
        projectId: "project-1",
      }),
    ).toEqual({
      flow_title: "支付链路优化 副本 2",
      projectId: "project-1",
      prd: "降低支付延迟",
      approve_development: true,
    });
  });

  it("requires PRD and a code directory only when starting the workflow", () => {
    expect(() =>
      validateDevelopmentDraftStart({
        prdSource: EMPTY_DEVELOPMENT_PRD_SOURCE,
        repositoryPath: "/workspace/payment",
        projectLoading: false,
        projectError: null,
      }),
    ).toThrow("请先填写 PRD");

    expect(() =>
      validateDevelopmentDraftStart({
        prdSource: { ...EMPTY_DEVELOPMENT_PRD_SOURCE, prd: "需求" },
        repositoryPath: null,
        projectLoading: false,
        projectError: null,
      }),
    ).toThrow("Project 没有关联代码目录");
  });
});
