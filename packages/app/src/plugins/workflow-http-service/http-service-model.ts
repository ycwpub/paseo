import type {
  PluginHttpListener,
  PluginHttpProjectConfig,
  PluginHttpRoute,
} from "@getpaseo/protocol/messages";

function nextId(prefix: string, existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function createHttpRoute(listener: PluginHttpListener): PluginHttpRoute {
  const id = nextId(
    "route",
    listener.routes.map((route) => route.id),
  );
  return {
    id,
    name: `处理路径 ${listener.routes.length + 1}`,
    enabled: true,
    method: "POST",
    path: `/${id}`,
    requestTemplate: "",
    responseTemplate: "",
    workflowPath: listener.defaultJobApi?.workflowPath ?? "",
    targetNodeId: undefined,
    maxBodyBytes: 1024 * 1024,
  };
}

export function createHttpListener(config: PluginHttpProjectConfig): PluginHttpListener {
  const id = nextId(
    "listener",
    config.listeners.map((listener) => listener.id),
  );
  const firstWorkflow =
    config.listeners[0]?.defaultJobApi?.workflowPath ??
    config.listeners[0]?.routes[0]?.workflowPath ??
    "";
  return {
    id,
    name: `监听端口 ${config.listeners.length + 1}`,
    enabled: false,
    host: "127.0.0.1",
    port: 0,
    defaultJobApi: firstWorkflow
      ? {
          enabled: true,
          submitPath: "/jobs",
          queryPath: "/jobs/{requestId}",
          deletePath: "/jobs/{requestId}",
          workflowPath: firstWorkflow,
          requestTemplate: "",
          responseTemplate: "",
        }
      : undefined,
    routes: [],
    retention: {
      enabled: false,
      maxAgeSeconds: 7 * 24 * 60 * 60,
      statuses: ["succeeded", "failed", "cancelled", "timed_out"],
    },
  };
}

export function updateHttpListener(
  config: PluginHttpProjectConfig,
  listenerId: string,
  updater: (listener: PluginHttpListener) => PluginHttpListener,
): PluginHttpProjectConfig {
  return {
    ...config,
    listeners: config.listeners.map((listener) =>
      listener.id === listenerId ? updater(listener) : listener,
    ),
  };
}

export function updateHttpRoute(
  listener: PluginHttpListener,
  routeId: string,
  updater: (route: PluginHttpRoute) => PluginHttpRoute,
): PluginHttpListener {
  return {
    ...listener,
    routes: listener.routes.map((route) => (route.id === routeId ? updater(route) : route)),
  };
}

export function listenerAddress(host: string, port: number, boundPort: number | null): string {
  return `http://${host}:${boundPort ?? port}`;
}

export function canDeleteHttpJob(status: string): boolean {
  return status !== "queued" && status !== "running";
}
