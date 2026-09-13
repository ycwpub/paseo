import { execFile } from "node:child_process";
import type { CloudDocumentAuthenticationIssue, CloudDocumentFetchResult } from "./types.js";

const INTERNAL_HOST_SUFFIXES = [
  ".bytedance.net",
  ".byted.org",
  ".feishu.cn",
  ".larkoffice.com",
  ".byteintl.net",
] as const;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const HTTP_FETCH_TIMEOUT_MS = 60_000;
const AUTH_TEXT_PATTERN =
  /auth(?:entication|orization)?|login|log in|sign in|sso|oauth|unauthorized|forbidden|invalid[_ -]?grant|refresh token|token.{0,20}expired|20037|扫码|登录|授权|无权限/iu;
const AUTHORIZATION_URL_PATH_PATTERN =
  /(^|\.)(lark_applink_url|verification_uri_complete|verificationUriComplete|verification_url|verificationUrl|preferred_url|preferredUrl|authorization_url|authorizationUrl|authorize_url|authorizeUrl|login_url|loginUrl|approval_url|approvalUrl|browser_url|browserUrl)$/u;
const VERIFICATION_URL_PATH_PATTERN = /(^|\.)(verification_uri|verificationUri)$/u;
const USER_CODE_PATH_PATTERN = /(^|\.)(user_code|userCode)$/u;
const COMPLETION_TOKEN_PATH_PATTERN = /(^|\.)(complete_token|completeToken|device_code)$/u;
const BYTEDCLI_ENV = { ...process.env, BYTEDCLI_NO_AUTO_UPGRADE: "1" };
const LARK_LOGIN_COMMAND = "lark-cli auth login --domain docs,drive,wiki --recommend";

export class CloudDocumentAuthenticationError extends Error {
  readonly issue: CloudDocumentAuthenticationIssue;

  constructor(issue: CloudDocumentAuthenticationIssue) {
    super(issue.message);
    this.name = "CloudDocumentAuthenticationError";
    this.issue = issue;
  }
}

export interface CloudDocumentSourceReader {
  fetch(input: {
    source: string;
    etag?: string | null;
    lastModified?: string | null;
  }): Promise<CloudDocumentFetchResult>;
}

export interface CloudDocumentCommandRunner {
  (
    file: string,
    args: readonly string[],
    options: { timeoutMs: number; maxBufferBytes: number; env: NodeJS.ProcessEnv },
  ): Promise<{ stdout: string; stderr: string }>;
}

const defaultCommandRunner: CloudDocumentCommandRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        encoding: "utf8",
        env: options.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          const commandError = error as Error & { stdout?: string; stderr?: string };
          commandError.stdout = stdout;
          commandError.stderr = stderr;
          reject(commandError);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });

function isInternalSource(source: string): boolean {
  const hostname = new URL(source).hostname.toLowerCase();
  return INTERNAL_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

function walkStrings(value: unknown, path: string[] = []): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path: path.join("."), value }];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => walkStrings(entry, [...path, String(index)]));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => walkStrings(entry, [...path, key]));
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseJsonValues(raw: string): unknown[] {
  const direct = parseJson(raw);
  if (direct !== null) return [direct];
  return raw
    .split(/\r?\n/u)
    .map((line) => parseJson(line.trim()))
    .filter((value) => value !== null);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function findString(
  entries: Array<{ path: string; value: string }>,
  pathPattern: RegExp,
  valuePattern?: RegExp,
): string | null {
  const match = entries.find((entry) => {
    if (!pathPattern.test(entry.path)) return false;
    return valuePattern ? valuePattern.test(entry.value) : true;
  });
  return match?.value ?? null;
}

function normalizeHttpUrl(value: string | null, source: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.toString() === new URL(source).toString()) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function appendUserCode(value: string | null, userCode: string | null): string | null {
  if (!value || !userCode) return value;
  try {
    const url = new URL(value);
    if (!url.searchParams.has("user_code")) {
      url.searchParams.set("user_code", userCode);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function extractAuthorizationFields(
  source: string,
  rawParts: readonly string[],
): {
  loginUrl: string | null;
  authCommand: string | null;
  completionToken: string | null;
  errorCode: string;
  message: string | null;
} {
  const parsedValues = rawParts.flatMap(parseJsonValues);
  const strings = parsedValues.flatMap((value) => walkStrings(value));
  const directLoginUrl = findString(strings, AUTHORIZATION_URL_PATH_PATTERN, /^https?:\/\//u);
  const verificationUrl = findString(strings, VERIFICATION_URL_PATH_PATTERN, /^https?:\/\//u);
  const userCode = findString(strings, USER_CODE_PATH_PATTERN);
  return {
    loginUrl: normalizeHttpUrl(directLoginUrl ?? appendUserCode(verificationUrl, userCode), source),
    authCommand: findString(strings, /(^|\.)(auth_command|authCommand|login_command)$/u),
    completionToken: findString(strings, COMPLETION_TOKEN_PATH_PATTERN),
    errorCode: findString(strings, /(^|\.)(code|error_code|errorCode)$/u) ?? "",
    message: findString(strings, /(^|\.)(message|hint|error_description)$/u),
  };
}

function hasAuthenticationEvidence(input: {
  combined: string;
  errorCode: string;
  authCommand: string | null;
  loginUrl: string | null;
}): boolean {
  return (
    AUTH_TEXT_PATTERN.test(input.combined) ||
    AUTH_TEXT_PATTERN.test(input.errorCode) ||
    input.authCommand !== null ||
    input.loginUrl !== null
  );
}

function extractDocumentContent(value: unknown): string | null {
  const candidates = walkStrings(value);
  const preferred = ["markdown", "content", "body", "text"];
  for (const key of preferred) {
    const match = candidates.find(
      (candidate) => candidate.path === key || candidate.path.endsWith(`.${key}`),
    );
    if (match?.value.trim()) return match.value;
  }
  return null;
}

function looksLikeSsoLoginPage(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("<title>bytedance sso</title>") ||
    (lower.includes("<html") &&
      (lower.includes("sso") || lower.includes("oauth")) &&
      (lower.includes("login") || lower.includes("sign in")))
  );
}

function extractAuthenticationIssue(
  source: string,
  error: unknown,
): CloudDocumentAuthenticationIssue | null {
  const candidate = error as
    | (Error & { stdout?: unknown; stderr?: unknown; code?: unknown })
    | undefined;
  const rawParts = [
    candidate?.message ?? null,
    stringOrNull(candidate?.stdout),
    stringOrNull(candidate?.stderr),
  ].filter((value): value is string => value !== null && value.length > 0);
  const combined = rawParts.join("\n");
  const fields = extractAuthorizationFields(source, rawParts);
  if (
    !hasAuthenticationEvidence({
      combined,
      errorCode: fields.errorCode,
      authCommand: fields.authCommand,
      loginUrl: fields.loginUrl,
    })
  ) {
    return null;
  }
  const message = fields.message ?? candidate?.message ?? "云文档需要登录或授权后才能读取。";
  return {
    kind: "authentication_required",
    source,
    message,
    loginUrl: fields.loginUrl,
    authCommand: fields.authCommand ?? LARK_LOGIN_COMMAND,
    completionToken: fields.completionToken,
  };
}

async function createBytedcliAuthorizationChallenge(
  source: string,
  issue: CloudDocumentAuthenticationIssue,
  runCommand: CloudDocumentCommandRunner,
): Promise<CloudDocumentAuthenticationIssue> {
  try {
    const result = await runCommand(
      "lark-cli",
      ["auth", "login", "--domain", "docs,drive,wiki", "--recommend", "--no-wait", "--json"],
      {
        timeoutMs: 30_000,
        maxBufferBytes: MAX_DOCUMENT_BYTES,
        env: BYTEDCLI_ENV,
      },
    );
    const fields = extractAuthorizationFields(source, [result.stdout, result.stderr]);
    return {
      ...issue,
      loginUrl: fields.loginUrl ?? issue.loginUrl,
      authCommand: fields.authCommand ?? LARK_LOGIN_COMMAND,
      completionToken: fields.completionToken ?? issue.completionToken,
    };
  } catch (error) {
    const candidate = error as Error & { stdout?: unknown; stderr?: unknown };
    const fields = extractAuthorizationFields(
      source,
      [stringOrNull(candidate.stdout), stringOrNull(candidate.stderr)].filter(
        (value): value is string => Boolean(value),
      ),
    );
    return {
      ...issue,
      loginUrl: fields.loginUrl ?? issue.loginUrl,
      authCommand: fields.authCommand ?? LARK_LOGIN_COMMAND,
      completionToken: fields.completionToken ?? issue.completionToken,
    };
  }
}

export async function completeCloudDocumentAuthentication(
  issue: CloudDocumentAuthenticationIssue,
  runCommand: CloudDocumentCommandRunner = defaultCommandRunner,
): Promise<void> {
  if (!issue.completionToken) return;
  const result = await runCommand(
    "lark-cli",
    ["auth", "login", "--device-code", issue.completionToken, "--json"],
    {
      timeoutMs: 60_000,
      maxBufferBytes: MAX_DOCUMENT_BYTES,
      env: BYTEDCLI_ENV,
    },
  );
  const parsed = parseJsonValues(result.stdout).at(-1);
  const entries = walkStrings(parsed);
  const ok = parsed && typeof parsed === "object" ? Reflect.get(parsed, "ok") : undefined;
  const resultStatus = findString(entries, /(^|\.)status$/u);
  const status = findString(entries, /(^|\.)(login_status|loginStatus)$/u);
  if (ok === false || resultStatus === "error") {
    throw new Error("飞书授权确认失败，请重新打开授权链接后重试。");
  }
  if (status && status !== "success") {
    throw new Error(`飞书授权尚未完成（${status}），请完成授权后重试。`);
  }
}

async function fetchWithBytedcli(
  source: string,
  runCommand: CloudDocumentCommandRunner,
): Promise<CloudDocumentFetchResult> {
  try {
    const result = await runCommand("bytedcli", ["--json", "insearch", "get", source], {
      timeoutMs: 60_000,
      maxBufferBytes: MAX_DOCUMENT_BYTES,
      env: BYTEDCLI_ENV,
    });
    const parsed = parseJson(result.stdout);
    const content = extractDocumentContent(parsed);
    if (!content || looksLikeSsoLoginPage(content)) {
      const issue = extractAuthenticationIssue(
        source,
        new Error(
          looksLikeSsoLoginPage(content ?? "")
            ? "云文档返回了登录页面，需要重新登录。"
            : "bytedcli 未返回可缓存的文档正文。",
        ),
      );
      if (issue) throw new CloudDocumentAuthenticationError(issue);
      throw new Error("bytedcli 未返回可缓存的文档正文");
    }
    return { content, etag: null, lastModified: null, notModified: false };
  } catch (error) {
    if (error instanceof CloudDocumentAuthenticationError) throw error;
    const issue = extractAuthenticationIssue(source, error);
    if (issue) {
      throw new CloudDocumentAuthenticationError(
        issue.loginUrl
          ? issue
          : await createBytedcliAuthorizationChallenge(source, issue, runCommand),
      );
    }
    throw error;
  }
}

async function fetchWithHttp(input: {
  source: string;
  etag?: string | null;
  lastModified?: string | null;
}): Promise<CloudDocumentFetchResult> {
  const headers = new Headers();
  if (input.etag) headers.set("If-None-Match", input.etag);
  if (input.lastModified) headers.set("If-Modified-Since", input.lastModified);
  const signal = AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(input.source, {
      headers,
      redirect: "follow",
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw new Error("读取云文档超时（60 秒），请稍后重试。", { cause: error });
    }
    throw error;
  }
  if (response.status === 304) {
    return {
      content: "",
      etag: input.etag ?? null,
      lastModified: input.lastModified ?? null,
      notModified: true,
    };
  }
  const content = await response.text();
  if (response.status === 401 || response.status === 403 || looksLikeSsoLoginPage(content)) {
    throw new CloudDocumentAuthenticationError({
      kind: "authentication_required",
      source: input.source,
      message: `云文档需要登录或授权后才能读取（HTTP ${response.status}）。`,
      loginUrl: normalizeHttpUrl(response.url, input.source),
      authCommand: null,
    });
  }
  if (!response.ok) {
    throw new Error(`读取云文档失败（HTTP ${response.status}）`);
  }
  return {
    content,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    notModified: false,
  };
}

export class DefaultCloudDocumentSourceReader implements CloudDocumentSourceReader {
  constructor(private readonly runCommand: CloudDocumentCommandRunner = defaultCommandRunner) {}

  async fetch(input: {
    source: string;
    etag?: string | null;
    lastModified?: string | null;
  }): Promise<CloudDocumentFetchResult> {
    const parsed = new URL(input.source);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("云文档仅支持 HTTP/HTTPS 链接");
    }
    return isInternalSource(input.source)
      ? fetchWithBytedcli(input.source, this.runCommand)
      : fetchWithHttp(input);
  }
}
