import * as path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { ClaudeAgentClient } from "./agent.js";
import type { AgentStreamEvent } from "../../agent-sdk-types.js";
interface TestClaudeSession {
    translateMessageToEvents(message: SDKMessage): AgentStreamEvent[];
    buildPumpedMessageEvents(message: SDKMessage, messageIdHint: string | null, turnId: string | null): Promise<AgentStreamEvent[]>;
}
afterEach(() => {
    vi.restoreAllMocks();
});
describe("ClaudeAgentSession features", () => {
    const logger = createTestLogger();
    function createQueryMock() {
        let endQuery: (() => void) | null = null;
        const queryEnded = new Promise<void>((resolve) => {
            endQuery = resolve;
        });
        const queryReturn = vi.fn(async () => {
            endQuery?.();
        });
        const queryMock = {
            close: vi.fn(),
            return: queryReturn,
            applyFlagSettings: vi.fn(async () => undefined),
            setModel: vi.fn(async () => undefined),
            getContextUsage: vi.fn(async () => undefined),
            [Symbol.asyncIterator](): AsyncIterator<SDKMessage, void> {
                return {
                    next: async () => {
                        await queryEnded;
                        return { value: undefined, done: true };
                    },
                };
            },
        };
        const launches: Array<{
            options: Record<string, unknown>;
        }> = [];
        const queryFactory = vi.fn((input) => {
            launches.push(input);
            return queryMock;
        });
        return { queryFactory, queryMock, launches };
    }
    test("adds every other Project repository to Claude additional directories", async () => {
        const { queryFactory } = createQueryMock();
        const client = new ClaudeAgentClient({
            logger,
            queryFactory,
            resolveBinary: async () => "/test/claude/bin",
        });
        const cwd = path.resolve("/repo/settle-charge-tool");
        const session = await client.createSession({
            provider: "claude",
            cwd,
            writableProjectDirectories: [cwd, "/repo/settle-charge-facade"],
            providerOptions: {
                additionalDirectories: ["/repo/shared"],
            },
        });
        await (session as unknown as {
            ensureQuery(): Promise<unknown>;
        }).ensureQuery();
        expect(queryFactory.mock.calls[0]?.[0].options.additionalDirectories).toEqual([
            "/repo/shared",
            "/repo/settle-charge-facade",
        ]);
        await session.close();
    });
});
describe("ClaudeAgentSession context window usage", () => {
    const logger = createTestLogger();
    async function createSessionForTest(): Promise<TestClaudeSession> {
        const client = new ClaudeAgentClient({ logger, resolveBinary: async () => "/test/claude/bin" });
        const session = await client.createSession({
            provider: "claude",
            cwd: process.cwd(),
        });
        return session as unknown as TestClaudeSession;
    }
    test("omits Claude redacted thinking when no readable summary is available", async () => {
        const session = await createSessionForTest();
        const messageId = "assistant-redacted-1";
        const messages = [
            {
                type: "stream_event",
                event: {
                    type: "message_start",
                    message: { id: messageId, role: "assistant", content: [] },
                },
                session_id: "session-1",
            },
            {
                type: "stream_event",
                event: {
                    type: "content_block_start",
                    index: 0,
                    content_block: { type: "redacted_thinking", data: "opaque-data" },
                },
                session_id: "session-1",
            },
            {
                type: "assistant",
                message: {
                    id: messageId,
                    role: "assistant",
                    content: [{ type: "redacted_thinking", data: "opaque-data" }],
                },
                session_id: "session-1",
                uuid: "assistant-redacted-event-1",
            },
        ] as unknown as SDKMessage[];
        const events: AgentStreamEvent[] = [];
        for (const message of messages) {
            events.push(...(await session.buildPumpedMessageEvents(message, messageId, "turn-1")));
        }
        expect(events.filter((event) => event.type === "timeline")).toEqual([]);
    });
    test("does not show a redacted placeholder when readable assistant output exists", async () => {
        const session = await createSessionForTest();
        const redactedEvents = session.translateMessageToEvents({
            type: "assistant",
            message: {
                id: "assistant-history-redacted",
                role: "assistant",
                content: [
                    { type: "redacted_thinking", data: "opaque-1" },
                    { type: "redacted_thinking", data: "opaque-2" },
                    { type: "text", text: "Answer" },
                ],
            },
            session_id: "session-1",
            uuid: "assistant-history-redacted-event",
        } as unknown as SDKMessage);
        expect(redactedEvents.filter((event) => event.type === "timeline")).toEqual([
            {
                type: "timeline",
                provider: "claude",
                item: { type: "assistant_message", text: "Answer" },
            },
        ]);
    });
    test("keeps Aiden Claude text commentary distinct from native thinking", async () => {
        const session = await createSessionForTest();
        const messageId = "assistant-redacted-commentary";
        const commentary = "我先检查当前实现，再运行相关测试。";
        const messages = [
            {
                type: "stream_event",
                event: {
                    type: "message_start",
                    message: { id: messageId, role: "assistant", content: [] },
                },
                session_id: "session-1",
            },
            {
                type: "stream_event",
                event: {
                    type: "content_block_start",
                    index: 0,
                    content_block: { type: "redacted_thinking", data: "opaque-data" },
                },
                session_id: "session-1",
            },
            {
                type: "stream_event",
                event: {
                    type: "content_block_start",
                    index: 1,
                    content_block: { type: "text", text: commentary },
                },
                session_id: "session-1",
            },
            {
                type: "stream_event",
                event: {
                    type: "content_block_start",
                    index: 2,
                    content_block: {
                        type: "tool_use",
                        id: "tool-1",
                        name: "Bash",
                        input: { command: "npm test" },
                    },
                },
                session_id: "session-1",
            },
            {
                type: "assistant",
                message: {
                    id: messageId,
                    role: "assistant",
                    content: [
                        { type: "redacted_thinking", data: "opaque-data" },
                        { type: "text", text: commentary },
                        {
                            type: "tool_use",
                            id: "tool-1",
                            name: "Bash",
                            input: { command: "npm test" },
                        },
                    ],
                },
                session_id: "session-1",
                uuid: "assistant-redacted-commentary-event",
            },
        ] as unknown as SDKMessage[];
        const events: AgentStreamEvent[] = [];
        for (const message of messages) {
            events.push(...(await session.buildPumpedMessageEvents(message, messageId, "turn-1")));
        }
        expect(events.filter((event) => event.type === "timeline" &&
            event.item.type === "assistant_message" &&
            event.item.text === commentary)).toHaveLength(1);
        expect(events.some((event) => event.type === "timeline" &&
            event.item.type === "reasoning" &&
            event.item.text === commentary)).toBe(false);
        expect(events.findIndex((event) => event.type === "timeline" && event.item.type === "assistant_message")).toBeLessThan(events.findIndex((event) => event.type === "timeline" && event.item.type === "tool_call"));
    });
    test("keeps persisted Aiden Claude text commentary distinct from native thinking", async () => {
        const session = await createSessionForTest();
        const events = session.translateMessageToEvents({
            type: "assistant",
            message: {
                id: "assistant-history-commentary",
                role: "assistant",
                content: [
                    { type: "redacted_thinking", data: "opaque" },
                    { type: "text", text: "正在检查 provider 事件。" },
                    {
                        type: "tool_use",
                        id: "tool-history-1",
                        name: "Read",
                        input: { file_path: "/tmp/example.ts" },
                    },
                ],
            },
            session_id: "session-1",
            uuid: "assistant-history-commentary-event",
        } as unknown as SDKMessage);
        expect(events.filter((event) => event.type === "timeline")).toEqual([
            {
                type: "timeline",
                provider: "claude",
                item: { type: "assistant_message", text: "正在检查 provider 事件。" },
            },
            expect.objectContaining({
                type: "timeline",
                provider: "claude",
                item: expect.objectContaining({ type: "tool_call" }),
            }),
        ]);
    });
    test("prefers native readable thinking over redacted thinking", async () => {
        const session = await createSessionForTest();
        const readableEvents = session.translateMessageToEvents({
            type: "assistant",
            message: {
                id: "assistant-history-readable",
                role: "assistant",
                content: [
                    { type: "redacted_thinking", data: "opaque" },
                    { type: "thinking", thinking: "Readable summary" },
                    { type: "text", text: "Answer" },
                ],
            },
            session_id: "session-1",
            uuid: "assistant-history-readable-event",
        } as unknown as SDKMessage);
        expect(readableEvents.filter((event) => event.type === "timeline")).toEqual([
            {
                type: "timeline",
                provider: "claude",
                item: { type: "reasoning", text: "Readable summary", source: "thinking" },
            },
            {
                type: "timeline",
                provider: "claude",
                item: { type: "assistant_message", text: "Answer" },
            },
        ]);
    });
});
