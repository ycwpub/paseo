import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { effectiveMemoryStatus, memoryScopeKey, normalizeMemoryScopes } from "./memory-model.js";

export const DAILY_MEMORY_MINIMUM_AGE_MS = 24 * 60 * 60 * 1_000;
export const LOW_IMPORTANCE_MEMORY_THRESHOLD = 0.2;

export interface MemoryOrganizationMerge {
  survivorId: string;
  duplicateIds: string[];
}

export interface MemoryOrganizationPlan {
  scanned: number;
  merges: MemoryOrganizationMerge[];
  removeIds: string[];
  skippedExplicit: number;
  scopeCounts: Partial<Record<NonNullable<PaseoMemoryDetail["scope"]>["type"], number>>;
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s"'“”‘’，,。.;；:：、!?！？()[\]（）【】_-]+/gu, "");
}

function duplicateKey(detail: PaseoMemoryDetail): string {
  const scopes = normalizeMemoryScopes(detail).map(memoryScopeKey).toSorted().join(",");
  return [scopes, detail.category, normalizedText(detail.content)].join("\u0000");
}

function survivorScore(detail: PaseoMemoryDetail): readonly (number | string)[] {
  return [
    detail.origin === "explicit" ? 1 : 0,
    detail.helpfulCount ?? 0,
    detail.useCount ?? 0,
    detail.importance ?? 0.5,
    detail.confidence,
    detail.updatedAt,
    detail.id,
  ];
}

function compareSurvivors(left: PaseoMemoryDetail, right: PaseoMemoryDetail): number {
  const leftScore = survivorScore(left);
  const rightScore = survivorScore(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    const leftValue = leftScore[index]!;
    const rightValue = rightScore[index]!;
    if (leftValue === rightValue) continue;
    return leftValue > rightValue ? -1 : 1;
  }
  return 0;
}

function isLowValueAutomaticMemory(detail: PaseoMemoryDetail): boolean {
  return (
    detail.origin !== "explicit" &&
    (detail.importance ?? 0.5) <= LOW_IMPORTANCE_MEMORY_THRESHOLD &&
    (detail.helpfulCount ?? 0) === 0 &&
    (detail.useCount ?? 0) === 0
  );
}

export function planMemoryOrganization(
  details: readonly PaseoMemoryDetail[],
  olderThan: number,
): MemoryOrganizationPlan {
  const eligible = details.filter((detail) => {
    const updatedAt = new Date(detail.updatedAt).getTime();
    return Number.isFinite(updatedAt) && updatedAt <= olderThan;
  });
  const scopeCounts: MemoryOrganizationPlan["scopeCounts"] = {};
  for (const detail of eligible) {
    for (const scope of normalizeMemoryScopes(detail)) {
      scopeCounts[scope.type] = (scopeCounts[scope.type] ?? 0) + 1;
    }
  }

  const groups = new Map<string, PaseoMemoryDetail[]>();
  for (const detail of eligible) {
    if (effectiveMemoryStatus(detail, olderThan) !== "active") continue;
    const key = duplicateKey(detail);
    if (!normalizedText(detail.content)) continue;
    const group = groups.get(key) ?? [];
    group.push(detail);
    groups.set(key, group);
  }

  const merges: MemoryOrganizationMerge[] = [];
  const mergedIds = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [survivor, ...duplicates] = group.toSorted(compareSurvivors);
    merges.push({
      survivorId: survivor!.id,
      duplicateIds: duplicates.map((detail) => detail.id),
    });
    for (const duplicate of duplicates) mergedIds.add(duplicate.id);
  }

  let skippedExplicit = 0;
  const removeIds = eligible.flatMap((detail) => {
    if (mergedIds.has(detail.id)) return [];
    if (detail.origin === "explicit") {
      if ((detail.importance ?? 0.5) <= LOW_IMPORTANCE_MEMORY_THRESHOLD) {
        skippedExplicit += 1;
      }
      return [];
    }
    return isLowValueAutomaticMemory(detail) ? [detail.id] : [];
  });

  return {
    scanned: eligible.length,
    merges,
    removeIds,
    skippedExplicit,
    scopeCounts,
  };
}
