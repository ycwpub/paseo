import { describe, expect, test } from "vitest";
import { buildMemoryScopePolicyOptions } from "./memory-scope-policy-options";

describe("memory scope policy options", () => {
  test("combines live entities with saved policies for removed entities", () => {
    expect(
      buildMemoryScopePolicyOptions({
        projects: [{ id: "project-1", label: "Paseo" }],
        assistants: [],
        policies: [
          {
            scope: { type: "assistant", id: "assistant-old" },
            enabled: true,
            extractionInstructions: "",
          },
          {
            scope: { type: "project", id: "project-1" },
            enabled: true,
            extractionInstructions: "",
          },
        ],
      }),
    ).toEqual({
      project: [{ scope: { type: "project", id: "project-1" }, label: "Paseo" }],
      assistant: [{ scope: { type: "assistant", id: "assistant-old" }, label: "assistant-old" }],
    });
  });
});
