import type { ProviderUsage, ProviderUsageDetail } from "./types";
import { isProviderUsageTemporarilyUnavailable } from "./copy";

const LEGACY_AIDEN_EMPTY_MODELS_DETAIL_ID = "aiden-empty-models";

export interface ProviderUsagePresentation {
  error: string | null;
  details: ProviderUsageDetail[];
}

/**
 * Older daemons described a missing Aiden quota response as an empty model
 * catalog. That is not a provider failure: the active model can still work,
 * while Aiden simply has no quota metrics to display. Keep the wire format
 * compatible, but remove the misleading warning from the UI.
 */
export function presentProviderUsage(usage: ProviderUsage): ProviderUsagePresentation {
  const details = usage.details ?? [];
  const hasLegacyAidenEmptyModelsDetail = details.some(
    (detail) => detail.id === LEGACY_AIDEN_EMPTY_MODELS_DETAIL_ID,
  );
  const hasUnavailableAidenUsage =
    usage.providerId.startsWith("aiden-") &&
    (hasLegacyAidenEmptyModelsDetail || isProviderUsageTemporarilyUnavailable(usage.error));

  return {
    error: hasUnavailableAidenUsage ? null : (usage.error ?? null),
    details: hasLegacyAidenEmptyModelsDetail
      ? details.filter((detail) => detail.id !== LEGACY_AIDEN_EMPTY_MODELS_DETAIL_ID)
      : details,
  };
}
