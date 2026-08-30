import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import { collectAllTabs, createWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

function createWorkspaceLayoutIds() {
  let sequence = 0;
  return {
    createNodeId: (prefix: "pane" | "group") => `${prefix}_multi_repo_${++sequence}`,
    createFocusRestorationToken: () => `workspace-focus-multi-repo-${++sequence}`,
  };
}

function createWorkspaceKey(): string {
  const key = buildWorkspaceTabPersistenceKey({
    serverId: "server-1",
    workspaceId: "workspace-1",
  });
  if (!key) {
    throw new Error("Expected a workspace persistence key");
  }
  return key;
}

describe("multi-repository working Diff layout", () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem("workspace-layout-state");
  });

  it("rehydrates the repository root", async () => {
    const workspaceKey = createWorkspaceKey();
    const source = createWorkspaceLayoutStore(createWorkspaceLayoutIds());
    await source.persist.rehydrate();
    source.getState().openTab({
      workspaceKey,
      target: {
        kind: "working_diff",
        cwd: "/project/repos/service-a",
        focusPath: "src/index.ts",
        focusRequestId: 42,
      },
      intent: "reveal",
    });

    await vi.waitFor(async () => {
      const persisted = await AsyncStorage.getItem("workspace-layout-state");
      expect(persisted).toContain("/project/repos/service-a");
    });

    const restored = createWorkspaceLayoutStore(createWorkspaceLayoutIds());
    await restored.persist.rehydrate();
    const workingDiff = collectAllTabs(
      restored.getState().layoutByWorkspace[workspaceKey].root,
    ).find((tab) => tab.target.kind === "working_diff");

    expect(workingDiff?.target).toEqual({
      kind: "working_diff",
      cwd: "/project/repos/service-a",
      focusPath: "src/index.ts",
      focusRequestId: 42,
    });
  });

  it("reuses the Diff pane while switching repositories", () => {
    const workspaceKey = createWorkspaceKey();
    const store = createWorkspaceLayoutStore(createWorkspaceLayoutIds());
    const firstTabId = store.getState().openTab({
      workspaceKey,
      target: {
        kind: "working_diff",
        cwd: "/project/repos/service-a",
        focusPath: "src/index.ts",
        focusRequestId: 1,
      },
      intent: "reveal",
    });

    expect(
      store.getState().openTab({
        workspaceKey,
        target: {
          kind: "working_diff",
          cwd: "/project/repos/service-b",
          focusPath: "src/index.ts",
          focusRequestId: 2,
        },
        intent: "reveal",
      }),
    ).toBe(firstTabId);

    const workingDiffTabs = collectAllTabs(
      store.getState().layoutByWorkspace[workspaceKey].root,
    ).filter((tab) => tab.target.kind === "working_diff");
    expect(workingDiffTabs).toHaveLength(1);
    expect(workingDiffTabs[0]?.target).toEqual({
      kind: "working_diff",
      cwd: "/project/repos/service-b",
      focusPath: "src/index.ts",
      focusRequestId: 2,
    });
  });
});
