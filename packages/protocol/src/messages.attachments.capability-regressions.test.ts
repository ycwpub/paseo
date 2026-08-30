import { describe, expect, it } from "vitest";
import { SendAgentMessageRequestSchema } from "./messages.js";
describe("shared messages attachments", () => {
    it("keeps selected MCP server and skill ids on send messages", () => {
        const parsed = SendAgentMessageRequestSchema.parse({
            type: "send_agent_message_request",
            requestId: "req-resources",
            agentId: "agent-1",
            text: "Use selected resources",
            selectedMcpServerIds: ["mcp-db"],
            selectedSkillIds: ["skill-review"],
        });
        expect(parsed.selectedMcpServerIds).toEqual(["mcp-db"]);
        expect(parsed.selectedSkillIds).toEqual(["skill-review"]);
    });
});
