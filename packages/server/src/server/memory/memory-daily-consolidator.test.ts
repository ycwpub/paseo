import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { MemoryDailyConsolidator } from "./memory-daily-consolidator.js";
import type { MemoryOrganizationPlan } from "./memory-organization.js";

const EMPTY_RESULT: MemoryOrganizationPlan = {
  scanned: 0,
  merges: [],
  removeIds: [],
  skippedExplicit: 0,
  scopeCounts: {},
};

describe("MemoryDailyConsolidator", () => {
  let paseoHome: string;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-memory-daily-"));
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("runs once when due, persists success, and waits 24 hours before running again", async () => {
    let currentTime = new Date("2026-08-27T08:00:00.000Z");
    const organizeOlderMemories = vi.fn(() => EMPTY_RESULT);
    const consolidator = new MemoryDailyConsolidator({
      paseoHome,
      store: { organizeOlderMemories },
      logger: pino({ level: "silent" }),
      now: () => currentTime,
    });

    await consolidator.runIfDue();
    await consolidator.runIfDue();
    expect(organizeOlderMemories).toHaveBeenCalledTimes(1);
    expect(organizeOlderMemories).toHaveBeenCalledWith(
      new Date("2026-08-26T08:00:00.000Z").getTime(),
    );

    currentTime = new Date("2026-08-28T08:00:00.000Z");
    await consolidator.runIfDue();
    expect(organizeOlderMemories).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(readFileSync(path.join(paseoHome, "memory", "daily-consolidation.json"), "utf8")),
    ).toMatchObject({
      version: 1,
      lastSuccessfulRunAt: "2026-08-28T08:00:00.000Z",
    });
  });

  test("uses persisted success time after restart", async () => {
    const organizeOlderMemories = vi.fn(() => EMPTY_RESULT);
    const first = new MemoryDailyConsolidator({
      paseoHome,
      store: { organizeOlderMemories },
      logger: pino({ level: "silent" }),
      now: () => new Date("2026-08-27T08:00:00.000Z"),
    });
    await first.runIfDue();

    const restarted = new MemoryDailyConsolidator({
      paseoHome,
      store: { organizeOlderMemories },
      logger: pino({ level: "silent" }),
      now: () => new Date("2026-08-27T09:00:00.000Z"),
    });
    await restarted.runIfDue();

    expect(organizeOlderMemories).toHaveBeenCalledTimes(1);
  });

  test("does not overlap concurrent checks", async () => {
    let resolveOrganization: ((result: MemoryOrganizationPlan) => void) | null = null;
    const organizeOlderMemories = vi.fn(
      () =>
        new Promise<MemoryOrganizationPlan>((resolve) => {
          resolveOrganization = resolve;
        }),
    );
    const consolidator = new MemoryDailyConsolidator({
      paseoHome,
      store: { organizeOlderMemories },
      logger: pino({ level: "silent" }),
      now: () => new Date("2026-08-27T08:00:00.000Z"),
    });

    const first = consolidator.runIfDue();
    const second = consolidator.runIfDue();
    expect(organizeOlderMemories).toHaveBeenCalledTimes(1);
    resolveOrganization?.(EMPTY_RESULT);
    await Promise.all([first, second]);
  });

  test("does not persist a successful run when organization fails", async () => {
    const organizeOlderMemories = vi.fn(() => {
      throw new Error("disk unavailable");
    });
    const consolidator = new MemoryDailyConsolidator({
      paseoHome,
      store: { organizeOlderMemories },
      logger: pino({ level: "silent" }),
      now: () => new Date("2026-08-27T08:00:00.000Z"),
    });

    await consolidator.runIfDue();
    await consolidator.runIfDue();

    expect(organizeOlderMemories).toHaveBeenCalledTimes(2);
    expect(existsSync(path.join(paseoHome, "memory", "daily-consolidation.json"))).toBe(false);
  });
});
