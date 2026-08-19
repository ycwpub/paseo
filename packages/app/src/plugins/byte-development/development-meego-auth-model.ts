interface MeegoAuthRequired {
  authRequired: true;
  provider: string;
  code: string;
  message: string;
}

export interface DevelopmentMeegoLoginChallenge {
  completeToken: string;
  verificationUrl: string;
  userCode: string;
  expiresIn: number;
  pollIntervalSeconds: number;
}

export type DevelopmentMeegoLoginStatus = "pending" | "success" | "expired";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resultData(value: unknown): Record<string, unknown> {
  const result = asRecord(value);
  return asRecord(result?.data) ?? result ?? {};
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseDevelopmentMeegoAuthRequired(value: unknown): MeegoAuthRequired | null {
  const data = resultData(value);
  if (data.authRequired !== true) return null;
  return {
    authRequired: true,
    provider: readString(data, "authProvider") || "official",
    code: readString(data, "authCode") || "MEEGLE_AUTH_REQUIRED",
    message: readString(data, "authMessage") || "需要登录 Meego",
  };
}

export function parseDevelopmentMeegoLoginChallenge(
  value: unknown,
): DevelopmentMeegoLoginChallenge {
  const data = resultData(value);
  const completeToken = readString(data, "completeToken");
  const verificationUrl = readString(data, "verificationUrl");
  if (!completeToken || !verificationUrl) {
    throw new Error("未能获取 Meego 登录二维码或链接");
  }
  return {
    completeToken,
    verificationUrl,
    userCode: readString(data, "userCode"),
    expiresIn: readNumber(data, "expiresIn", 600),
    pollIntervalSeconds: Math.max(1, readNumber(data, "pollIntervalSeconds", 5)),
  };
}

export function parseDevelopmentMeegoLoginStatus(value: unknown): DevelopmentMeegoLoginStatus {
  const status = readString(resultData(value), "loginStatus");
  if (status === "success" || status === "expired") return status;
  return "pending";
}
