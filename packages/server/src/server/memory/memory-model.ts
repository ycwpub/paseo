import type {
  PaseoMemoryDetail,
  PaseoMemoryScope,
  PaseoMemorySettings,
} from "@getpaseo/protocol/messages";

export const DEFAULT_MEMORY_SETTINGS: Required<PaseoMemorySettings> = {
  enabled: false,
  autoExtract: true,
  maxInjectedChars: 8_000,
  maxRetrievedDetails: 3,
  autoConsolidate: true,
  showSources: true,
  retentionDays: 0,
  encryptAtRest: false,
  sensitiveMemoryPolicy: "exclude",
  maxCandidates: 24,
};

export function normalizeMemorySettings(
  settings: PaseoMemorySettings,
): Required<PaseoMemorySettings> {
  return {
    ...DEFAULT_MEMORY_SETTINGS,
    ...settings,
  };
}

export function normalizeMemoryScope(scope: PaseoMemoryScope | undefined): PaseoMemoryScope {
  if (!scope) {
    return { type: "global" };
  }
  if (scope.type === "global") {
    const id = scope.id?.trim();
    return id ? { type: "global", id } : { type: "global" };
  }
  const id = scope.id?.trim();
  return id ? { type: scope.type, id } : { type: "global" };
}

export function memoryScopeKey(scope: PaseoMemoryScope | undefined): string {
  const normalized = normalizeMemoryScope(scope);
  if (normalized.type === "global") {
    return normalized.id ? `global:${normalized.id}` : "global";
  }
  return `${normalized.type}:${normalized.id}`;
}

export function isMemoryScopeVisible(
  memoryScope: PaseoMemoryScope | undefined,
  visibleScopes: readonly PaseoMemoryScope[],
): boolean {
  const key = memoryScopeKey(memoryScope);
  return visibleScopes.some((scope) => memoryScopeKey(scope) === key);
}

export function effectiveMemoryStatus(
  detail: PaseoMemoryDetail,
  now = Date.now(),
): NonNullable<PaseoMemoryDetail["status"]> {
  const status = detail.status ?? "active";
  if (status !== "active") {
    return status;
  }
  if (detail.validUntil && new Date(detail.validUntil).getTime() <= now) {
    return "expired";
  }
  return status;
}

export function memoryFeedbackWeight(detail: PaseoMemoryDetail): number {
  const helpful = detail.helpfulCount ?? 0;
  const unhelpful = detail.unhelpfulCount ?? 0;
  return (helpful + 1) / (helpful + unhelpful + 2);
}

export function memoryFreshnessWeight(detail: PaseoMemoryDetail, now = Date.now()): number {
  const updatedAt = new Date(detail.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) {
    return 0.5;
  }
  const ageDays = Math.max(0, now - updatedAt) / 86_400_000;
  return Math.max(0.2, Math.exp(-ageDays / 180));
}
