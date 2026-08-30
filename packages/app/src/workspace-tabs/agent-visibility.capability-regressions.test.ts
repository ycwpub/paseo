import { describe, expect, it } from "vitest";
import { buildWorkspaceTabSnapshot } from "@/workspace-tabs/agent-visibility";
describe("workspace agent visibility", () => {
    it("builds the tab reconciliation snapshot without callers unpacking agent visibility", () => {
        const agentVisibility = {
            activeAgentIds: new Set(["active-agent"]),
            autoOpenAgentIds: new Set(["root-agent"]),
            knownAgentIds: new Set(["active-agent", "archived-agent"]),
        };
        expect(buildWorkspaceTabSnapshot({
            agentVisibility,
            agentsHydrated: true,
            terminalsHydrated: true,
            knownTerminalIds: ["terminal-1", "script-terminal"],
            standaloneTerminalIds: ["terminal-1"],
            hasActivePendingTerminalCreate: false,
            hasActivePendingDraftCreate: false,
            replaceableDraftTabId: "draft-1",
        })).toEqual({
            agentsHydrated: true,
            terminalsHydrated: true,
            activeAgentIds: agentVisibility.activeAgentIds,
            autoOpenAgentIds: agentVisibility.autoOpenAgentIds,
            knownAgentIds: agentVisibility.knownAgentIds,
            knownTerminalIds: ["terminal-1", "script-terminal"],
            standaloneTerminalIds: ["terminal-1"],
            hasActivePendingTerminalCreate: false,
            hasActivePendingDraftCreate: false,
            replaceableDraftTabId: "draft-1",
        });
    });
});
