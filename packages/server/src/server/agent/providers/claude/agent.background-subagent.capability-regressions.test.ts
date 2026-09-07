import { rmSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import type { AgentStreamEvent } from "../../agent-sdk-types.js";
import { ClaudeAgentClient } from "./agent.js";
import { streamSession } from "../test-utils/session-stream-adapter.js";
/**
 * A backgrounded Task subagent emits NO frames carrying parent_tool_use_id — verified against
 * Claude Code 2.1.220. Everything keyed off that field therefore sees nothing for one: no
 * descriptor, no timeline, and a Task card in the parent transcript with no type or task on it.
 *
 * The task protocol still announces the subagent, so these assert that a background child is
 * visible on both surfaces from its declaration alone.
 */
const queryFactory = vi.fn();
const testTempDirs: string[] = [];
function buildQueryMock(events: unknown[]) {
  let index = 0;
  return {
    next: vi.fn(async () => {
      if (index >= events.length) return { done: true, value: undefined };
      const value = events[index];
      index += 1;
      return { done: false, value };
    }),
    interrupt: vi.fn(async () => undefined),
    return: vi.fn(async () => undefined),
    close: vi.fn(() => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    supportedModels: vi.fn(async () => []),
    supportedCommands: vi.fn(async () => []),
    rewindFiles: vi.fn(async () => ({ canRewind: true })),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
async function collectUntilTerminal(
  stream: AsyncGenerator<AgentStreamEvent>,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
    if (
      event.type === "turn_completed" ||
      event.type === "turn_failed" ||
      event.type === "turn_canceled"
    ) {
      break;
    }
  }
  return events;
}
describe("background Claude subagents", () => {
  afterEach(() => {
    queryFactory.mockReset();
    for (const directory of testTempDirs.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test("routes a queued background-tool notification into its subagent timeline", async () => {
    queryFactory.mockImplementation(() =>
      buildQueryMock([
        { type: "system", subtype: "init", session_id: "bg-session", permissionMode: "default" },
        {
          type: "system",
          subtype: "task_started",
          task_id: "agent-task",
          tool_use_id: "toolu_agent",
          task_type: "local_agent",
          subagent_type: "Explore",
          description: "Inspect application logs",
        },
        {
          type: "assistant",
          parent_tool_use_id: "toolu_agent",
          message: {
            model: "claude-opus-5",
            content: [
              {
                type: "tool_use",
                id: "toolu_background_bash",
                name: "Bash",
                input: { command: "log show", description: "Filter unified log" },
              },
            ],
          },
        },
        {
          type: "user",
          uuid: "background-notification",
          message: {
            role: "user",
            content: [
              "<task-notification>",
              "<task-id>bash-task</task-id>",
              "<tool-use-id>toolu_background_bash</tool-use-id>",
              "<status>completed</status>",
              "<summary>Background command completed</summary>",
              "</task-notification>",
            ].join("\n"),
          },
        },
        { type: "result", subtype: "success", usage: {}, total_cost_usd: 0 },
      ]),
    );
    const session = await new ClaudeAgentClient({
      logger: createTestLogger(),
      queryFactory,
      resolveBinary: async () => "/test/claude/bin",
    }).createSession({ provider: "claude", cwd: process.cwd() });
    const events = await collectUntilTerminal(streamSession(session, "inspect logs"));
    await session.close();
    expect(
      events
        .filter((event) => event.type === "timeline")
        .map((event) => event.item)
        .filter((item) => item.type === "tool_call" && item.name === "task_notification"),
    ).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "provider_subagent",
        provider: "claude",
        event: {
          type: "timeline",
          id: "toolu_agent",
          item: expect.objectContaining({
            type: "tool_call",
            callId: "toolu_background_bash",
            name: "Bash",
            status: "completed",
          }),
        },
      }),
    );
  });
  test("uses task_id to terminalize a queued subagent notification with a newer tool-use id", async () => {
    queryFactory.mockImplementation(() =>
      buildQueryMock([
        { type: "system", subtype: "init", session_id: "bg-session", permissionMode: "default" },
        {
          type: "system",
          subtype: "task_started",
          task_id: "agent-task",
          tool_use_id: "toolu_agent",
          task_type: "local_agent",
          subagent_type: "Explore",
          description: "Inspect application logs",
        },
        {
          type: "user",
          uuid: "agent-notification",
          message: {
            role: "user",
            content: [
              "<task-notification>",
              "<task-id>agent-task</task-id>",
              "<tool-use-id>toolu_resumed_agent_call</tool-use-id>",
              "<status>completed</status>",
              '<summary>Agent "Inspect application logs" finished</summary>',
              "</task-notification>",
            ].join("\n"),
          },
        },
        { type: "result", subtype: "success", usage: {}, total_cost_usd: 0 },
      ]),
    );
    const session = await new ClaudeAgentClient({
      logger: createTestLogger(),
      queryFactory,
      resolveBinary: async () => "/test/claude/bin",
    }).createSession({ provider: "claude", cwd: process.cwd() });
    const events = await collectUntilTerminal(streamSession(session, "inspect logs"));
    await session.close();
    expect(
      events
        .filter((event) => event.type === "timeline")
        .map((event) => event.item)
        .filter((item) => item.type === "tool_call" && item.name === "task_notification"),
    ).toEqual([]);
    expect(
      events
        .filter((event) => event.type === "provider_subagent")
        .map((event) => event.event)
        .findLast((event) => event.type === "upsert"),
    ).toMatchObject({ id: "toolu_agent", status: "completed" });
  });
});
