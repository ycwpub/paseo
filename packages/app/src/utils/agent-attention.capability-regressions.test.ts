import { describe, expect, it } from "vitest";
import { getAgentAttentionRouting, getDesktopAgentAttentionDecision } from "@/desktop/attention/agent-attention-policy";
describe("getAgentAttentionRouting", () => {
    it("signals the local desktop for completed tasks even when another client owns notifications", () => {
        expect(getAgentAttentionRouting({
            reason: "finished",
            shouldNotify: false,
        })).toEqual({
            shouldSignalDesktop: true,
            shouldProcessNotification: false,
        });
    });
    it("keeps server-selected notification delivery separate from desktop attention", () => {
        expect(getAgentAttentionRouting({
            reason: "finished",
            shouldNotify: true,
        })).toEqual({
            shouldSignalDesktop: true,
            shouldProcessNotification: true,
        });
        expect(getAgentAttentionRouting({
            reason: "permission",
            shouldNotify: false,
        })).toEqual({
            shouldSignalDesktop: false,
            shouldProcessNotification: false,
        });
    });
});
describe("getDesktopAgentAttentionDecision", () => {
    it("alerts when Paseo is focused on another page or conversation", () => {
        expect(getDesktopAgentAttentionDecision({
            reason: "finished",
            agentId: "agent-1",
            focusedAgentId: null,
            isAppActivelyVisible: true,
        })).toEqual({
            shouldSignal: true,
            allowWhenFocused: true,
        });
    });
    it("does not alert when the completed conversation is actively visible", () => {
        expect(getDesktopAgentAttentionDecision({
            reason: "finished",
            agentId: "agent-1",
            focusedAgentId: "agent-1",
            isAppActivelyVisible: true,
        })).toEqual({
            shouldSignal: false,
            allowWhenFocused: true,
        });
    });
    it("alerts normally when Paseo is in the background", () => {
        expect(getDesktopAgentAttentionDecision({
            reason: "finished",
            agentId: "agent-1",
            focusedAgentId: "agent-1",
            isAppActivelyVisible: false,
        })).toEqual({
            shouldSignal: true,
            allowWhenFocused: false,
        });
    });
});
