const BAMBOO_RESULT_MESSAGE_MARKERS = [
  "bamboo 报警自动排查结果",
  "bamboo报警自动排查结果",
  "bamboo 对账自动排查结果",
  "bamboo对账自动排查结果",
];

export function isBambooTroubleshootingResultMessage(text: string): boolean {
  const normalized = text.toLowerCase();
  if (BAMBOO_RESULT_MESSAGE_MARKERS.some((marker) => normalized.includes(marker))) return true;
  return (
    normalized.includes("bamboo") &&
    normalized.includes("自动排查") &&
    (normalized.includes("排查完成") ||
      /状态\s*[:=：]\s*(?:succeeded|failed|成功|失败)/iu.test(normalized))
  );
}

export function extractBambooResultId(text: string): string | null {
  const explicit =
    /\bresult[_\s-]*id\s*[:=：]\s*([a-zA-Z0-9_-]+)/iu.exec(text)?.[1]?.trim() ?? null;
  if (explicit) return explicit;
  return /(?:[?&]|&amp;)id=([a-zA-Z0-9_-]+)/iu.exec(text)?.[1]?.trim() ?? null;
}

export function isBambooAlertMessage(text: string, messageType?: string | null): boolean {
  if (isBambooTroubleshootingResultMessage(text)) return false;
  const normalized = text.toLowerCase();
  const hasBambooMarker = normalized.includes("bamboo");
  const hasAlertMarker = normalized.includes("报警") || normalized.includes("告警");
  const hasBambooRecordMarker =
    normalized.includes("result_id") ||
    normalized.includes("task_id") ||
    normalized.includes("bamboo.bytedance.net/result-manage/");
  const hasKnownBambooCardMarker =
    messageType === "interactive" && normalized.includes("离线数据质量");
  return (hasBambooMarker && (hasAlertMarker || hasBambooRecordMarker)) || hasKnownBambooCardMarker;
}
