import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { resolveAgentComposerIdentity } from "./agent-identity";

describe("agent composer identity", () => {
  test("restores a selected assistant from agent labels", () => {
    expect(
      resolveAgentComposerIdentity({
        assistantId: " assistant-settlement ",
        assistantName: "结算助手",
      }),
    ).toEqual({
      assistantId: "assistant-settlement",
      teamId: null,
    });
  });

  test("restores a selected team and its leader assistant from agent labels", () => {
    expect(
      resolveAgentComposerIdentity({
        assistantId: "assistant-lead",
        "paseo.team-id": "team-delivery",
        "paseo.team-role": "leader",
      }),
    ).toEqual({
      assistantId: "assistant-lead",
      teamId: "team-delivery",
    });
  });

  test("ignores missing and blank identity labels", () => {
    expect(
      resolveAgentComposerIdentity({
        assistantId: " ",
        "paseo.team-id": "",
      }),
    ).toEqual({
      assistantId: null,
      teamId: null,
    });
  });

  test("keeps the active conversation composer wired to persisted agent identity", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../panels/agent-panel.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("resolveAgentComposerIdentity(agentState.labels)");
    expect(source).toContain("assistantId={assistantId}");
    expect(source).toContain("teamId={teamId}");
  });
});
