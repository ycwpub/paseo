import { describe, expect, it, vi } from "vitest";
import { removeWorkspaces } from "./workspace-remove";

describe("removeWorkspaces", () => {
  it("removes each Workspace through its own Host client", async () => {
    const removedByServer = new Map<string, string[]>();
    const failures = await removeWorkspaces({
      getClient: (serverId) => ({
        removeWorkspace: vi.fn(async (workspaceId: string) => {
          removedByServer.set(serverId, [...(removedByServer.get(serverId) ?? []), workspaceId]);
        }),
      }),
      workspaces: [
        { serverId: "host-a", workspaceId: "workspace-a" },
        { serverId: "host-b", workspaceId: "workspace-b" },
      ],
    });

    expect(failures).toEqual([]);
    expect(removedByServer).toEqual(
      new Map([
        ["host-a", ["workspace-a"]],
        ["host-b", ["workspace-b"]],
      ]),
    );
  });

  it("keeps failures isolated so successful Workspace deletion can continue", async () => {
    const failures = await removeWorkspaces({
      getClient: (serverId) =>
        serverId === "offline"
          ? null
          : {
              removeWorkspace: vi.fn(async (workspaceId: string) => {
                if (workspaceId === "rejected") {
                  throw new Error("rejected");
                }
              }),
            },
      workspaces: [
        { serverId: "host-a", workspaceId: "removed" },
        { serverId: "host-a", workspaceId: "rejected" },
        { serverId: "offline", workspaceId: "disconnected" },
      ],
    });

    expect(failures).toHaveLength(2);
    expect(failures.map(({ serverId, workspaceId }) => `${serverId}:${workspaceId}`)).toEqual([
      "host-a:rejected",
      "offline:disconnected",
    ]);
  });
});
