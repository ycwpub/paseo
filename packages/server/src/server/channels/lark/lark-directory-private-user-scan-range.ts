import type { LarkDirectoryPrivateUserScanRange } from "@getpaseo/protocol/messages";

const MAX_SCAN_RANGE_SECONDS = 10_080 * 60;

export function resolveLarkDirectoryPrivateUserScanRange(
  range: LarkDirectoryPrivateUserScanRange,
  nowMs = Date.now(),
): { startTime: number; endTime: number } {
  if (
    !Number.isInteger(range.lookbackMinutes) ||
    range.lookbackMinutes < 1 ||
    range.lookbackMinutes > 10_080
  ) {
    throw new Error("私聊扫描时间范围必须是 1 到 10080 分钟");
  }

  const hasStartTime = range.startTime != null;
  const hasEndTime = range.endTime != null;
  if (hasStartTime !== hasEndTime) {
    throw new Error("私聊扫描开始时间和结束时间必须同时提供");
  }
  if (hasStartTime && hasEndTime) {
    if (!Number.isInteger(range.startTime) || !Number.isInteger(range.endTime)) {
      throw new Error("私聊扫描开始时间和结束时间必须是 Unix 秒时间戳");
    }
    if (range.endTime! <= range.startTime!) {
      throw new Error("私聊扫描结束时间必须晚于开始时间");
    }
    if (range.endTime! - range.startTime! > MAX_SCAN_RANGE_SECONDS) {
      throw new Error("私聊扫描时间范围不能超过 7 天");
    }
    return {
      startTime: range.startTime!,
      endTime: range.endTime!,
    };
  }

  const endTime = Math.floor(nowMs / 1_000);
  return {
    startTime: endTime - range.lookbackMinutes * 60,
    endTime,
  };
}
