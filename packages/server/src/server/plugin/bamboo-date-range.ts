import { alertTableDateKey } from "./alert-troubleshooter-daily-table.js";

export function bambooDateKeys(lookbackDays: number, now = new Date()): string[] {
  return Array.from({ length: lookbackDays }, (_, offset) =>
    alertTableDateKey(new Date(now.getTime() - offset * 24 * 60 * 60_000)),
  );
}
