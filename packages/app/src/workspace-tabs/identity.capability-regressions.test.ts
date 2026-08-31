import { describe, expect, it } from "vitest";
import { normalizeWorkspaceTabTarget } from "./identity";
describe("working diff tab identity", () => {
  const target = {
    kind: "working_diff" as const,
    focusPath: "src/example.ts",
    focusRequestId: 1,
  };
  it("normalizes file focus navigation", () => {
    expect(
      normalizeWorkspaceTabTarget({
        ...target,
        cwd: " C:\\repos\\service-a\\ ",
        focusPath: " src\\example.ts ",
      }),
    ).toEqual({
      ...target,
      cwd: "C:/repos/service-a",
    });
  });
});
