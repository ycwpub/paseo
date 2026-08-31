import { describe, expect, it, vi } from "vitest";
import type { QueueWriter, QueuedComposerMessage } from "@/composer/actions";
import {
  removeQueuedComposerMessage,
  sendQueuedComposerMessageNow,
} from "@/composer/queued-message-actions";

function createQueue(messages: QueuedComposerMessage[]): QueueWriter & {
  state: Map<string, QueuedComposerMessage[]>;
} {
  return {
    state: new Map([["agent", messages]]),
    read(agentId) {
      return this.state.get(agentId) ?? [];
    },
    write(update) {
      this.state = update(this.state);
    },
  };
}

function message(id: string): QueuedComposerMessage {
  return { id, text: id, attachments: [] };
}

describe("queued message actions", () => {
  it("deletes only the selected queued message", () => {
    const queue = createQueue([message("first"), message("second"), message("third")]);

    expect(
      removeQueuedComposerMessage({
        agentId: "agent",
        messageId: "second",
        queue,
      }),
    ).toEqual(message("second"));
    expect(queue.state.get("agent")?.map((item) => item.id)).toEqual(["first", "third"]);
  });

  it("restores a failed immediate steer at its original queue position", async () => {
    const queue = createQueue([message("first"), message("second"), message("third")]);

    const result = await sendQueuedComposerMessageNow({
      agentId: "agent",
      messageId: "second",
      queue,
      submitMessage: vi.fn().mockRejectedValue(new Error("offline")),
    });

    expect(result).toEqual({ status: "failed", errorMessage: "offline" });
    expect(queue.state.get("agent")?.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });

  it("forwards queued resource selections when steering immediately", async () => {
    const queue = createQueue([
      {
        ...message("selected"),
        selectedMcpServerIds: ["mcp"],
        selectedSkillIds: ["skill"],
      },
    ]);
    const submitMessage = vi.fn().mockResolvedValue(undefined);

    await sendQueuedComposerMessageNow({
      agentId: "agent",
      messageId: "selected",
      queue,
      submitMessage,
    });

    expect(submitMessage).toHaveBeenCalledWith({
      text: "selected",
      attachments: [],
      selectedMcpServerIds: ["mcp"],
      selectedSkillIds: ["skill"],
    });
  });
});
