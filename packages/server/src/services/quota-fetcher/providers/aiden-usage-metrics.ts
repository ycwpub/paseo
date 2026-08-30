import type {
  ProviderUsageBalance,
  ProviderUsageDetail,
  ProviderUsageWindow,
} from "../../../server/messages.js";
import { windowFromUsedPct } from "../usage.js";

interface AidenUsageQuota {
  available_tokens?: number;
  available_percent?: number;
  reset_time?: string | null;
  reset_time_ms?: number;
}

interface AidenUsageModel {
  id: string;
  quota?: AidenUsageQuota | null;
  ptu?: {
    available_percent?: number;
  } | null;
  capacity?: {
    occupancy_percent?: number;
  } | null;
}

export interface AidenUsageMetrics {
  windows: ProviderUsageWindow[];
  balances: ProviderUsageBalance[];
  details: ProviderUsageDetail[];
}

export function collectAidenUsageMetrics(models: readonly AidenUsageModel[]): AidenUsageMetrics {
  const windows: ProviderUsageWindow[] = [];
  const balances: ProviderUsageBalance[] = [];
  const details: ProviderUsageDetail[] = [];

  for (const model of models) {
    if (model.quota?.available_percent !== undefined) {
      windows.push(
        windowFromUsedPct({
          id: `quota:${model.id}`,
          label: model.id,
          utilizationPct: clampPercent(100 - model.quota.available_percent),
          resetsAt: resetTime(model.quota),
          tone: model.quota.available_percent < 20 ? "warning" : "ok",
        }),
      );
    }
    if (model.quota?.available_tokens !== undefined) {
      balances.push({
        id: `tokens:${model.id}`,
        label: `${model.id} 可用`,
        remaining: model.quota.available_tokens,
        unit: "tokens",
        resetsAt: resetTime(model.quota),
        tone: model.quota.available_tokens <= 0 ? "danger" : "ok",
      });
    }
    if (model.ptu?.available_percent !== undefined) {
      windows.push(
        windowFromUsedPct({
          id: `ptu:${model.id}`,
          label: `${model.id} · PTU`,
          utilizationPct: clampPercent(100 - model.ptu.available_percent),
          tone: model.ptu.available_percent < 20 ? "warning" : "ok",
        }),
      );
    }
    if (model.capacity?.occupancy_percent !== undefined) {
      details.push({
        id: `capacity:${model.id}`,
        label: `${model.id} 负载`,
        value: `${model.capacity.occupancy_percent}%`,
        tone: model.capacity.occupancy_percent >= 80 ? "warning" : "default",
      });
    }
  }

  return { windows, balances, details };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function resetTime(quota: AidenUsageQuota): string | null {
  if (quota.reset_time) {
    const parsed = new Date(quota.reset_time);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (quota.reset_time_ms !== undefined) {
    const parsed = new Date(quota.reset_time_ms);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}
