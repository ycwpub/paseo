import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync(new URL("./view.tsx", import.meta.url), "utf8");

describe("Agent Stream process visibility wiring", () => {
  it("projects process items and renders the completed-turn disclosure", () => {
    expect(viewSource).toContain("projectProcessVisibility({");
    expect(viewSource).toContain("<ProcessingDisclosure");
    expect(viewSource).toContain("tail: processVisibility.tail");
    expect(viewSource).toContain("head: processVisibility.head");
  });

  it("keeps full-turn timing and preserves the viewport while toggling", () => {
    expect(viewSource).toContain("turnTiming: deriveStreamTurnTiming({");
    expect(viewSource).toContain("tail: projectedToolCalls.tail");
    expect(viewSource).toContain("head: projectedToolCalls.head");
    expect(viewSource).toContain("prepareForViewportChange(turnId)");
  });

  it("invalidates both history and live rows when expansion changes", () => {
    expect(viewSource).toContain("globalDisplayState: isMobile !== processExpansion.revision");
    expect(viewSource).toContain("processExpansionRevision: processExpansion.revision");
  });
});
