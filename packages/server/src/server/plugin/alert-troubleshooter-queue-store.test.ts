import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AlertTroubleshooterQueueStore } from "./alert-troubleshooter-queue-store.js";

const temporaryHomes: string[] = [];

function createStore(): { home: string; store: AlertTroubleshooterQueueStore } {
  const home = mkdtempSync(path.join(tmpdir(), "paseo-alert-queue-"));
  temporaryHomes.push(home);
  return {
    home,
    store: new AlertTroubleshooterQueueStore(
      home,
      "argos-alert-troubleshooter",
      () => new Date("2026-09-06T08:00:00.000Z"),
    ),
  };
}

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe("AlertTroubleshooterQueueStore", () => {
  it("persists queued items and deduplicates the same record", () => {
    const { home, store } = createStore();
    const first = store.enqueue("prj_1", {
      recordId: "rec_1",
      messageId: "om_1",
      trigger: "message",
    });
    const duplicate = store.enqueue("prj_1", {
      recordId: "rec_1",
      messageId: "om_1",
      trigger: "schedule",
    });
    const restored = new AlertTroubleshooterQueueStore(home, "argos-alert-troubleshooter");

    expect(duplicate.id).toBe(first.id);
    expect(restored.countQueued("prj_1")).toBe(1);
  });

  it("does not requeue an active item until a new store restores after restart", () => {
    const { home, store } = createStore();
    store.enqueue("prj_1", { recordId: "rec_1", trigger: "table" });

    expect(store.claimNext("prj_1")?.status).toBe("running");
    expect(store.countQueued("prj_1")).toBe(0);

    const restarted = new AlertTroubleshooterQueueStore(home, "argos-alert-troubleshooter");
    expect(restarted.countQueued("prj_1")).toBe(1);
  });

  it("allows a failed or completed record to be forced back into the queue", () => {
    const { store } = createStore();
    const first = store.enqueue("prj_1", { recordId: "rec_1", trigger: "table" });
    store.claimNext("prj_1");
    store.complete("prj_1", first.id, "agent-1");

    const forced = store.enqueue("prj_1", {
      recordId: "rec_1",
      trigger: "manual",
      force: true,
    });

    expect(forced.id).not.toBe(first.id);
    expect(store.claimNext("prj_1", { trigger: "manual" })?.id).toBe(forced.id);
  });

  it("does not automatically enqueue a previously failed record again", () => {
    const { store } = createStore();
    const first = store.enqueue("prj_1", { recordId: "rec_1", trigger: "table" });
    store.fail("prj_1", first.id, "temporary failure");

    const duplicate = store.enqueue("prj_1", { recordId: "rec_1", trigger: "table" });

    expect(duplicate.id).toBe(first.id);
    expect(store.list("prj_1")).toHaveLength(1);
    expect(store.list("prj_1")[0]?.status).toBe("failed");
  });

  it("lists, pauses, and deletes execution records", () => {
    const { store } = createStore();
    const queued = store.enqueue("prj_1", {
      recordId: "rec_1",
      uniqueId: "result_id:1",
      tableDate: "20260906",
      trigger: "schedule",
      matchedCount: 3,
    });

    expect(store.list("prj_1")[0]).toMatchObject({
      uniqueId: "result_id:1",
      matchedCount: 3,
      status: "queued",
    });
    expect(store.pause("prj_1", [queued.id]).map((task) => task.id)).toEqual([queued.id]);
    expect(store.get("prj_1", queued.id)?.status).toBe("paused");
    expect(store.deleteMany("prj_1", [queued.id]).map((task) => task.id)).toEqual([queued.id]);
    expect(store.list("prj_1")).toEqual([]);
  });
});
