import { describe, expect, it } from "vitest";
import type { Assistant } from "@getpaseo/protocol/messages";
import {
  buildDevelopmentAssistantOptions,
  resolveDevelopmentAssistantDisplay,
} from "./development-assistant-memory-model";

function assistant(input: Partial<Assistant> & Pick<Assistant, "id">): Assistant {
  return {
    id: input.id,
    name: input.name ?? "",
    description: input.description ?? "",
    prompt: "",
    memoryEnabled: false,
    memory: "",
    memorySummary: "",
    memoryFiles: { summaryPath: "", detailFiles: [] },
    resourceSelection: {
      mode: "all-enabled",
      selectedMcpServerIds: [],
      selectedSkillIds: [],
    },
    createdAt: "",
    updatedAt: "",
  };
}

describe("development assistant memory selector", () => {
  it("uses assistant names in the dropdown while preserving IDs as submitted values", () => {
    const options = buildDevelopmentAssistantOptions([
      assistant({
        id: "assistant-1",
        name: "研发助手",
        description: "负责开发和 Review",
      }),
    ]);

    expect(options).toEqual([
      {
        id: "assistant-1",
        value: "assistant-1",
        label: "研发助手",
        description: "负责开发和 Review",
      },
    ]);
    expect(resolveDevelopmentAssistantDisplay(options, "assistant-1")).toEqual({
      label: "研发助手",
      description: "负责开发和 Review",
    });
  });

  it("does not expose a stale assistant ID as editable text", () => {
    expect(resolveDevelopmentAssistantDisplay([], "deleted-assistant")).toBeNull();
  });
});
