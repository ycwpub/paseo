import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";

export function isRunnableSchedule(schedule: ScheduleSummary): boolean {
  return schedule.target.type === "new-agent" || schedule.target.type === "bash";
}
