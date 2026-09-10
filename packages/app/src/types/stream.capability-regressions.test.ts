import assert from "node:assert/strict";
import invariant from "tiny-invariant";
import { describe, expect, it } from "vitest";
import {
  applyStreamEvent,
  appendOptimisticUserMessageToStream,
  buildOptimisticUserMessage,
  createUserMessage,
  handoffCreatedAgentUserMessageToStream,
  hydrateStreamState,
  reduceStreamUpdate,
  type StreamItem,
  isAgentToolCallItem,
} from "./stream";
import type { AgentProvider, ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
type CanonicalToolStatus = "running" | "completed" | "failed" | "canceled";
function assistantTimeline(
  text: string,
  provider: AgentProvider = "claude",
  messageId?: string,
  turnId?: string,
): AgentStreamEventPayload {
  return {
    type: "timeline",
    provider,
    ...(turnId ? { turnId } : {}),
    item: { type: "assistant_message", text, ...(messageId ? { messageId } : {}) },
  };
}
function reasoningTimeline(
  text: string,
  provider: AgentProvider = "claude",
): AgentStreamEventPayload {
  return {
    type: "timeline",
    provider,
    item: { type: "reasoning", text },
  };
}
function canonicalToolTimeline(params: {
  provider: AgentProvider;
  callId: string;
  name: string;
  status: CanonicalToolStatus;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  detail?: ToolCallDetail;
}): AgentStreamEventPayload {
  const detail: ToolCallDetail = params.detail ?? {
    type: "unknown",
    input: params.input ?? null,
    output: params.output ?? null,
  };
  const baseItem = {
    type: "tool_call" as const,
    callId: params.callId,
    name: params.name,
    status: params.status,
    detail,
    metadata: params.metadata,
  };
  const item =
    params.status === "failed"
      ? {
          ...baseItem,
          status: "failed" as const,
          error: params.error ?? { message: "failed" },
        }
      : {
          ...baseItem,
          error: null,
        };
  return {
    type: "timeline",
    provider: params.provider,
    item,
  };
}
describe("stream reducer canonical tool calls", () => {
  it("tracks reasoning start and completion timestamps", () => {
    const startedAt = new Date("2025-01-01T10:00:02Z");
    const completedAt = new Date("2025-01-01T10:00:04Z");
    const state = hydrateStreamState([
      {
        event: reasoningTimeline("Thinking"),
        timestamp: startedAt,
      },
      {
        event: reasoningTimeline(" some more"),
        timestamp: new Date("2025-01-01T10:00:03Z"),
      },
      {
        event: assistantTimeline("Done"),
        timestamp: completedAt,
      },
    ]);
    const thought = state.find((item) => item.kind === "thought");
    invariant(thought?.kind === "thought");
    expect(thought.startedAt).toEqual(startedAt);
    expect(thought.completedAt).toEqual(completedAt);
    expect(thought.status).toBe("ready");
  });
  it("merges running and completed events by callId", () => {
    const callId = "tool-merge-1";
    const updates = [
      {
        event: canonicalToolTimeline({
          provider: "claude",
          callId,
          name: "shell",
          status: "running",
          input: { command: "pwd" },
        }),
        timestamp: new Date("2025-01-01T10:10:00Z"),
      },
      {
        event: canonicalToolTimeline({
          provider: "claude",
          callId,
          name: "shell",
          status: "completed",
          input: null,
          output: { output: "/tmp/repo\n", exitCode: 0 },
        }),
        timestamp: new Date("2025-01-01T10:10:01Z"),
      },
    ];
    const state = hydrateStreamState(updates);
    const tools = state.filter(isAgentToolCallItem);
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].payload.data.status, "completed");
    expect(tools[0].startedAt).toEqual(new Date("2025-01-01T10:10:00Z"));
    expect(tools[0].completedAt).toEqual(new Date("2025-01-01T10:10:01Z"));
    assert.deepStrictEqual(tools[0].payload.data.detail, {
      type: "unknown",
      input: { command: "pwd" },
      output: {
        output: "/tmp/repo\n",
        exitCode: 0,
      },
    });
  });
});
describe("turn lifecycle events", () => {
  it("shows a visible error when a turn is canceled before completion", () => {
    const canceledAt = new Date("2025-01-01T12:01:00Z");
    const state = reduceStreamUpdate(
      [],
      {
        type: "turn_canceled",
        provider: "codex",
        turnId: "turn-1",
        reason: "interrupted",
      },
      canceledAt,
    );
    expect(state).toEqual([
      expect.objectContaining({
        kind: "activity_log",
        timestamp: canceledAt,
        activityType: "error",
        message:
          "This run was interrupted before it finished. If you did not stop it, continue or resend the instruction.",
        metadata: { reason: "interrupted" },
      }),
    ]);
  });
  it("commits the active head before placing an optimistic user message", () => {
    const optimistic = buildOptimisticUserMessage({
      id: "msg_append_once",
      text: "append once",
      timestamp: new Date("2025-01-01T15:03:20Z"),
    });
    const headItem: StreamItem = {
      kind: "assistant_message",
      id: "assistant-head",
      text: "streaming",
      timestamp: new Date("2025-01-01T15:03:19Z"),
    };
    const first = appendOptimisticUserMessageToStream({
      tail: [],
      head: [headItem],
      message: optimistic,
      placement: "active-head",
    });
    const second = appendOptimisticUserMessageToStream({
      tail: first.tail,
      head: first.head,
      message: optimistic,
      placement: "active-head",
    });
    assert.deepStrictEqual(first.tail, [headItem, optimistic]);
    assert.deepStrictEqual(first.head, []);
    assert.strictEqual(first.changedTail, true);
    assert.strictEqual(first.changedHead, true);
    assert.strictEqual(second.changedTail, false);
    assert.strictEqual(second.head, first.head);
  });
  it("keeps a steered prompt before the assistant output that follows it", () => {
    const beforePrompt: StreamItem = {
      kind: "assistant_message",
      id: "assistant-before-steer",
      messageId: "assistant-turn",
      text: "Initial response.",
      timestamp: new Date("2025-01-01T15:03:19Z"),
    };
    const prompt = buildOptimisticUserMessage({
      id: "steer-prompt",
      text: "Use HTTP instead.",
      timestamp: new Date("2025-01-01T15:03:20Z"),
    });
    const appended = appendOptimisticUserMessageToStream({
      tail: [],
      head: [beforePrompt],
      message: prompt,
      placement: "active-head",
    });
    const afterPrompt = applyStreamEvent({
      tail: appended.tail,
      head: appended.head,
      event: assistantTimeline("Retried with HTTP.", "codex", "assistant-turn"),
      timestamp: new Date("2025-01-01T15:03:21Z"),
    });
    assert.deepStrictEqual(
      [...afterPrompt.tail, ...afterPrompt.head].map((item) => [
        item.kind,
        item.kind === "assistant_message" || item.kind === "user_message" ? item.text : null,
      ]),
      [
        ["assistant_message", "Initial response."],
        ["user_message", "Use HTTP instead."],
        ["assistant_message", "Retried with HTTP."],
      ],
    );
  });
  it("places a late answer before the next turn instead of under its prompt", () => {
    const firstPrompt = createUserMessage({
      id: "first-prompt",
      turnId: "turn-1",
      text: "Investigate the billing issue.",
      timestamp: new Date("2025-01-01T15:03:18Z"),
    });
    const secondPrompt = createUserMessage({
      id: "second-prompt",
      turnId: "turn-2",
      text: "Commit and push the changes.",
      timestamp: new Date("2025-01-01T15:03:20Z"),
    });
    const currentThought: StreamItem = {
      kind: "thought",
      id: "turn-2-thought",
      turnId: "turn-2",
      text: "Checking the repository.",
      timestamp: new Date("2025-01-01T15:03:21Z"),
      status: "loading",
    };

    const result = applyStreamEvent({
      tail: [firstPrompt, secondPrompt],
      head: [currentThought],
      event: assistantTimeline(
        "The billing issue is resolved.",
        "codex",
        "turn-1-answer",
        "turn-1",
      ),
      timestamp: new Date("2025-01-01T15:03:22Z"),
    });

    expect(
      [...result.tail, ...result.head].map((item) => ({
        kind: item.kind,
        turnId: item.turnId,
        text:
          item.kind === "assistant_message" ||
          item.kind === "user_message" ||
          item.kind === "thought"
            ? item.text
            : null,
      })),
    ).toEqual([
      {
        kind: "user_message",
        turnId: "turn-1",
        text: "Investigate the billing issue.",
      },
      {
        kind: "assistant_message",
        turnId: "turn-1",
        text: "The billing issue is resolved.",
      },
      {
        kind: "user_message",
        turnId: "turn-2",
        text: "Commit and push the changes.",
      },
      {
        kind: "thought",
        turnId: "turn-2",
        text: "Checking the repository.",
      },
    ]);
    expect(result.head).toEqual([currentThought]);
  });
  it("keeps a late answer out of a newer turn that is still entirely in the head", () => {
    const firstPrompt = createUserMessage({
      id: "first-head-prompt",
      turnId: "turn-1",
      text: "Investigate the billing issue.",
      timestamp: new Date("2025-01-01T15:03:18Z"),
    });
    const secondPrompt = createUserMessage({
      id: "second-head-prompt",
      turnId: "turn-2",
      text: "Commit and push the changes.",
      timestamp: new Date("2025-01-01T15:03:20Z"),
    });

    const result = applyStreamEvent({
      tail: [firstPrompt],
      head: [secondPrompt],
      event: assistantTimeline(
        "The billing issue is resolved.",
        "codex",
        "turn-1-head-answer",
        "turn-1",
      ),
      timestamp: new Date("2025-01-01T15:03:22Z"),
    });

    expect(result.tail).toEqual([
      firstPrompt,
      expect.objectContaining({
        kind: "assistant_message",
        turnId: "turn-1",
        text: "The billing issue is resolved.",
      }),
    ]);
    expect(result.head).toEqual([secondPrompt]);
  });
  it("hands rich optimistic content to an authoritative create message without duplicating it", () => {
    const timestamp = new Date("2025-01-01T15:03:20Z");
    const submitted = createUserMessage({
      clientMessageId: "client-user",
      text: "",
      timestamp,
      images: [
        {
          id: "image-1",
          mimeType: "image/png",
          storageType: "web-indexeddb",
          storageKey: "image-1",
          createdAt: timestamp.getTime(),
        },
      ],
      attachments: [
        {
          type: "text",
          mimeType: "text/plain",
          text: "Previous conversation",
          title: "Chat history",
          contextKind: "chat_history",
        },
      ],
    });
    const precedingProviderRow: StreamItem = {
      kind: "user_message",
      id: "provider-system-user",
      messageId: "provider-system-user",
      text: "provider setup prompt",
      timestamp: new Date("2025-01-01T15:03:20.500Z"),
    };
    const canonical: StreamItem = {
      kind: "user_message",
      id: "provider-user",
      messageId: "provider-user",
      clientMessageId: "client-user",
      text: "server-rendered attachment text",
      timestamp: new Date("2025-01-01T15:03:21Z"),
    };
    const handedOff = handoffCreatedAgentUserMessageToStream({
      tail: [precedingProviderRow, canonical],
      head: [],
      message: submitted,
    });
    const repeated = handoffCreatedAgentUserMessageToStream({
      tail: handedOff.tail,
      head: handedOff.head,
      message: submitted,
    });
    assert.deepStrictEqual(handedOff.tail, [
      precedingProviderRow,
      {
        kind: "user_message",
        id: "client-user",
        clientMessageId: "client-user",
        messageId: "provider-user",
        text: submitted.text,
        timestamp: submitted.timestamp,
        images: submitted.images,
        attachments: submitted.attachments,
      },
    ]);
    assert.deepStrictEqual(handedOff.head, []);
    assert.deepStrictEqual(repeated.tail, handedOff.tail);
    assert.deepStrictEqual(repeated.head, handedOff.head);
    const afterNextUser = reduceStreamUpdate(
      handedOff.tail,
      {
        type: "timeline",
        provider: "claude",
        item: {
          type: "user_message",
          text: "Next prompt",
          messageId: "provider-next-user",
        },
      },
      new Date("2025-01-01T15:04:00Z"),
    );
    assert.deepStrictEqual(
      afterNextUser.filter((item) => item.kind === "user_message").map((item) => item.id),
      ["provider-system-user", "client-user", "provider-next-user"],
    );
  });
});
