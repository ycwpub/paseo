import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";

interface ScheduledPrivateScan {
  dueAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export class LarkSubstitutePrivateScanScheduler {
  private readonly scheduled = new Map<string, ScheduledPrivateScan>();

  constructor(
    private readonly options: {
      now: () => number;
      run: (mode: LarkSubstituteMode) => Promise<void> | void;
    },
  ) {}

  schedule(mode: LarkSubstituteMode, dueAt: number): void {
    const current = this.scheduled.get(mode.id);
    if (current?.dueAt === dueAt) return;
    if (current) clearTimeout(current.timer);

    const timer = setTimeout(
      () => {
        const scheduled = this.scheduled.get(mode.id);
        if (!scheduled || scheduled.timer !== timer) return;
        this.scheduled.delete(mode.id);
        void Promise.resolve(this.options.run(mode)).catch(() => undefined);
      },
      Math.max(0, dueAt - this.options.now()),
    );
    this.scheduled.set(mode.id, { dueAt, timer });
  }

  cancel(modeId: string): void {
    const scheduled = this.scheduled.get(modeId);
    if (scheduled) clearTimeout(scheduled.timer);
    this.scheduled.delete(modeId);
  }

  retain(modeIds: ReadonlySet<string>): void {
    for (const modeId of this.scheduled.keys()) {
      if (!modeIds.has(modeId)) this.cancel(modeId);
    }
  }

  clear(): void {
    for (const scheduled of this.scheduled.values()) clearTimeout(scheduled.timer);
    this.scheduled.clear();
  }
}
