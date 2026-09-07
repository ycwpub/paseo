const LARK_RATE_LIMIT_CODE = 99991400;
const DEFAULT_RATE_LIMIT_RETRY_DELAY_MS = 1_000;
const MIN_RATE_LIMIT_RETRY_DELAY_MS = 100;
const MAX_RATE_LIMIT_RETRY_DELAY_MS = 120_000;

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"',}\]]+/giu, "Bearer [redacted]")
    .replace(
      /((?:access|refresh|user_access)[_-]?token["']?\s*[:=]\s*["']?)[^\s"',}\]]+/giu,
      "$1[redacted]",
    );
}

interface LarkApiErrorDetails {
  code: number | null;
  logId: string | null;
  retryAfterMs: number | null;
}

export class LarkApiError extends Error {
  readonly code: number | null;
  readonly logId: string | null;
  readonly retryAfterMs: number | null;

  constructor(message: string, details: LarkApiErrorDetails) {
    super(message);
    this.name = "LarkApiError";
    this.code = details.code;
    this.logId = details.logId;
    this.retryAfterMs = details.retryAfterMs;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function recordNumber(
  record: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getHeader(headers: unknown, name: string): string | null {
  const record = asRecord(headers);
  const getter = record?.get;
  if (typeof getter === "function") {
    const value = getter.call(headers, name);
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  const normalizedName = name.toLowerCase();
  for (const [key, value] of Object.entries(record ?? {})) {
    if (key.toLowerCase() !== normalizedName) continue;
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
  }
  return null;
}

function normalizeRetryDelay(delayMs: number): number {
  return Math.min(
    Math.max(Math.ceil(delayMs), MIN_RATE_LIMIT_RETRY_DELAY_MS),
    MAX_RATE_LIMIT_RETRY_DELAY_MS,
  );
}

export function parseLarkRateLimitReset(
  headers: unknown,
  nowMs: number = Date.now(),
): number | null {
  const raw = getHeader(headers, "x-ogw-ratelimit-reset") ?? getHeader(headers, "retry-after");
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) {
    if (numeric >= 1_000_000_000_000) return normalizeRetryDelay(numeric - nowMs);
    if (numeric >= 1_000_000_000) return normalizeRetryDelay(numeric * 1_000 - nowMs);
    return normalizeRetryDelay(numeric * 1_000);
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? normalizeRetryDelay(timestamp - nowMs) : null;
}

export function describeLarkApiError(error: unknown, nowMs: number = Date.now()): LarkApiError {
  if (error instanceof LarkApiError) return error;
  const response = asRecord(asRecord(error)?.response);
  const data = asRecord(response?.data);
  const headers = response?.headers;
  const code = recordNumber(data, "code");
  const message =
    recordString(data, "msg") ??
    recordString(data, "message") ??
    (error instanceof Error ? error.message : String(error));
  const logId =
    recordString(data, "log_id") ?? recordString(data, "logId") ?? getHeader(headers, "x-tt-logid");
  const retryAfterMs =
    code === LARK_RATE_LIMIT_CODE ? parseLarkRateLimitReset(headers, nowMs) : null;
  return new LarkApiError(
    [
      "Lark API error",
      message ? `: ${redactSensitiveText(message)}` : "",
      code !== null ? ` (code: ${code})` : "",
      logId ? ` log_id=${logId}` : "",
    ].join(""),
    { code, logId, retryAfterMs },
  );
}

export function larkApiResultError(result: { code?: number; msg?: string }): LarkApiError | null {
  if (typeof result.code !== "number" || result.code === 0) return null;
  return new LarkApiError(
    result.msg
      ? `Lark API error: ${redactSensitiveText(result.msg)} (code: ${result.code})`
      : `Lark API returned code ${result.code}`,
    {
      code: result.code,
      logId: null,
      retryAfterMs: null,
    },
  );
}

export function isLarkRateLimitError(error: unknown): boolean {
  const described = describeLarkApiError(error);
  return (
    described.code === LARK_RATE_LIMIT_CODE ||
    described.message.includes("request trigger frequency limit")
  );
}

export async function withLarkRateLimitRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    sleep?: (delayMs: number) => Promise<void>;
    onRetry?: (error: LarkApiError, delayMs: number, attempt: number) => void;
  } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const sleep =
    options.sleep ??
    ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const described = describeLarkApiError(error);
      if (!isLarkRateLimitError(described) || attempt >= maxAttempts) throw described;
      const delayMs = described.retryAfterMs ?? DEFAULT_RATE_LIMIT_RETRY_DELAY_MS * attempt;
      options.onRetry?.(described, delayMs, attempt);
      await sleep(delayMs);
    }
  }
  throw new Error("Unreachable Lark retry state");
}

export interface LarkConcurrentBatchResult<T> {
  values: T[];
  errors: LarkApiError[];
}

export async function mapLarkRequestsWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  operation: (input: TInput) => Promise<TOutput>,
): Promise<LarkConcurrentBatchResult<TOutput>> {
  const values: TOutput[] = [];
  const errors: LarkApiError[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), inputs.length);
  const worker = async () => {
    while (nextIndex < inputs.length) {
      const input = inputs[nextIndex];
      nextIndex += 1;
      try {
        values.push(await operation(input!));
      } catch (error) {
        errors.push(describeLarkApiError(error));
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return { values, errors };
}
