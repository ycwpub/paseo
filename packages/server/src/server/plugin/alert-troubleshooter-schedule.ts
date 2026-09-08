function parseTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function isAlertTroubleshooterActionDue(input: {
  now: Date;
  intervalMinutes: number;
  inMemoryTimestamp?: number;
  persistedTimestamp?: unknown;
}): boolean {
  const lastActionAt = Math.max(
    input.inMemoryTimestamp ?? 0,
    parseTimestamp(input.persistedTimestamp),
  );
  return input.now.getTime() - lastActionAt >= input.intervalMinutes * 60_000;
}
