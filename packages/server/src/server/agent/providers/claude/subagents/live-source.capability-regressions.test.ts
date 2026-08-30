import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { ClaudeTaskProtocolSource } from "./live-source.js";
// Shapes copied from real wire output (Claude Code 2.1.220) rather than the type declarations,
// so the fixtures stay honest about what actually arrives.
function taskStarted(overrides: Record<string, unknown> = {}): SDKMessage {
    return {
        type: "system",
        subtype: "task_started",
        task_id: "a1730a6215e1f5cf6",
        tool_use_id: "toolu_01DgLoPMW9",
        description: "Summarize hover and unistyles docs",
        subagent_type: "general-purpose",
        task_type: "local_agent",
        ...overrides,
    } as unknown as SDKMessage;
}
function taskNotification(status: string, taskId = "a1730a6215e1f5cf6"): SDKMessage {
    return {
        type: "system",
        subtype: "task_notification",
        task_id: taskId,
        tool_use_id: "toolu_01DgLoPMW9",
        status,
        output_file: "/tmp/x.output",
        summary: "done",
    } as unknown as SDKMessage;
}
describe("ClaudeTaskProtocolSource", () => {
    it("recognizes task notifications by either declared task id or canonical tool-use id", () => {
        const source = new ClaudeTaskProtocolSource();
        source.observe(taskStarted());
        expect(source.ownsTaskNotification({
            taskId: "a1730a6215e1f5cf6",
            toolUseId: "toolu_new_resume_call",
        })).toBe(true);
        expect(source.ownsTaskNotification({
            taskId: "unknown-task",
            toolUseId: "toolu_01DgLoPMW9",
        })).toBe(true);
        expect(source.ownsTaskNotification({
            taskId: "unknown-task",
            toolUseId: "toolu_background_bash",
        })).toBe(false);
    });
    it("does not readmit a filtered task through its notification", () => {
        const source = new ClaudeTaskProtocolSource();
        // A backgrounded shell is filtered at declaration, but it still gets a task_notification
        // carrying a tool_use_id. Routing status off that id would recreate the descriptor with a
        // status and no identity — a nameless row in the subagents track.
        source.observe(taskStarted({
            task_id: "b51skux0z",
            tool_use_id: "toolu_01MgVdcGPYnqE8cJQuccFtkU",
            task_type: "local_bash",
            subagent_type: undefined,
        }));
        expect(source.observe(taskNotification("completed", "b51skux0z"))).toEqual([]);
        expect(source.ownsTaskNotification({
            taskId: "b51skux0z",
            toolUseId: "toolu_01MgVdcGPYnqE8cJQuccFtkU",
        })).toBe(false);
    });
});
