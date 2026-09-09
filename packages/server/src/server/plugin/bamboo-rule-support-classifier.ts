import type { BambooPreparedAgentData } from "./bamboo-agent-runner.js";

const SUPPORTED_RULE_TYPES = new Set([
  "",
  "hive",
  "hive_task",
  "offline_hive",
  "offline_hive_task",
]);

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = scalar(item);
      if (result) return result;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return scalar(record.text ?? record.value ?? record.name);
  }
  return "";
}

function nestedValue(value: unknown, names: ReadonlySet<string>, depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > 6) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, candidate] of entries) {
    if (names.has(key)) return candidate;
  }
  for (const [, candidate] of entries) {
    const nested = nestedValue(candidate, names, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function ruleTypeFromUrl(value: unknown): string {
  const text = scalar(value);
  if (!text) return "";
  try {
    return new URL(text).searchParams.get("rule_type")?.trim().toLowerCase() ?? "";
  } catch {
    const match = /(?:[?&])rule_type=([^&#]+)/u.exec(text);
    return match ? decodeURIComponent(match[1]!.replace(/\+/gu, " ")).trim().toLowerCase() : "";
  }
}

function numericValue(value: unknown): number | null {
  const text = scalar(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function arrayLength(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

function sampleDescription(prepared: BambooPreparedAgentData): string {
  const falseDataLength = numericValue(
    nestedValue(prepared.inspect_result, new Set(["false_data_length", "falseDataLength"])),
  );
  if (falseDataLength !== null) {
    return `权威样本数=${falseDataLength}（source=false_data_length）`;
  }
  const falseReason = nestedValue(
    prepared.inspect_result,
    new Set(["false_reason", "falseReason"]),
  );
  const falseReasonLength = arrayLength(falseReason);
  if (falseReasonLength !== null) {
    return `权威样本数=${falseReasonLength}（source=false_reason）`;
  }
  const taskResultNum = numericValue(
    nestedValue(
      { inspect_result: prepared.inspect_result, work_item: prepared.work_item },
      new Set(["task_result_num", "taskResultNum"]),
    ),
  );
  return taskResultNum === null
    ? "权威样本数=unknown"
    : `权威样本数=${taskResultNum}（source=task_result_num）`;
}

export type BambooRuleSupportDecision =
  | { supported: true; ruleType: string }
  | { supported: false; ruleType: string; summary: string };

export function classifyBambooPreparedRuleSupport(
  prepared: BambooPreparedAgentData,
): BambooRuleSupportDecision {
  const explicitRuleType = scalar(
    nestedValue(
      { inspect_result: prepared.inspect_result, work_item: prepared.work_item },
      new Set(["rule_type", "ruleType"]),
    ),
  ).toLowerCase();
  const urlRuleType = ruleTypeFromUrl(
    nestedValue(
      { inspect_result: prepared.inspect_result, work_item: prepared.work_item },
      new Set(["bamboo_url", "bambooUrl"]),
    ),
  );
  const ruleType = explicitRuleType || urlRuleType;
  if (SUPPORTED_RULE_TYPES.has(ruleType)) return { supported: true, ruleType };
  return {
    supported: false,
    ruleType,
    summary: `当前不支持自动排查：仅支持离线 Hive Bamboo 规则，rule_type=${ruleType}，${sampleDescription(
      prepared,
    )}，已跳过单条排查流程。`,
  };
}
