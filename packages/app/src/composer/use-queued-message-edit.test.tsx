// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { UserComposerAttachment } from "@/attachments/types";
import type { QueueWriter, QueuedComposerMessage } from "@/composer/actions";
import { useQueuedMessageEdit } from "@/composer/use-queued-message-edit";

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

describe("useQueuedMessageEdit", () => {
  it("moves a queued message into the composer and restores the previous draft after submission", () => {
    const queue = createQueue([
      message("first", "first"),
      {
        ...message("second", "queued text"),
        selectedMcpServerIds: ["queued-mcp"],
        selectedSkillIds: ["queued-skill"],
      },
      message("third", "third"),
    ]);
    const resumeQueue = vi.fn();
    const focusInput = vi.fn();
    const clearError = vi.fn();
    const suppressWorkspaceAttachments = vi.fn();
    const resetWorkspaceAttachmentSuppression = vi.fn();

    const { result } = renderHook(() => {
      const [text, setText] = useState("current draft");
      const [attachments, setAttachments] = useState<UserComposerAttachment[]>([]);
      const [selectedMcpServerIds, setSelectedMcpServerIds] = useState(["draft-mcp"]);
      const [selectedSkillIds, setSelectedSkillIds] = useState(["draft-skill"]);
      const editor = useQueuedMessageEdit({
        serverId: "server",
        agentId: "agent",
        queue,
        queuedMessages: queue.state.get("agent") ?? [],
        text,
        attachments,
        currentDraftAttachments: attachments,
        selectedMcpServerIds,
        selectedSkillIds,
        setText,
        setAttachments,
        setSelectedMcpServerIds,
        setSelectedSkillIds,
        suppressCurrentWorkspaceAttachments: suppressWorkspaceAttachments,
        resetWorkspaceAttachmentSuppression,
        focusInput,
        clearError,
        resumeQueue,
      });
      return {
        editor,
        text,
        selectedMcpServerIds,
        selectedSkillIds,
        setText,
      };
    });

    act(() => {
      result.current.editor.begin("second");
    });

    expect(result.current.text).toBe("queued text");
    expect(result.current.selectedMcpServerIds).toEqual(["queued-mcp"]);
    expect(result.current.selectedSkillIds).toEqual(["queued-skill"]);
    expect(result.current.editor.visibleMessages.map((item) => item.id)).toEqual([
      "first",
      "third",
    ]);
    expect(clearError).toHaveBeenCalledOnce();
    expect(focusInput).toHaveBeenCalledOnce();

    act(() => {
      result.current.setText("edited text");
    });
    act(() => {
      result.current.editor.submit({ text: result.current.text });
    });

    expect(queue.state.get("agent")?.map((item) => [item.id, item.text])).toEqual([
      ["first", "first"],
      ["second", "edited text"],
      ["third", "third"],
    ]);
    expect(result.current.text).toBe("current draft");
    expect(result.current.selectedMcpServerIds).toEqual(["draft-mcp"]);
    expect(result.current.selectedSkillIds).toEqual(["draft-skill"]);
    expect(resumeQueue).toHaveBeenCalledOnce();
  });

  it("restores the queued message and previous draft when editing is cancelled", () => {
    const queue = createQueue([message("first", "first"), message("second", "second")]);
    const resumeQueue = vi.fn();
    const suppressWorkspaceAttachments = vi.fn();
    const resetWorkspaceAttachmentSuppression = vi.fn();
    const focusInput = vi.fn();
    const clearError = vi.fn();

    const { result } = renderHook(() => {
      const [text, setText] = useState("current draft");
      const [attachments, setAttachments] = useState<UserComposerAttachment[]>([]);
      const [selectedMcpServerIds, setSelectedMcpServerIds] = useState<string[]>([]);
      const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
      const editor = useQueuedMessageEdit({
        serverId: "server",
        agentId: "agent",
        queue,
        queuedMessages: queue.state.get("agent") ?? [],
        text,
        attachments,
        currentDraftAttachments: attachments,
        selectedMcpServerIds,
        selectedSkillIds,
        setText,
        setAttachments,
        setSelectedMcpServerIds,
        setSelectedSkillIds,
        suppressCurrentWorkspaceAttachments: suppressWorkspaceAttachments,
        resetWorkspaceAttachmentSuppression,
        focusInput,
        clearError,
        resumeQueue,
      });
      return { editor, text, setText };
    });

    act(() => {
      result.current.editor.begin("first");
      result.current.setText("unfinished edit");
    });
    act(() => {
      result.current.editor.cancel();
    });

    expect(queue.state.get("agent")).toEqual([
      message("first", "first"),
      message("second", "second"),
    ]);
    expect(result.current.text).toBe("current draft");
    expect(resumeQueue).toHaveBeenCalledOnce();
  });
});
