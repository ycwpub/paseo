import { describe, expect, it } from "vitest";
import {
  IslandNotificationQueue,
  parseIslandNotification,
  shouldAutoDismissIslandNotification,
  type IslandNotification,
} from "./island-model";

function notification(
  id: string,
  kind: IslandNotification["kind"],
  updatedAt: number,
): IslandNotification {
  return {
    id,
    kind,
    title: id,
    body: "",
    durationMs: 8_000,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("island notification model", () => {
  it("parses safe input and applies kind-specific defaults", () => {
    expect(
      parseIslandNotification(
        {
          id: " agent-1 ",
          kind: "permission",
          title: " Agent needs permission ",
          body: " Review the command ",
          data: { agentId: "agent-1" },
        },
        100,
        () => "generated",
      ),
    ).toEqual({
      id: "agent-1",
      kind: "permission",
      title: "Agent needs permission",
      body: "Review the command",
      data: { agentId: "agent-1" },
      durationMs: 30_000,
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("rejects notifications without a title", () => {
    expect(parseIslandNotification({ title: "  " }, 100, () => "generated")).toBeNull();
  });

  it("prioritizes permission and error while keeping newest items first", () => {
    const queue = new IslandNotificationQueue();
    queue.upsert(notification("finished", "finished", 30));
    queue.upsert(notification("permission-old", "permission", 10));
    queue.upsert(notification("error", "error", 40));
    queue.upsert(notification("permission-new", "permission", 20));

    expect(queue.list().map((item) => item.id)).toEqual([
      "permission-new",
      "permission-old",
      "error",
      "finished",
    ]);
  });

  it("updates an existing agent reminder without duplicating it", () => {
    const queue = new IslandNotificationQueue();
    queue.upsert(notification("agent-1", "running", 10));
    queue.upsert(notification("agent-1", "finished", 20));

    expect(queue.list()).toHaveLength(1);
    expect(queue.current()).toMatchObject({
      id: "agent-1",
      kind: "finished",
      createdAt: 10,
      updatedAt: 20,
    });
  });

  it("keeps every reminder resident until it is opened or cleared", () => {
    expect(shouldAutoDismissIslandNotification("running")).toBe(false);
    expect(shouldAutoDismissIslandNotification("finished")).toBe(false);
    expect(shouldAutoDismissIslandNotification("error")).toBe(false);
    expect(shouldAutoDismissIslandNotification("permission")).toBe(false);
    expect(shouldAutoDismissIslandNotification("info")).toBe(false);
  });
});
