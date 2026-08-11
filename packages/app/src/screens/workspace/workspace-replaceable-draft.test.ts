import { describe, expect, it } from "vitest";
import type { DraftRecord } from "@/stores/draft-store/state";
import type { PendingCreateAttempt } from "@/stores/create-flow-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { resolveReplaceableWorkspaceDraftTabId } from "./workspace-replaceable-draft";

const tab: WorkspaceTab = {
  tabId: "draft-1",
  target: { kind: "draft", draftId: "draft-1" },
  createdAt: 1,
};

function draftRecord(text = "", attachmentCount = 0): DraftRecord {
  return {
    input: {
      text,
      attachments: Array.from({ length: attachmentCount }, () => ({ kind: "image" }) as never),
    },
    lifecycle: "active",
    updatedAt: 1,
    version: 1,
  };
}

function pendingCreate(): PendingCreateAttempt {
  return {
    draftId: "draft-1",
    serverId: "server-1",
    agentId: null,
    clientMessageId: "message-1",
    text: "Create an agent",
    timestamp: 1,
    lifecycle: "active",
  };
}

describe("resolveReplaceableWorkspaceDraftTabId", () => {
  it("reuses the focused untouched draft", () => {
    expect(
      resolveReplaceableWorkspaceDraftTabId({
        tab,
        serverId: "server-1",
        draftRecord: undefined,
        pendingCreate: undefined,
      }),
    ).toBe(tab.tabId);
  });

  it("does not replace a draft with text, attachments, or setup", () => {
    expect(
      resolveReplaceableWorkspaceDraftTabId({
        tab,
        serverId: "server-1",
        draftRecord: draftRecord("keep this"),
        pendingCreate: undefined,
      }),
    ).toBeNull();
    expect(
      resolveReplaceableWorkspaceDraftTabId({
        tab,
        serverId: "server-1",
        draftRecord: draftRecord("", 1),
        pendingCreate: undefined,
      }),
    ).toBeNull();
    expect(
      resolveReplaceableWorkspaceDraftTabId({
        tab: {
          ...tab,
          target: {
            kind: "draft",
            draftId: "draft-1",
            setup: {
              provider: "codex",
              cwd: "/repo",
              modeId: null,
              model: null,
              thinkingOptionId: null,
              featureValues: {},
            },
          },
        },
        serverId: "server-1",
        draftRecord: undefined,
        pendingCreate: undefined,
      }),
    ).toBeNull();
  });

  it("does not replace a draft while its Agent creation is active", () => {
    expect(
      resolveReplaceableWorkspaceDraftTabId({
        tab,
        serverId: "server-1",
        draftRecord: undefined,
        pendingCreate: pendingCreate(),
      }),
    ).toBeNull();
  });
});
