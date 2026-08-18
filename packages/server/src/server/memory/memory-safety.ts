const SENSITIVE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret)\s*[:=]\s*\S+/i,
  /\bauthorization\s*:\s*bearer\s+\S+/i,
  /\b(?:sk|pk)_(?:live|test)_[a-z0-9]{12,}\b/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
];

export function isSafeMemoryContent(value: string): boolean {
  return !SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}
