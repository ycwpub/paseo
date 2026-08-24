import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type pino from "pino";
import { writePrivateFileAtomicSync } from "../private-files.js";
import { DAILY_MEMORY_MINIMUM_AGE_MS, type MemoryOrganizationPlan } from "./memory-organization.js";

const DAILY_CONSOLIDATION_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const DUE_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

interface DailyConsolidationStore {
  organizeOlderMemories(
    olderThan: number,
  ): MemoryOrganizationPlan | Promise<MemoryOrganizationPlan>;
}

interface DailyConsolidationState {
  version: 1;
  lastSuccessfulRunAt: string | null;
}

export interface MemoryDailyConsolidatorOptions {
  paseoHome: string;
  store: DailyConsolidationStore;
  logger: pino.Logger;
  now?: () => Date;
  onChanged?: () => void;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export class MemoryDailyConsolidator {
  private readonly statePath: string;
  private readonly store: DailyConsolidationStore;
  private readonly logger: pino.Logger;
  private readonly now: () => Date;
  private readonly onChanged: () => void;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<MemoryOrganizationPlan | null> | null = null;

  constructor(options: MemoryDailyConsolidatorOptions) {
    this.statePath = path.join(options.paseoHome, "memory", "daily-consolidation.json");
    this.store = options.store;
    this.logger = options.logger.child({ module: "memory-daily-consolidator" });
    this.now = options.now ?? (() => new Date());
    this.onChanged = options.onChanged ?? (() => undefined);
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  }

  start(): void {
    if (this.timer) return;
    void this.runIfDue();
    this.timer = this.setIntervalFn(() => {
      void this.runIfDue();
    }, DUE_CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    this.clearIntervalFn(this.timer);
    this.timer = null;
  }

  runIfDue(): Promise<MemoryOrganizationPlan | null> {
    if (this.running) return this.running;
    const task = this.runIfDueInternal();
    this.running = task;
    void task.finally(() => {
      if (this.running === task) this.running = null;
    });
    return task;
  }

  private async runIfDueInternal(): Promise<MemoryOrganizationPlan | null> {
    const startedAt = this.now();
    const state = this.readState();
    const lastRunAt = state.lastSuccessfulRunAt
      ? new Date(state.lastSuccessfulRunAt).getTime()
      : Number.NaN;
    if (
      Number.isFinite(lastRunAt) &&
      startedAt.getTime() - lastRunAt < DAILY_CONSOLIDATION_INTERVAL_MS
    ) {
      return null;
    }

    try {
      const result = await this.store.organizeOlderMemories(
        startedAt.getTime() - DAILY_MEMORY_MINIMUM_AGE_MS,
      );
      this.writeState({
        version: 1,
        lastSuccessfulRunAt: startedAt.toISOString(),
      });
      this.onChanged();
      this.logger.info(
        {
          durationMs: this.now().getTime() - startedAt.getTime(),
          scanned: result.scanned,
          merged: result.merges.reduce((count, merge) => count + merge.duplicateIds.length, 0),
          removed: result.removeIds.length,
          skippedExplicit: result.skippedExplicit,
          scopeCounts: result.scopeCounts,
        },
        "Daily memory organization completed",
      );
      return result;
    } catch (error) {
      this.logger.warn({ err: error }, "Daily memory organization failed");
      return null;
    }
  }

  private readState(): DailyConsolidationState {
    if (!existsSync(this.statePath)) {
      return { version: 1, lastSuccessfulRunAt: null };
    }
    try {
      const parsed = JSON.parse(
        readFileSync(this.statePath, "utf8"),
      ) as Partial<DailyConsolidationState>;
      return {
        version: 1,
        lastSuccessfulRunAt:
          typeof parsed.lastSuccessfulRunAt === "string" ? parsed.lastSuccessfulRunAt : null,
      };
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to read daily memory organization state");
      return { version: 1, lastSuccessfulRunAt: null };
    }
  }

  private writeState(state: DailyConsolidationState): void {
    writePrivateFileAtomicSync(this.statePath, JSON.stringify(state, null, 2));
  }
}
