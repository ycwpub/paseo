export interface AlertTroubleshooterManualScanRangeFields {
  lookbackMinutes: string;
  excludeRecentMinutes: string;
}

export interface AlertTroubleshooterManualScanRange {
  lookbackMinutes: number;
  excludeRecentMinutes: number;
}

export type AlertTroubleshooterManualScanRangeResult =
  | { ok: true; value: AlertTroubleshooterManualScanRange }
  | { ok: false; error: string };

const MAX_SCAN_LOOKBACK_MINUTES = 10_080;

export function getAlertTroubleshooterManualScanRangeDefaults(input: {
  lookbackMinutes: number;
  excludeRecentMinutes: number;
}): AlertTroubleshooterManualScanRangeFields {
  return {
    lookbackMinutes: String(input.lookbackMinutes),
    excludeRecentMinutes: String(input.excludeRecentMinutes),
  };
}

export function parseAlertTroubleshooterManualScanRange(
  fields: AlertTroubleshooterManualScanRangeFields,
): AlertTroubleshooterManualScanRangeResult {
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
