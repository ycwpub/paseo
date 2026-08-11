import { describe, expect, it } from "vitest";
import {
  completeWorkspaceDirectoryRefresh,
  failWorkspaceDirectoryRefresh,
  INITIAL_WORKSPACE_DIRECTORY_STATUS,
  isWorkspaceDirectoryLoading,
  startWorkspaceDirectoryRefresh,
  workspaceDirectoryConnectionPatch,
} from "./workspace-directory-status";

describe("workspace directory status", () => {
  it("distinguishes initial loading from background revalidation", () => {
    const initialLoading = startWorkspaceDirectoryRefresh(INITIAL_WORKSPACE_DIRECTORY_STATUS);
    const ready = completeWorkspaceDirectoryRefresh();
    const revalidating = startWorkspaceDirectoryRefresh(ready);

    expect(initialLoading).toEqual({
      workspaceDirectoryStatus: "initial_loading",
      workspaceDirectoryError: null,
      hasEverLoadedWorkspaceDirectory: false,
    });
    expect(revalidating).toEqual({
      workspaceDirectoryStatus: "revalidating",
      workspaceDirectoryError: null,
      hasEverLoadedWorkspaceDirectory: true,
    });
  });

  it("keeps previously loaded replicas usable after a refresh failure", () => {
    const failed = failWorkspaceDirectoryRefresh(
      completeWorkspaceDirectoryRefresh(),
      "Timeout waiting for message (60000ms)",
    );

    expect(failed).toEqual({
      workspaceDirectoryStatus: "error_after_ready",
      workspaceDirectoryError: "Timeout waiting for message (60000ms)",
      hasEverLoadedWorkspaceDirectory: true,
    });
    expect(isWorkspaceDirectoryLoading({ ...failed, connectionStatus: "online" })).toBe(false);
  });

  it("stops initial loading when the first refresh fails", () => {
    const failed = failWorkspaceDirectoryRefresh(
      INITIAL_WORKSPACE_DIRECTORY_STATUS,
      "Timeout waiting for message (60000ms)",
    );

    expect(isWorkspaceDirectoryLoading({ ...failed, connectionStatus: "online" })).toBe(false);
  });

  it("uses connection state only before the first successful load", () => {
    expect(
      workspaceDirectoryConnectionPatch(INITIAL_WORKSPACE_DIRECTORY_STATUS, {
        status: "online",
        error: null,
      }),
    ).toEqual({
      workspaceDirectoryStatus: "initial_loading",
      workspaceDirectoryError: null,
    });

    expect(
      workspaceDirectoryConnectionPatch(INITIAL_WORKSPACE_DIRECTORY_STATUS, {
        status: "error",
        error: "connection failed",
      }),
    ).toEqual({
      workspaceDirectoryStatus: "error_before_first_success",
      workspaceDirectoryError: "connection failed",
    });

    expect(
      workspaceDirectoryConnectionPatch(completeWorkspaceDirectoryRefresh(), {
        status: "error",
        error: "connection failed",
      }),
    ).toEqual({});
  });
});
