import { describe, expect, it } from "vitest";
import {
  appendInstructionTemplate,
  mergeInstructionTemplates,
  renderInstructionTemplate,
} from "./instruction-template";

describe("renderInstructionTemplate", () => {
  it("fills known variables and preserves unknown placeholders", () => {
    expect(
      renderInstructionTemplate("Review {{service}} for {{ owner }} and {{missing}}.", {
        service: "billing",
        owner: "payments",
      }),
    ).toEqual({
      text: "Review billing for payments and {{missing}}.",
      missingVariables: ["missing"],
    });
  });
});

describe("appendInstructionTemplate", () => {
  it("fills an empty editor and appends to existing Markdown safely", () => {
    expect(appendInstructionTemplate("", "# Review")).toBe("# Review");
    expect(appendInstructionTemplate("Existing\n", "# Review")).toBe("Existing\n\n# Review");
  });
});

describe("mergeInstructionTemplates", () => {
  it("preserves global templates and appends distinct legacy Project templates", () => {
    expect(
      mergeInstructionTemplates(
        [
          { id: "review", name: "Global review", content: "Global" },
          { id: "plan", name: "Plan", content: "Plan" },
        ],
        [
          { id: "review", name: "Legacy review", content: "Legacy" },
          { id: "deploy", name: "Deploy", content: "Deploy" },
        ],
      ),
    ).toEqual([
      { id: "review", name: "Global review", content: "Global" },
      { id: "plan", name: "Plan", content: "Plan" },
      { id: "deploy", name: "Deploy", content: "Deploy" },
    ]);
  });
});
