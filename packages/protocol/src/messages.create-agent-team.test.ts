import { describe, expect, it } from "vitest";
import { SessionInboundMessageSchema } from "./messages.js";

describe("create_agent_request team identity", () => {
  it("accepts optional assistant and team IDs", () => {
    const parsed = SessionInboundMessageSchema.parse({
      type: "create_agent_request",
      requestId: "create-team-agent",
      config: {
        provider: "codex",
        cwd: "/repo/app",
      },
      assistantId: "assistant-leader",
      teamId: "team-delivery",
    });

    expect(parsed).toMatchObject({
      type: "create_agent_request",
      assistantId: "assistant-leader",
      teamId: "team-delivery",
    });
  });

  it("keeps team identity optional", () => {
    const parsed = SessionInboundMessageSchema.parse({
      type: "create_agent_request",
      requestId: "create-standalone-agent",
      config: {
        provider: "codex",
        cwd: "/repo/app",
      },
    });

    expect(parsed).not.toHaveProperty("teamId");
  });
});
