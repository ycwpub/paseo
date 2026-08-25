import { describe, expect, it } from "vitest";
import { resolveReasoningPresentation } from "./reasoning-presentation";

describe("resolveReasoningPresentation", () => {
  it("collapses Aiden Claude native thinking by default", () => {
    expect(
      resolveReasoningPresentation({
        provider: "aiden-claude",
        source: "thinking",
        autoExpandReasoning: false,
      }),
    ).toEqual({ kind: "collapsible", defaultExpanded: false });
  });

  it("also collapses older Aiden Claude thinking without a source marker", () => {
    expect(
      resolveReasoningPresentation({
        provider: "aiden-claude",
        autoExpandReasoning: false,
      }),
    ).toEqual({ kind: "collapsible", defaultExpanded: false });
  });

  it("keeps Aiden Claude process text visible as a normal message", () => {
    expect(
      resolveReasoningPresentation({
        provider: "aiden-claude",
        source: "text",
        autoExpandReasoning: false,
      }),
    ).toEqual({ kind: "message" });

    expect(
      resolveReasoningPresentation({
        provider: "aiden-claude",
        source: "text",
        autoExpandReasoning: true,
      }),
    ).toEqual({ kind: "message" });
  });

  it("preserves the existing presentation for other providers", () => {
    expect(
      resolveReasoningPresentation({
        provider: "codex",
        source: "thinking",
        autoExpandReasoning: false,
      }),
    ).toEqual({ kind: "message" });
    expect(
      resolveReasoningPresentation({
        provider: "codex",
        source: "thinking",
        autoExpandReasoning: true,
      }),
    ).toEqual({ kind: "collapsible", defaultExpanded: true });
  });
});
