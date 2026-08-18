const SENSITIVE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret)\s*[:=]\s*\S+/i,
  /\bauthorization\s*:\s*bearer\s+\S+/i,
  /\b(?:sk|pk)_(?:live|test)_[a-z0-9]{12,}\b/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b(?:eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/,
  /\b(?:session|cookie)\s*[:=]\s*[^\s;]{12,}/i,
];

const PERSONAL_SENSITIVE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:\d[ -]*?){13,19}\b/,
  /\b(?:medical|diagnosis|patient|病历|诊断|身份证|银行卡|信用卡)\b/i,
];

export function isSafeMemoryContent(value: string): boolean {
  return !SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsSensitivePersonalData(value: string): boolean {
  return PERSONAL_SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

export function redactMemorySecrets(value: string): string {
  let redacted = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}
