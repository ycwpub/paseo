import type {
  PluginHttpListener,
  PluginHttpListenerRuntime,
  PluginHttpTestResponse,
  PluginHttpTestTarget,
} from "@getpaseo/protocol/messages";
import { normalizePluginHttpJobPath, withPluginHttpRequestId } from "./plugin-http-request-url.js";

const TEST_TIMEOUT_MS = 10_000;
const MAX_TEST_RESPONSE_BYTES = 1024 * 1024;

interface ResolvedTestRequest {
  method: "POST" | "GET" | "DELETE";
  path: string;
  body: Record<string, unknown> | undefined;
}

function resolveTestRequest(
  listener: PluginHttpListener,
  target: PluginHttpTestTarget,
  body: Record<string, unknown> | undefined,
): ResolvedTestRequest {
  if (target.kind === "route") {
    const route = listener.routes.find((candidate) => candidate.id === target.routeId);
    if (!route?.enabled) throw new Error("测试接口不存在或未启用");
    return { method: "POST", path: normalizePluginHttpJobPath(route.path), body: body ?? {} };
  }

  const defaultApi = listener.defaultJobApi;
  if (!defaultApi?.enabled) throw new Error("默认异步请求接口未启用");
  if (target.kind === "default_submit") {
    return {
      method: "POST",
      path: normalizePluginHttpJobPath(defaultApi.submitPath),
      body: body ?? {},
    };
  }
  if (target.kind === "default_query") {
    return {
      method: "GET",
      path: withPluginHttpRequestId(defaultApi.queryPath, target.requestId),
      body: undefined,
    };
  }
  return {
    method: "DELETE",
    path: withPluginHttpRequestId(defaultApi.deletePath, target.requestId),
    body: undefined,
  };
}

async function readLimitedResponseBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    totalBytes += next.value.byteLength;
    if (totalBytes > MAX_TEST_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`测试响应超过 ${MAX_TEST_RESPONSE_BYTES} 字节限制`);
    }
    chunks.push(next.value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function parseResponseJson(bodyText: string): unknown {
  if (!bodyText.trim()) return undefined;
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}

function testRequestErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `测试请求超过 ${TEST_TIMEOUT_MS / 1000} 秒`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function executePluginHttpTest(input: {
  listener: PluginHttpListener;
  runtime: PluginHttpListenerRuntime;
  target: PluginHttpTestTarget;
  body?: Record<string, unknown>;
  authToken?: string;
}): Promise<Omit<PluginHttpTestResponse, "requestId">> {
  if (input.runtime.status !== "running" || input.runtime.boundPort === null) {
    throw new Error("监听端口尚未运行，请先保存并应用配置");
  }
  const request = resolveTestRequest(input.listener, input.target, input.body);
  const host = input.listener.host.includes(":") ? `[${input.listener.host}]` : input.listener.host;
  const requestUrl = `http://${host}:${input.runtime.boundPort}${request.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  timer.unref?.();
  const startedAt = Date.now();

  try {
    const headers: Record<string, string> = {};
    if (request.body !== undefined) headers["Content-Type"] = "application/json";
    if (input.authToken) headers.Authorization = `Bearer ${input.authToken}`;
    const response = await fetch(requestUrl, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    });
    const bodyText = await readLimitedResponseBody(response);
    const bodyJson = parseResponseJson(bodyText);
    return {
      requestUrl,
      statusCode: response.status,
      durationMs: Math.max(0, Date.now() - startedAt),
      headers: Object.fromEntries(response.headers.entries()),
      bodyText,
      ...(bodyJson === undefined ? {} : { bodyJson }),
      error: null,
    };
  } catch (error) {
    return {
      requestUrl,
      statusCode: null,
      durationMs: Math.max(0, Date.now() - startedAt),
      headers: {},
      bodyText: "",
      error: testRequestErrorMessage(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
