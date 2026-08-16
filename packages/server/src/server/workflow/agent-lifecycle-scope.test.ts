import { describe, expect, it } from "vitest";
import { WorkflowAgentLifecycleScope } from "./agent-lifecycle-scope.js";

async function waitForOrderLength(order: string[], length: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (order.length >= length) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error(`Expected ${length} lifecycle events, received ${order.length}`);
}

describe("WorkflowAgentLifecycleScope", () => {
  it("creates one resource per key and reuses it", async () => {
    const scope = new WorkflowAgentLifecycleScope<{ id: string }>();
    let created = 0;
    const create = async () => ({ id: `agent-${++created}` });

    const first = await scope.withResource({
      key: "review",
      create,
      run: async (resource) => resource.id,
    });
    const second = await scope.withResource({
      key: "review",
      create,
      run: async (resource) => resource.id,
    });

    expect([first, second]).toEqual(["agent-1", "agent-1"]);
    expect(created).toBe(1);
  });

  it("serializes concurrent runs that reuse one Agent", async () => {
    const scope = new WorkflowAgentLifecycleScope<{ id: string }>();
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = scope.withResource({
      key: "review",
      create: async () => ({ id: "agent" }),
      run: async () => {
        order.push("first:start");
        await firstGate;
        order.push("first:end");
      },
    });
    const second = scope.withResource({
      key: "review",
      create: async () => ({ id: "unused" }),
      run: async () => {
        order.push("second:start");
        order.push("second:end");
      },
    });

    await waitForOrderLength(order, 1);
    expect(order).toEqual(["first:start"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("closes each initialized resource once", async () => {
    const scope = new WorkflowAgentLifecycleScope<{ id: string }>();
    await scope.withResource({
      key: "a",
      create: async () => ({ id: "agent-a" }),
      run: async () => undefined,
    });
    await scope.withResource({
      key: "b",
      create: async () => ({ id: "agent-b" }),
      run: async () => undefined,
    });
    const closed: string[] = [];

    await scope.close(async (resource) => {
      closed.push(resource.id);
    });
    await scope.close(async () => {
      throw new Error("Scope must close only once");
    });

    expect(closed.sort()).toEqual(["agent-a", "agent-b"]);
  });
});
