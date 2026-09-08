import {
  getLarkSubstituteGroupScan,
  type LarkSubstituteMode,
  type LarkSubstituteTaskScanRange,
} from "@getpaseo/protocol/messages";

const MAX_SCAN_LOOKBACK_MINUTES = 10_080;

export interface LarkSubstituteManualScanRangeFields {
  lookbackMinutes: string;
  excludeRecentMinutes: string;
}

export type LarkSubstituteManualScanRangeResult =
  | { ok: true; value: LarkSubstituteTaskScanRange }
  | { ok: false; error: string };

export function getLarkSubstituteManualScanRangeDefaults(
  mode: LarkSubstituteMode,
): LarkSubstituteManualScanRangeFields {
  const configuredScan = mode.privateScan.enabled
    ? mode.privateScan
    : getLarkSubstituteGroupScan(mode);
  return {
    lookbackMinutes: String(configuredScan.lookbackMinutes),
    excludeRecentMinutes: String(configuredScan.excludeRecentMinutes),
  };
}

export function parseLarkSubstituteManualScanRange(
  fields: LarkSubstituteManualScanRangeFields,
): LarkSubstituteManualScanRangeResult {
  const lookbackMinutes = Number(fields.lookbackMinutes.trim());
  const excludeRecentMinutes = Number(fields.excludeRecentMinutes.trim());
  if (
    !Number.isInteger(lookbackMinutes) ||
    lookbackMinutes < 1 ||
    lookbackMinutes > MAX_SCAN_LOOKBACK_MINUTES
  ) {
    return { ok: false, error: "扫描范围必须是 1 到 10080 之间的整数分钟。" };
  }
  if (
    !Number.isInteger(excludeRecentMinutes) ||
    excludeRecentMinutes < 0 ||
    excludeRecentMinutes >= lookbackMinutes
  ) {
    return {
      ok: false,
      error: "排除最近必须是非负整数，并且小于扫描范围。",
    };
  }
  return {
    ok: true,
    value: {
      lookbackMinutes,
      excludeRecentMinutes,
    },
  };
}
