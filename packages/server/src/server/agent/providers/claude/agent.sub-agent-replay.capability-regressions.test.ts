import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import type { AgentStreamEvent } from "../../agent-sdk-types.js";
import { ClaudeAgentClient } from "./agent.js";
import { claudeProjectDirSync } from "./project-dir.js";
/**
 * Replay coverage for provider subagents rebuilt from a persisted session.
 *
 * The live path had tests; this path did not, which is how its derivation drifted from the live
 * one. These exercise the real on-disk layout Claude Code writes.
 */
const TOOL_USE_ID = "toolu_01DgLoPMW9";
const AGENT_ID = "a1730a6215e1f5cf6";
function parentEntry(content: unknown): string {
    return JSON.stringify({
        type: "assistant",
        sessionId: "replay-session",
        timestamp: "2026-07-26T06:27:47.034Z",
        message: { role: "assistant", content },
    });
}
function taskToolUse(): string {
    return parentEntry([
        {
            type: "tool_use",
            id: TOOL_USE_ID,
            name: "Task",
            input: { subagent_type: "general-purpose", description: "Summarize the docs" },
        },
    ]);
}
function sidechainEntry(options: {
    agentId?: string;
    stopReason?: string | null;
} = {}): string {
    return JSON.stringify({
        type: "assistant",
        isSidechain: true,
        agentId: options.agentId ?? AGENT_ID,
        sessionId: "replay-session",
        timestamp: "2026-07-26T06:27:50.000Z",
        message: {
            role: "assistant",
            content: [{ type: "text", text: "summary of the docs" }],
            stop_reason: options.stopReason ?? null,
        },
    });
}
describe("ClaudeAgentSession persisted subagent replay", () => {
    const logger = createTestLogger();
    const queryFactory = vi.fn(() => {
        throw new Error("replay must not start a query");
    });
    let tempRoot: string;
    let cwd: string;
    let configDir: string;
    function writeParentSession(parentLines: string[]): string {
        const historyDir = claudeProjectDirSync(cwd, { configDir });
        mkdirSync(historyDir, { recursive: true });
        writeFileSync(path.join(historyDir, "replay-session.jsonl"), parentLines.join("\n"));
        return path.join(historyDir, "replay-session", "subagents");
    }
    function writeSubagent(options: {
        subagentDir: string;
        agentId?: string;
        meta?: string | null;
        sidechainLines?: string[];
    }): void {
        const agentId = options.agentId ?? AGENT_ID;
        mkdirSync(options.subagentDir, { recursive: true });
        writeFileSync(path.join(options.subagentDir, `agent-${agentId}.jsonl`), (options.sidechainLines ?? [sidechainEntry({ agentId })]).join("\n"));
        if (options.meta !== null && options.meta !== undefined) {
            writeFileSync(path.join(options.subagentDir, `agent-${agentId}.meta.json`), options.meta);
        }
    }
    function writeSession(options: {
        parentLines: string[];
        meta?: string | null;
        sidechainLines?: string[];
    }): void {
        writeSubagent({
            subagentDir: writeParentSession(options.parentLines),
            meta: options.meta,
            sidechainLines: options.sidechainLines,
        });
    }
    async function replayEvents(): Promise<AgentStreamEvent[]> {
        const client = new ClaudeAgentClient({
            logger,
            queryFactory,
            resolveVersion: async () => "2.1.220",
        });
        const session = await client.resumeSession({ provider: "claude", sessionId: "replay-session" }, { cwd });
        const events: AgentStreamEvent[] = [];
        for await (const event of session.streamHistory()) {
            events.push(event);
        }
        await session.close();
        return events;
    }
    beforeEach(() => {
        tempRoot = mkdtempSync(path.join(os.tmpdir(), "claude-subagent-replay-"));
        cwd = path.join(tempRoot, "repo");
        configDir = path.join(tempRoot, "claude-config");
        mkdirSync(cwd, { recursive: true });
        vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        rmSync(tempRoot, { recursive: true, force: true });
    });
    test("suppresses a queued notification for a background tool owned by a restored subagent", async () => {
        const backgroundToolUseId = "call_background_bash";
        writeSession({
            parentLines: [
                taskToolUse(),
                JSON.stringify({
                    type: "queue-operation",
                    operation: "enqueue",
                    content: [
                        "<task-notification>",
                        "<task-id>background-bash-task</task-id>",
                        `<tool-use-id>${backgroundToolUseId}</tool-use-id>`,
                        "<status>completed</status>",
                        "<summary>Background command completed</summary>",
                        "</task-notification>",
                    ].join("\n"),
                }),
            ],
            meta: JSON.stringify({ toolUseId: TOOL_USE_ID, agentType: "Explore", spawnDepth: 1 }),
            sidechainLines: [
                JSON.stringify({
                    type: "assistant",
                    isSidechain: true,
                    agentId: AGENT_ID,
                    sessionId: "replay-session",
                    timestamp: "2026-07-26T06:27:50.000Z",
                    message: {
                        role: "assistant",
                        content: [
                            {
                                type: "tool_use",
                                id: backgroundToolUseId,
                                name: "Bash",
                                input: { command: "log show", description: "Filter unified log" },
                            },
                        ],
                    },
                }),
            ],
        });
        const replayed = await replayEvents();
        expect(replayed
            .filter((event) => event.type === "timeline")
            .map((event) => event.item)
            .filter((item) => item.type === "tool_call" && item.name === "task_notification")).toEqual([]);
    });
    test("suppresses a restored subagent notification that only retains the task id", async () => {
        writeSession({
            parentLines: [
                taskToolUse(),
                JSON.stringify({
                    type: "queue-operation",
                    operation: "enqueue",
                    content: [
                        "<task-notification>",
                        `<task-id>${AGENT_ID}</task-id>`,
                        "<status>completed</status>",
                        '<summary>Agent "Summarize the docs" finished</summary>',
                        "</task-notification>",
                    ].join("\n"),
                }),
            ],
            meta: JSON.stringify({ toolUseId: TOOL_USE_ID, agentType: "Explore", spawnDepth: 1 }),
        });
        const replayed = await replayEvents();
        expect(replayed
            .filter((event) => event.type === "timeline")
            .map((event) => event.item)
            .filter((item) => item.type === "tool_call" && item.name === "task_notification")).toEqual([]);
    });
});
