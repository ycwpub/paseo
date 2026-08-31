import { describe, expect, it } from "vitest";
import type { QueueWriter } from "@/composer/actions";
import type { ResourceAwareQueuedComposerMessage as QueuedComposerMessage } from "@/composer/resource-selection";
import {
  beginQueuedMessageEdit,
  cancelQueuedMessageEdit,
  finishQueuedMessageEdit,
  getNextQueuedMessage,
  getVisibleQueuedMessages,
} from "@/composer/queued-message-edit";

function createQueue(messages: QueuedComposerMessage[]): QueueWriter & {
  state: Map<string, QueuedComposerMessage[]>;
} {
  const queue: QueueWriter & { state: Map<string, QueuedComposerMessage[]> } = {
    state: new Map([["agent", messages]]),
    read(agentId) {
      return this.state.get(agentId) ?? [];
    },
    write(update) {
      this.state = update(this.state);
    },
  };
  return queue;
}

function message(id: string, text: string): QueuedComposerMessage {
  return { id, text, attachments: [] };
}

describe("queued message editing", () => {
  it("returns the selected message to the composer while reserving its queue position", () => {
    const queue = createQueue([
      message("first", "first"),
      message("second", "second"),
      message("third", "third"),
    ]);

    const session = beginQueuedMessageEdit({
      agentId: "agent",
      messageId: "second",
      queue,
    });

    expect(session).toEqual({
      agentId: "agent",
      message: message("second", "second"),
      originalIndex: 1,
      previousMessageId: "first",
      nextMessageId: "third",
    });
    expect(getVisibleQueuedMessages(queue.state.get("agent") ?? []).map((item) => item.id)).toEqual(
      ["first", "third"],
    );
    expect(getNextQueuedMessage(queue.state.get("agent") ?? [])?.id).toBe("first");
  });

  it("commits edited content at the original queue position", () => {
    const queue = createQueue([
      message("first", "first"),
      message("second", "second"),
      message("third", "third"),
    ]);
    const session = beginQueuedMessageEdit({
      agentId: "agent",
      messageId: "second",
      queue,
    });
    expect(session).not.toBeNull();

    const finished = finishQueuedMessageEdit({
      session: session!,
      text: "  updated  ",
      attachments: [],
      selectedMcpServerIds: ["mcp"],
      selectedSkillIds: ["skill"],
      queue,
    });

    expect(finished).toBe(true);
    expect(queue.state.get("agent")).toEqual([
      message("first", "first"),
      {
        id: "second",
        text: "updated",
        attachments: [],
        selectedMcpServerIds: ["mcp"],
        selectedSkillIds: ["skill"],
      },
      message("third", "third"),
    ]);
  });

  it("blocks automatic draining when the item being edited reaches the front", () => {
    const queue = createQueue([message("first", "first"), message("second", "second")]);
    const session = beginQueuedMessageEdit({
      agentId: "agent",
      messageId: "first",
      queue,
    });
    expect(session).not.toBeNull();

    expect(getNextQueuedMessage(queue.state.get("agent") ?? [])).toBeNull();
  });

  it("restores the original message when editing is cancelled", () => {
    const queue = createQueue([
      message("first", "first"),
      message("second", "second"),
      message("third", "third"),
    ]);
    const session = beginQueuedMessageEdit({
      agentId: "agent",
      messageId: "second",
      queue,
    });
    expect(session).not.toBeNull();

    cancelQueuedMessageEdit({ session: session!, queue });

    expect(queue.state.get("agent")).toEqual([
      message("first", "first"),
      message("second", "second"),
      message("third", "third"),
    ]);
  });

  it("uses the neighboring queue items to restore order if the placeholder disappears", () => {
    const queue = createQueue([
      message("first", "first"),
      message("second", "second"),
      message("third", "third"),
    ]);
    const session = beginQueuedMessageEdit({
      agentId: "agent",
      messageId: "second",
      queue,
    });
    expect(session).not.toBeNull();
    queue.state.set("agent", [message("first", "first"), message("third", "third")]);

    finishQueuedMessageEdit({
      session: session!,
      text: "updated",
      attachments: [],
      selectedMcpServerIds: [],
      selectedSkillIds: [],
      queue,
    });

    expect(queue.state.get("agent")?.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});
