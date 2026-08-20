interface MeegoAuthRequired {
  authRequired: true;
  provider: string;
  code: string;
  message: string;
}

export interface DevelopmentMeegoActionRequired {
  kind: "login" | "permission";
  code: string;
  message: string;
  urls: string[];
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

function unknownText(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === "string" ? value : "";
}

function parseJsonObjects(text: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{") continue;
    try {
      const parsed = JSON.parse(text.slice(index));
      const record = asRecord(parsed);
      if (record) results.push(record);
      break;
    } catch {
      // Keep scanning because the first "{" may belong to surrounding log text.
    }
  }
  return results;
}

function collectRecords(value: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const seen = new Set<object>();

  const visit = (candidate: unknown, depth: number) => {
    if (depth > 6) return;
    if (typeof candidate === "string") {
      for (const parsed of parseJsonObjects(candidate)) visit(parsed, depth + 1);
      return;
    }
    if (candidate instanceof Error) {
      visit(candidate.message, depth + 1);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    const record = asRecord(candidate);
    if (!record || seen.has(record)) return;
    seen.add(record);
    records.push(record);
    for (const nested of Object.values(record)) visit(nested, depth + 1);
  };

  visit(value, 0);
  return records;
}

function collectStrings(records: Record<string, unknown>[], keys: string[]): string[] {
  const values: string[] = [];
  for (const record of records) {
    for (const key of keys) {
      const value = readString(record, key).trim();
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

function collectUrls(records: Record<string, unknown>[], text: string): string[] {
  const urls: string[] = [];
  const append = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.trim().replace(/[),.;，。；]+$/u, "");
    if (/^https?:\/\//u.test(normalized) && !urls.includes(normalized)) urls.push(normalized);
  };
  const urlKeys = [
    "url",
    "approvalUrl",
    "approval_url",
    "applyUrl",
    "apply_url",
    "verificationUrl",
    "verification_url",
    "verification_uri_complete",
  ];
  const listKeys = ["urls", "permissionApplyUrls", "permission_apply_urls"];
  const appendListItem = (item: unknown) => {
    if (typeof item === "string") {
      append(item);
      return;
    }
    const itemRecord = asRecord(item);
    if (!itemRecord) return;
    for (const urlKey of urlKeys) append(itemRecord[urlKey]);
  };
  for (const record of records) {
    for (const key of urlKeys) append(record[key]);
    for (const key of listKeys) {
      const value = record[key];
      if (Array.isArray(value)) value.forEach(appendListItem);
    }
  }
  for (const match of text.matchAll(/https?:\/\/[^\s`"'<>]+/gu)) append(match[0]);
  return urls;
}

export function parseDevelopmentMeegoActionRequired(
  value: unknown,
): DevelopmentMeegoActionRequired | null {
  const records = collectRecords(value);
  const rawText = unknownText(value);
  const messages = collectStrings(records, [
    "authMessage",
    "message",
    "hint",
    "title",
    "auth_command",
  ]);
  const searchable = [rawText, ...messages].join("\n");
  const codes = collectStrings(records, ["authCode", "code"]);
  const code = codes.find((candidate) => /AUTH|PERMISSION|FORBIDDEN/u.test(candidate)) ?? "";
  const explicitlyRequired = records.some((record) => record.authRequired === true);
  const loginRequired =
    explicitlyRequired ||
    /(?:MEEGL?E?|MEEGO)_AUTH_REQUIRED|authentication is required|bytedcli\s+meego\s+login/iu.test(
      [code, searchable].join("\n"),
    );
  const permissionRequired =
    /PERMISSION|FORBIDDEN|NO_ACCESS|permission[_\s-]*(?:required|denied)|申请权限|无权限/iu.test(
      [code, searchable].join("\n"),
    );
  if (!loginRequired && !permissionRequired) return null;

  const urls = collectUrls(records, searchable);
  const preferredMessage = messages.find(
    (message) =>
      message !== "Action required" &&
      !message.trim().startsWith("{") &&
      !/bytedcli\s+meego\s+login/iu.test(message),
  );
  return {
    kind: loginRequired ? "login" : "permission",
    code: code || (loginRequired ? "MEEGLE_AUTH_REQUIRED" : "MEEGO_PERMISSION_REQUIRED"),
    message:
      preferredMessage ||
      (loginRequired ? "需要登录 Meego 后继续操作。" : "需要申请 Meego 权限后继续操作。"),
    urls,
  };
}

export function parseDevelopmentMeegoAuthRequired(value: unknown): MeegoAuthRequired | null {
  const action = parseDevelopmentMeegoActionRequired(value);
  if (!action || action.kind !== "login") return null;
  const data = resultData(value);
  return {
    authRequired: true,
    provider: readString(data, "authProvider") || "official",
    code: readString(data, "authCode") || action.code,
    message: readString(data, "authMessage") || action.message,
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
