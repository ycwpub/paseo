import type { LarkDirectoryPrivateUserScanRange } from "@getpaseo/protocol/messages";

const MAX_LOOKBACK_MINUTES = 10_080;

function parseLookbackMinutes(value: string): number {
  const minutes = Number(value.trim());
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_LOOKBACK_MINUTES) {
    throw new Error("扫描时间范围必须是 1 到 10080 分钟");
  }
  return minutes;
}

function parseLocalDateTime(value: string, label: string): number {
  const normalized = value.trim().replace(" ", "T");
  const timestamp = Date.parse(normalized);
  if (!normalized || !Number.isFinite(timestamp)) {
    throw new Error(`${label}格式无效，请使用 YYYY-MM-DD HH:mm`);
  }
  return Math.floor(timestamp / 1_000);
}

export function parseLarkContactPrivateUserScanRange(input: {
  lookbackMinutes: string;
  startTime: string;
  endTime: string;
}): LarkDirectoryPrivateUserScanRange {
  const lookbackMinutes = parseLookbackMinutes(input.lookbackMinutes);
  const hasStartTime = Boolean(input.startTime.trim());
  const hasEndTime = Boolean(input.endTime.trim());
  if (hasStartTime !== hasEndTime) {
    throw new Error("开始时间和结束时间必须同时填写");
  }
  if (!hasStartTime) {
    return { lookbackMinutes };
  }

  const startTime = parseLocalDateTime(input.startTime, "开始时间");
  const endTime = parseLocalDateTime(input.endTime, "结束时间");
  if (endTime <= startTime) {
    throw new Error("结束时间必须晚于开始时间");
  }
  if (endTime - startTime > MAX_LOOKBACK_MINUTES * 60) {
    throw new Error("扫描时间范围不能超过 7 天");
  }
  return { lookbackMinutes, startTime, endTime };
}
