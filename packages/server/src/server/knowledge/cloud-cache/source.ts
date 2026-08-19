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
const AUTH_TEXT_PATTERN =
  /auth(?:entication|orization)?|login|log in|sign in|sso|oauth|unauthorized|forbidden|扫码|登录|授权|无权限/iu;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/giu;

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
  const parsedValues = rawParts.map(parseJson).filter((value) => value !== null);
  const strings = parsedValues.flatMap((value) => walkStrings(value));
  const authCommand = findString(strings, /(^|\.)(auth_command|authCommand|login_command)$/u);
  const loginUrl =
    findString(
      strings,
      /(^|\.)(login_url|loginUrl|approval_url|approvalUrl|url)$/u,
      /^https?:\/\//u,
    ) ??
    combined.match(URL_PATTERN)?.[0] ??
    null;
  const errorCode = findString(strings, /(^|\.)(code|error_code|errorCode)$/u) ?? "";
  if (!hasAuthenticationEvidence({ combined, errorCode, authCommand, loginUrl })) {
    return null;
  }
  const message =
    findString(strings, /(^|\.)(message|hint)$/u) ??
    candidate?.message ??
    "云文档需要登录或授权后才能读取。";
  return {
    kind: "authentication_required",
    source,
    message,
    loginUrl,
    authCommand: authCommand ?? "bytedcli insearch login",
  };
}

async function fetchWithBytedcli(
  source: string,
  runCommand: CloudDocumentCommandRunner,
): Promise<CloudDocumentFetchResult> {
  try {
    const result = await runCommand("bytedcli", ["--json", "insearch", "get", source], {
      timeoutMs: 60_000,
      maxBufferBytes: MAX_DOCUMENT_BYTES,
      env: { ...process.env, BYTEDCLI_NO_AUTO_UPGRADE: "1" },
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
    if (issue) throw new CloudDocumentAuthenticationError(issue);
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
  const response = await fetch(input.source, { headers, redirect: "follow" });
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
      loginUrl: response.url && response.url !== input.source ? response.url : input.source,
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
