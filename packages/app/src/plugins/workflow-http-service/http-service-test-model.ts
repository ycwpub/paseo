import type { PluginHttpListener, PluginHttpTestTarget } from "@getpaseo/protocol/messages";
import type { SelectFieldOption } from "@/components/ui/select-field";

export const DEFAULT_SUBMIT_TEST_ID = "default-submit";
export const DEFAULT_QUERY_TEST_ID = "default-query";
export const DEFAULT_DELETE_TEST_ID = "default-delete";
const ROUTE_TEST_PREFIX = "route:";

export function buildHttpServiceTestOptions(
  listener: PluginHttpListener,
): SelectFieldOption<string>[] {
  const options: SelectFieldOption<string>[] = [];
  if (listener.defaultJobApi?.enabled) {
    options.push(
      {
        id: DEFAULT_SUBMIT_TEST_ID,
        value: DEFAULT_SUBMIT_TEST_ID,
        label: `POST ${listener.defaultJobApi.submitPath}`,
        description: "提交请求并异步执行 Workflow",
      },
      {
        id: DEFAULT_QUERY_TEST_ID,
        value: DEFAULT_QUERY_TEST_ID,
        label: `GET ${listener.defaultJobApi.queryPath}?request_id=...`,
        description: "按请求 ID 查询处理结果",
      },
      {
        id: DEFAULT_DELETE_TEST_ID,
        value: DEFAULT_DELETE_TEST_ID,
        label: `DELETE ${listener.defaultJobApi.deletePath}?request_id=...`,
        description: "删除已结束的请求",
      },
    );
  }
  for (const route of listener.routes) {
    if (!route.enabled) continue;
    const id = `${ROUTE_TEST_PREFIX}${route.id}`;
    options.push({
      id,
      value: id,
      label: `POST ${route.path}`,
      description: route.name,
    });
  }
  return options;
}

export function testSelectionNeedsRequestId(selection: string): boolean {
  return selection === DEFAULT_QUERY_TEST_ID || selection === DEFAULT_DELETE_TEST_ID;
}

export function testSelectionAcceptsBody(selection: string): boolean {
  return selection === DEFAULT_SUBMIT_TEST_ID || selection.startsWith(ROUTE_TEST_PREFIX);
}

export function resolveHttpServiceTestTarget(
  selection: string,
  requestId: string,
): PluginHttpTestTarget {
  if (selection === DEFAULT_SUBMIT_TEST_ID) return { kind: "default_submit" };
  if (selection === DEFAULT_QUERY_TEST_ID) {
    if (!requestId.trim()) throw new Error("请输入要查询的请求 ID");
    return { kind: "default_query", requestId: requestId.trim() };
  }
  if (selection === DEFAULT_DELETE_TEST_ID) {
    if (!requestId.trim()) throw new Error("请输入要删除的请求 ID");
    return { kind: "default_delete", requestId: requestId.trim() };
  }
  if (selection.startsWith(ROUTE_TEST_PREFIX)) {
    const routeId = selection.slice(ROUTE_TEST_PREFIX.length);
    if (routeId) return { kind: "route", routeId };
  }
  throw new Error("请选择要测试的接口");
}

export function parseHttpServiceTestBody(value: string): Record<string, unknown> {
  const normalized = value.trim();
  if (!normalized) return {};
  const parsed = JSON.parse(normalized) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("请求体必须是 JSON object");
  }
  return parsed as Record<string, unknown>;
}
