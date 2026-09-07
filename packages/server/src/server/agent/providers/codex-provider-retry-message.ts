interface CodexProviderRetryError {
  message: string;
  additionalDetails: string | null;
  codexErrorInfo: unknown;
}

const OVERLOAD_ERROR_KINDS = new Set([
  "rateLimitExceeded",
  "serverOverloaded",
  "usageLimitExceeded",
]);

const STREAM_ERROR_KINDS = new Set([
  "httpConnectionFailed",
  "responseStreamConnectionFailed",
  "responseStreamDisconnected",
  "responseTooManyFailedAttempts",
]);

function readErrorKind(errorInfo: unknown): string | null {
  if (typeof errorInfo === "string") {
    return errorInfo;
  }
  if (errorInfo && typeof errorInfo === "object" && !Array.isArray(errorInfo)) {
    return Object.keys(errorInfo)[0] ?? null;
  }
  return null;
}

function readHttpStatus(errorInfo: unknown): number | null {
  if (!errorInfo || typeof errorInfo !== "object" || Array.isArray(errorInfo)) {
    return null;
  }
  for (const value of Object.values(errorInfo)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const status = (value as Record<string, unknown>).httpStatusCode;
    if (typeof status === "number") {
      return status;
    }
  }
  return null;
}

export function formatCodexProviderRetryMessage(error: CodexProviderRetryError): string {
  const kind = readErrorKind(error.codexErrorInfo);
  const status = readHttpStatus(error.codexErrorInfo);
  const diagnostic = `${error.message}\n${error.additionalDetails ?? ""}`;

  if (
    (kind && OVERLOAD_ERROR_KINDS.has(kind)) ||
    status === 429 ||
    status === 529 ||
    /(?:provider[_ -]?rate[_ -]?limited|rate limit|too many requests|负载过高|请求过于频繁)/iu.test(
      diagnostic,
    )
  ) {
    return "模型服务负载过高，正在重试。";
  }

  if (kind && STREAM_ERROR_KINDS.has(kind)) {
    return "模型响应暂时中断，正在重试。";
  }

  const detail = error.message.trim() || error.additionalDetails?.trim();
  return detail ? `模型请求暂时失败，正在重试：${detail}` : "模型服务暂时不可用，正在重试。";
}
