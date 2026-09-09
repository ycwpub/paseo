import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AlertTroubleshooterQueueStore } from "./alert-troubleshooter-queue-store.js";

const temporaryHomes: string[] = [];

function createStore(): {
  home: string;
  store: AlertTroubleshooterQueueStore;
  setNow: (value: string) => void;
} {
  const home = mkdtempSync(path.join(tmpdir(), "paseo-alert-queue-"));
  temporaryHomes.push(home);
  let now = new Date("2026-09-06T08:00:00.000Z");
  return {
    home,
    store: new AlertTroubleshooterQueueStore(home, "argos-alert-troubleshooter", () => now),
    setNow: (value) => {
      now = new Date(value);
    },
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
    store.fail("prj_1", first.id, "temporary failure", {
      intervalMinutes: 30,
      maxAutomaticRetries: 3,
    });

    const duplicate = store.enqueue("prj_1", { recordId: "rec_1", trigger: "table" });

    expect(duplicate.id).toBe(first.id);
    expect(store.list("prj_1")).toHaveLength(1);
    expect(store.list("prj_1")[0]?.status).toBe("failed");
  });

  it("waits for the configured interval and stops after three automatic retries", () => {
    const { store, setNow } = createStore();
    const task = store.enqueue("prj_1", { recordId: "rec_retry", trigger: "table" });
    const retry = { intervalMinutes: 30, maxAutomaticRetries: 3 };

    expect(store.claimNext("prj_1", { maxAutomaticRetries: 3 })?.attempts).toBe(1);
    store.fail("prj_1", task.id, "attempt 1 failed", retry);
    expect(store.get("prj_1", task.id)?.nextRetryAt).toBe("2026-09-06T08:30:00.000Z");

    setNow("2026-09-06T08:29:59.999Z");
    expect(store.promoteDueRetries("prj_1", retry)).toBe(0);
    expect(store.claimNext("prj_1", { maxAutomaticRetries: 3 })).toBeNull();

    for (const [dueAt, expectedAttempts] of [
      ["2026-09-06T08:30:00.000Z", 2],
      ["2026-09-06T09:00:00.000Z", 3],
      ["2026-09-06T09:30:00.000Z", 4],
    ] as const) {
      setNow(dueAt);
      expect(store.promoteDueRetries("prj_1", retry)).toBe(1);
      expect(store.claimNext("prj_1", { maxAutomaticRetries: 3 })?.attempts).toBe(expectedAttempts);
      store.fail("prj_1", task.id, `attempt ${expectedAttempts} failed`, retry);
    }

    expect(store.get("prj_1", task.id)).toMatchObject({
      status: "failed",
      attempts: 4,
      nextRetryAt: null,
      error: "attempt 4 failed",
    });
    setNow("2026-09-07T09:30:00.000Z");
    expect(store.promoteDueRetries("prj_1", retry)).toBe(0);
    expect(store.claimNext("prj_1", { maxAutomaticRetries: 3 })).toBeNull();
  });

  it("recalculates the next retry when the configured interval changes", () => {
    const { store, setNow } = createStore();
    const task = store.enqueue("prj_1", { recordId: "rec_retry", trigger: "table" });
    store.claimNext("prj_1", { maxAutomaticRetries: 3 });
    store.fail("prj_1", task.id, "temporary failure", {
      intervalMinutes: 30,
      maxAutomaticRetries: 3,
    });

    setNow("2026-09-06T08:10:00.000Z");
    expect(
      store.promoteDueRetries("prj_1", {
        intervalMinutes: 5,
        maxAutomaticRetries: 3,
      }),
    ).toBe(1);
  });

  it("can pause a failed task that is waiting for its retry interval", () => {
    const { store } = createStore();
    const task = store.enqueue("prj_1", { recordId: "rec_retry", trigger: "table" });
    store.claimNext("prj_1", { maxAutomaticRetries: 3 });
    store.fail("prj_1", task.id, "temporary failure", {
      intervalMinutes: 30,
      maxAutomaticRetries: 3,
    });

    expect(store.pause("prj_1", [task.id])).toEqual([
      expect.objectContaining({
        id: task.id,
        status: "paused",
        nextRetryAt: null,
      }),
    ]);
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

  it("persists a relocated Base record reference on an existing task", () => {
    const { store } = createStore();
    const task = store.enqueue("prj_1", {
      recordId: "rec_stale",
      uniqueId: "19626626",
      resultId: "19626626",
      tableDate: "20260906",
      trigger: "table",
    });

    expect(
      store.replaceRecordReference("prj_1", task.id, {
        recordId: "rec_current",
        uniqueId: "19626626",
        resultId: "19626626",
        tableDate: "20260907",
        messageId: null,
      }),
    ).toMatchObject({
      recordId: "rec_current",
      tableDate: "20260907",
    });
    expect(store.get("prj_1", task.id)).toMatchObject({
      recordId: "rec_current",
      tableDate: "20260907",
    });
  });
});
