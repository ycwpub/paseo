import type { PaseoMemorySettings } from "@getpaseo/protocol/messages";
import {
  containsSensitivePersonalData,
  isSafeMemoryContent,
  redactMemorySecrets,
} from "./memory-safety.js";

const AUTOMATIC_MEMORY_NOISE_PATTERNS = [
  /\b(?:maybe|might|probably|temporary|one[- ]off|for now)\b/iu,
  /\b(?:stack trace|exit code|stderr|stdout)\b/iu,
  /(?:可能|也许|临时|暂时|一次性|堆栈|错误日志|标准输出|标准错误)/u,
];

export interface MemoryExtractionCandidate {
  content: string;
  confidence: number;
  sensitive?: boolean;
}

export type MemoryExtractionDecision =
  | { accepted: true; content: string; sensitive: boolean }
  | {
      accepted: false;
      reason: "low-confidence" | "secret" | "sensitive" | "transient" | "oversized";
    };

export function evaluateMemoryExtractionCandidate(input: {
  candidate: MemoryExtractionCandidate;
  explicit: boolean;
  settings: Required<PaseoMemorySettings>;
}): MemoryExtractionDecision {
  const { candidate, explicit, settings } = input;
  if (candidate.confidence < (explicit ? 0.5 : 0.65)) {
    return { accepted: false, reason: "low-confidence" };
  }
  if (!isSafeMemoryContent(candidate.content)) {
    return { accepted: false, reason: "secret" };
  }
  if (candidate.content.length > 8_000) {
    return { accepted: false, reason: "oversized" };
  }
  if (
    !explicit &&
    AUTOMATIC_MEMORY_NOISE_PATTERNS.some((pattern) => pattern.test(candidate.content))
  ) {
    return { accepted: false, reason: "transient" };
  }
  const content = redactMemorySecrets(candidate.content);
  const sensitive = candidate.sensitive === true || containsSensitivePersonalData(content);
  if (
    sensitive &&
    (settings.sensitiveMemoryPolicy === "exclude" ||
      (settings.sensitiveMemoryPolicy === "manual-only" && !explicit))
  ) {
    return { accepted: false, reason: "sensitive" };
  }
  return { accepted: true, content, sensitive };
}
