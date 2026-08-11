import type { OutputSchema } from "../../output/index.js";
import { formatCadence, formatTarget, type ScheduleRow } from "./shared.js";
import type { ScheduleRecord, ScheduleRunRecord } from "./types.js";

export const scheduleSchema: OutputSchema<ScheduleRow> = {
  idField: "id",
  columns: [
    { header: "ID", field: "id", width: 10 },
    { header: "NAME", field: "name", width: 20 },
    { header: "CADENCE", field: "cadence", width: 20 },
    { header: "TARGET", field: "target", width: 20 },
    { header: "STATUS", field: "status", width: 12 },
    { header: "NEXT RUN", field: "nextRunAt", width: 24 },
  ],
};

export interface ScheduleInspectRow {
  key: string;
  value: string;
}

export function createScheduleInspectSchema(
  record: ScheduleRecord,
): OutputSchema<ScheduleInspectRow> {
  return {
    idField: "key",
    columns: [
      { header: "KEY", field: "key", width: 18 },
      { header: "VALUE", field: "value", width: 80 },
    ],
    serialize: () => record,
  };
}

export interface ScheduleLogRow {
  id: string;
  status: string;
  scheduledFor: string;
  startedAt: string;
  endedAt: string | null;
  duration: string | null;
  agentId: string | null;
  workspaceId: string | null;
  target: string | null;
  config: string | null;
  output: string | null;
  error: string | null;
  configSnapshot: ScheduleRunRecord["configSnapshot"];
}

export const scheduleLogSchema: OutputSchema<ScheduleLogRow> = {
  idField: "id",
  columns: [
    { header: "RUN ID", field: "id", width: 14 },
    { header: "STATUS", field: "status", width: 12 },
    { header: "SCHEDULED", field: "scheduledFor", width: 24 },
    { header: "STARTED", field: "startedAt", width: 24 },
    { header: "ENDED", field: "endedAt", width: 24 },
    { header: "DURATION", field: "duration", width: 10 },
    { header: "TARGET", field: "target", width: 24 },
    { header: "CONFIG", field: "config", width: 32 },
    { header: "AGENT", field: "agentId", width: 12 },
    { header: "OUTPUT", field: "output", width: 40 },
    { header: "ERROR", field: "error", width: 40 },
  ],
};

function formatRunDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) {
    return null;
  }
  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    return null;
  }
  return `${Math.round((ended - started) / 1000)}s`;
}

function formatRunConfigSnapshot(run: ScheduleRunRecord): string | null {
  const snapshot = run.configSnapshot;
  if (!snapshot) {
    return null;
  }
  const parts = [formatCadence(snapshot.cadence)];
  if (snapshot.maxRuns !== null) {
    parts.push(`maxRuns:${snapshot.maxRuns}`);
  }
  if (snapshot.expiresAt !== null) {
    parts.push(`expires:${snapshot.expiresAt}`);
  }
  return parts.join(" · ");
}

export function toScheduleLogRow(run: ScheduleRunRecord): ScheduleLogRow {
  return {
    id: run.id,
    status: run.status,
    scheduledFor: run.scheduledFor,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    duration: formatRunDuration(run.startedAt, run.endedAt),
    agentId: run.agentId ? run.agentId.slice(0, 7) : null,
    workspaceId: run.workspaceId ?? null,
    target: run.configSnapshot ? formatTarget(run.configSnapshot.target) : null,
    config: formatRunConfigSnapshot(run),
    output: run.output,
    error: run.error,
    configSnapshot: run.configSnapshot,
  };
}

export function createScheduleInspectRows(schedule: ScheduleRecord): ScheduleInspectRow[] {
  return [
    { key: "Id", value: schedule.id },
    { key: "Name", value: schedule.name ?? "null" },
    { key: "Prompt", value: schedule.prompt },
    {
      key: "Cadence",
      value:
        schedule.cadence.type === "cron"
          ? formatCadence(schedule.cadence)
          : `every:${schedule.cadence.everyMs}ms`,
    },
    { key: "Target", value: formatTarget(schedule.target) },
    { key: "Status", value: schedule.status },
    { key: "CreatedAt", value: schedule.createdAt },
    { key: "UpdatedAt", value: schedule.updatedAt },
    { key: "NextRunAt", value: schedule.nextRunAt ?? "null" },
    { key: "LastRunAt", value: schedule.lastRunAt ?? "null" },
    { key: "PausedAt", value: schedule.pausedAt ?? "null" },
    { key: "ExpiresAt", value: schedule.expiresAt ?? "null" },
    { key: "MaxRuns", value: schedule.maxRuns == null ? "null" : `${schedule.maxRuns}` },
    { key: "RunCount", value: `${schedule.runs.length}` },
  ];
}
