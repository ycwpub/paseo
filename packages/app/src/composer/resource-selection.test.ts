import { describe, expect, test } from "vitest";
import { resolveSessionResourceSelectionFromAssistant } from "./resource-selection";

describe("resolveSessionResourceSelectionFromAssistant", () => {
  test("uses all currently selectable resources when no assistant or all-enabled assistant is selected", () => {
    expect(
      resolveSessionResourceSelectionFromAssistant({
        assistant: null,
        selectableMcpServerIds: ["mcp-a", "mcp-b"],
        selectableSkillIds: ["skill-a"],
      }),
    ).toEqual({ selectedMcpServerIds: ["mcp-a", "mcp-b"], selectedSkillIds: ["skill-a"] });

    expect(
      resolveSessionResourceSelectionFromAssistant({
        assistant: {
          resourceSelection: {
            mode: "all-enabled",
            selectedMcpServerIds: ["ignored"],
            selectedSkillIds: ["ignored"],
          },
        },
        selectableMcpServerIds: ["mcp-a"],
        selectableSkillIds: ["skill-a", "skill-b"],
      }),
    ).toEqual({ selectedMcpServerIds: ["mcp-a"], selectedSkillIds: ["skill-a", "skill-b"] });
  });

  test("uses custom assistant resources and filters unavailable resources", () => {
    expect(
      resolveSessionResourceSelectionFromAssistant({
        assistant: {
          resourceSelection: {
            mode: "custom",
            selectedMcpServerIds: ["mcp-a", "disabled-mcp"],
            selectedSkillIds: ["skill-b", "missing-skill"],
          },
        },
        selectableMcpServerIds: ["mcp-a", "mcp-b"],
        selectableSkillIds: ["skill-a", "skill-b"],
      }),
    ).toEqual({ selectedMcpServerIds: ["mcp-a"], selectedSkillIds: ["skill-b"] });
  });
});
