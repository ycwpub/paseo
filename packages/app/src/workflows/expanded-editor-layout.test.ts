import { describe, expect, it } from "vitest";
import { calculateExpandedWorkflowEditorHeight } from "./expanded-editor-layout";

describe("expanded workflow editor layout", () => {
  it("uses more than half of a typical desktop viewport", () => {
    expect(calculateExpandedWorkflowEditorHeight(768)).toBe(430);
    expect(calculateExpandedWorkflowEditorHeight(900)).toBe(504);
  });

  it("keeps the editor usable on small and very large viewports", () => {
    expect(calculateExpandedWorkflowEditorHeight(320)).toBe(260);
    expect(calculateExpandedWorkflowEditorHeight(1600)).toBe(640);
  });

  it("falls back safely for invalid measurements", () => {
    expect(calculateExpandedWorkflowEditorHeight(0)).toBe(260);
    expect(calculateExpandedWorkflowEditorHeight(Number.NaN)).toBe(260);
  });
});
