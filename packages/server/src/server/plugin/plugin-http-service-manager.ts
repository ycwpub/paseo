import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Logger } from "pino";
import {
  PluginHttpProjectConfigSchema,
  type PluginHttpJob,
  type PluginHttpJobStatus,
  type PluginHttpListener,
  type PluginHttpListenerRuntime,
  type PluginHttpProjectConfig,
  type PluginHttpServiceSummary,
} from "@getpaseo/protocol/messages";
import { PluginHttpConfigStore } from "./plugin-http-config-store.js";
import { PluginHttpJobStore } from "./plugin-http-job-store.js";
import { buildCopiedPluginHttpProjectConfig } from "./plugin-http-project-copy.js";
import type {
  MutablePluginHttpServiceStatus,
  PluginHttpServiceBinding,
  PluginHttpServiceRuntime,
  PluginWorkflowMemoryWriter,
} from "./plugin-http-runtime-types.js";

interface PluginHttpWorkflowRunner {
  runScript(input: {
    scriptPath: string;
    inputPayload: string;
    targetNodeId?: string;
  }): Promise<{ id: string }>;
  waitForRun(runId: string): Promise<{
    status: "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
    outputPayload: string | null;
    error: string | null;
    errorCode: string | null;
    endedAt: string | null;
  }>;
}

interface ActiveRoute {
  binding: PluginHttpServiceBinding;
  authToken: string | null;
  submitPath: string;
  queryPath: string;
  deletePath: string;
}

interface ActiveServer {
  server: Server;
  routes: ActiveRoute[];
}

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set<PluginHttpJobStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

function serviceKey(pluginId: string, serviceName: string): string {
  return `${pluginId}\u0000${serviceName}`;
}

function serverKey(binding: PluginHttpServiceBinding): string {
  const { host, port, listenerId, projectId, name } = binding.definition;
  if (port === 0) {
    return `${host}\u00000\u0000${binding.pluginId}\u0000${projectId ?? ""}\u0000${listenerId ?? name}`;
  }
  return `${host}\u0000${port}`;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("127.")
  );
}

function formatHost(host: string): string {
  if (host.includes(":") && !host.startsWith("[")) return `[${host}]`;
  return host;
}

function parseJsonResult(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", JSON_CONTENT_TYPE);
  response.end(JSON.stringify(payload));
}

function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let rejected = false;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      if (rejected) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBodyBytes) {
        rejected = true;
        reject(new Error(`Request body exceeds ${maxBodyBytes} bytes`));
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        const value = text ? (JSON.parse(text) as unknown) : {};
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          reject(new Error("Request body must be a JSON object"));
          return;
        }
        resolve(value);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function authorize(request: IncomingMessage, route: ActiveRoute): boolean {
  if (!route.authToken) return true;
  return request.headers.authorization === `Bearer ${route.authToken}`;
}

function getPathValue(value: unknown, pathExpression: string): unknown {
  if (!pathExpression) return value;
  let current = value;
  for (const segment of pathExpression.split(".")) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function applyTemplateValue(value: unknown, context: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((entry) => applyTemplateValue(entry, context));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, applyTemplateValue(entry, context)]),
    );
  }
  if (typeof value !== "string") return value;
  const exact = /^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/u.exec(value);
  if (exact) return getPathValue(context, exact[1]!);
  return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/gu, (_match, expression: string) => {
    const resolved = getPathValue(context, expression);
    if (resolved === undefined || resolved === null) return "";
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

function applyJsonTemplate(
  template: string | undefined,
  context: Record<string, unknown>,
): unknown {
  const normalized = template?.trim() ?? "";
  if (!normalized) return context.request;
  return applyTemplateValue(JSON.parse(normalized) as unknown, context);
}

function matchRequestId(template: string, requestPath: string): string | null {
  const marker = "{requestId}";
  const markerIndex = template.indexOf(marker);
  if (markerIndex < 0) return null;
  const prefix = template.slice(0, markerIndex);
  const suffix = template.slice(markerIndex + marker.length);
  if (!requestPath.startsWith(prefix) || !requestPath.endsWith(suffix)) return null;
  const rawId = requestPath.slice(prefix.length, requestPath.length - suffix.length);
  if (!rawId || rawId.includes("/")) return null;
  try {
    return decodeURIComponent(rawId);
  } catch {
    return null;
  }
}

function routeServiceName(projectId: string, listenerId: string, routeId: string): string {
  return `${projectId}:${listenerId}:${routeId}`;
}

function listenerRuntimeStatus(
  listener: PluginHttpListener,
  statuses: PluginHttpServiceSummary[],
): PluginHttpListenerRuntime {
  if (!listener.enabled) {
    return { listenerId: listener.id, status: "stopped", boundPort: null, error: null };
  }
  const failed = statuses.find((status) => status.status === "error");
  if (failed) {
    return {
      listenerId: listener.id,
      status: "error",
      boundPort: null,
      error: failed.error,
    };
  }
  const running = statuses.find((status) => status.status === "running");
  if (running) {
    return {
      listenerId: listener.id,
      status: "running",
      boundPort: running.boundPort,
      error: null,
    };
  }
  return {
    listenerId: listener.id,
    status: "stopped",
    boundPort: null,
    error:
      listener.routes.length === 0 && !listener.defaultJobApi?.enabled ? null : "No active routes",
  };
}

export class PluginHttpServiceManager implements PluginHttpServiceRuntime {
  private readonly logger: Logger;
  private readonly store: PluginHttpJobStore;
  private readonly configStore: PluginHttpConfigStore;
  private readonly workflowService: PluginHttpWorkflowRunner;
  private readonly memoryWriter: PluginWorkflowMemoryWriter | null;
  private readonly now: () => Date;
  private readonly statuses = new Map<string, PluginHttpServiceSummary>();
  private readonly bindings = new Map<string, PluginHttpServiceBinding>();
  private activeServers: ActiveServer[] = [];
  private staticBindings: PluginHttpServiceBinding[] = [];
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: {
    paseoHome: string;
    logger: Logger;
    workflowService: PluginHttpWorkflowRunner;
    memoryWriter?: PluginWorkflowMemoryWriter;
    now?: () => Date;
  }) {
    this.logger = options.logger.child({ module: "plugin-http-service-manager" });
    this.store = new PluginHttpJobStore(path.join(options.paseoHome, "plugins", "http-jobs"));
    this.configStore = new PluginHttpConfigStore(
      path.join(options.paseoHome, "plugins", "http-services"),
    );
    this.workflowService = options.workflowService;
    this.memoryWriter = options.memoryWriter ?? null;
    this.now = options.now ?? (() => new Date());
    this.store.initialize(this.now().toISOString());
    this.configStore.initialize();
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredJobs().catch((error) => {
        this.logger.warn({ err: error }, "Plugin HTTP retention cleanup failed");
      });
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  async reconcile(bindings: PluginHttpServiceBinding[]): Promise<void> {
    this.staticBindings = bindings;
    await this.reconcileAll();
  }

  getStatus(pluginId: string, serviceName: string): PluginHttpServiceSummary | null {
    return this.statuses.get(serviceKey(pluginId, serviceName)) ?? null;
  }

  getProjectConfig(
    pluginId: string,
    projectId: string,
  ): { config: PluginHttpProjectConfig; runtimes: PluginHttpListenerRuntime[] } {
    const config =
      this.configStore.get(pluginId, projectId) ?? this.defaultProjectConfig(pluginId, projectId);
    return { config, runtimes: this.projectRuntimes(config) };
  }

  async saveProjectConfig(
    input: Omit<PluginHttpProjectConfig, "updatedAt">,
  ): Promise<{ config: PluginHttpProjectConfig; runtimes: PluginHttpListenerRuntime[] }> {
    const config = PluginHttpProjectConfigSchema.parse({
      ...input,
      updatedAt: this.now().toISOString(),
    });
    this.validateProjectConfig(config);
    this.configStore.save(config);
    await this.reconcileAll();
    await this.cleanupProjectJobs(config.pluginId, config.projectId);
    return { config, runtimes: this.projectRuntimes(config) };
  }

  async copyProjectConfig(
    pluginId: string,
    sourceProjectId: string,
    targetProjectId: string,
  ): Promise<PluginHttpProjectConfig | null> {
    const source = this.configStore.get(pluginId, sourceProjectId);
    if (!source) return null;
    if (this.configStore.get(pluginId, targetProjectId)) {
      throw new Error("目标 Project 已存在 HTTP 服务配置");
    }
    const config = buildCopiedPluginHttpProjectConfig({
      source,
      targetProjectId,
      timestamp: this.now().toISOString(),
    });
    this.configStore.save(config);
    await this.reconcileAll();
    return config;
  }

  async submit(pluginId: string, serviceName: string, input: unknown): Promise<PluginHttpJob> {
    const key = serviceKey(pluginId, serviceName);
    const binding = this.bindings.get(key);
    const status = this.statuses.get(key);
    if (!binding || status?.status !== "running") {
      throw new Error(`Plugin HTTP service is not running: ${pluginId}/${serviceName}`);
    }
    return this.submitBinding(binding, input);
  }

  async createDraft(
    pluginId: string,
    serviceName: string,
    projectId: string,
    input: unknown,
  ): Promise<PluginHttpJob> {
    const binding = this.bindings.get(serviceKey(pluginId, serviceName));
    if (!binding) {
      throw new Error(`Plugin HTTP service is not available: ${pluginId}/${serviceName}`);
    }
    return this.store.create({
      pluginId,
      serviceName,
      projectId,
      input,
      status: "draft",
      createdAt: this.now().toISOString(),
    });
  }

  async startJob(processId: string): Promise<PluginHttpJob | null> {
    const job = this.store.get(processId);
    if (!job) return null;
    if (job.status !== "draft") {
      throw new Error("Only draft plugin jobs can be started");
    }
    const key = serviceKey(job.pluginId, job.serviceName);
    const binding = this.bindings.get(key);
    const status = this.statuses.get(key);
    if (!binding || status?.status !== "running") {
      throw new Error(`Plugin HTTP service is not running: ${job.pluginId}/${job.serviceName}`);
    }
    const queued = await this.store.update(processId, (current) => ({
      ...current,
      status: "queued",
      error: null,
      errorCode: null,
      startedAt: null,
      endedAt: null,
    }));
    if (!queued) return null;
    void this.executeJob(binding, queued).catch((error) => {
      this.logger.error(
        {
          err: error,
          processId: queued.id,
          pluginId: queued.pluginId,
          serviceName: queued.serviceName,
        },
        "Draft plugin HTTP processing job failed",
      );
    });
    return queued;
  }

  getJob(processId: string): PluginHttpJob | null {
    return this.store.get(processId);
  }

  listJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
    statuses?: PluginHttpJobStatus[];
    listenerId?: string;
    routeId?: string;
    createdBefore?: string;
    createdAfter?: string;
  }): PluginHttpJob[] {
    return this.store.list(options);
  }

  async updateJob(processId: string, input: unknown): Promise<PluginHttpJob | null> {
    const job = this.store.get(processId);
    if (!job) return null;
    if (job.status === "queued" || job.status === "running") {
      throw new Error("A running plugin job cannot be edited");
    }
    return this.store.update(processId, (current) => ({ ...current, input }));
  }

  async deleteJob(processId: string): Promise<boolean> {
    const job = this.store.get(processId);
    if (!job) return false;
    if (job.status === "queued" || job.status === "running") {
      throw new Error("A running plugin job cannot be deleted");
    }
    return this.store.delete(processId);
  }

  async deleteJobs(processIds: string[]): Promise<{
    deleted: string[];
    skipped: Array<{ processId: string; reason: string }>;
  }> {
    const deletable: string[] = [];
    const skipped: Array<{ processId: string; reason: string }> = [];
    for (const processId of new Set(processIds)) {
      const job = this.store.get(processId);
      if (!job) {
        skipped.push({ processId, reason: "Request not found" });
      } else if (job.status === "queued" || job.status === "running") {
        skipped.push({ processId, reason: "Running requests cannot be deleted" });
      } else {
        deletable.push(processId);
      }
    }
    return { deleted: await this.store.deleteMany(deletable), skipped };
  }

  async cleanupProjectJobs(pluginId: string, projectId: string): Promise<string[]> {
    const config = this.configStore.get(pluginId, projectId);
    if (!config) return [];
    const jobs = this.store.list({ pluginId, projectId, limit: Number.MAX_SAFE_INTEGER });
    const deletable = new Set<string>();
    const now = this.now().getTime();
    for (const listener of config.listeners) {
      if (!listener.retention.enabled) continue;
      const cutoff = now - listener.retention.maxAgeSeconds * 1000;
      const statuses = new Set(listener.retention.statuses);
      for (const job of jobs) {
        if (
          job.listenerId === listener.id &&
          TERMINAL_STATUSES.has(job.status) &&
          statuses.has(job.status) &&
          Date.parse(job.createdAt) <= cutoff
        ) {
          deletable.add(job.id);
        }
      }
    }
    return this.store.deleteMany([...deletable]);
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await this.closeServers();
    for (const [key, status] of this.statuses) {
      this.statuses.set(key, {
        ...status,
        status: "stopped",
        boundPort: null,
        submitUrl: null,
        resultUrlTemplate: null,
      });
    }
  }

  private async reconcileAll(): Promise<void> {
    await this.closeServers();
    this.statuses.clear();
    this.bindings.clear();
    const managedPluginIds = new Set(this.configStore.list().map((config) => config.pluginId));
    const bindings = [
      ...this.staticBindings.filter((binding) => !managedPluginIds.has(binding.pluginId)),
      ...this.configStore.list().flatMap((config) => this.managedBindings(config)),
    ];
    const groups = new Map<string, PluginHttpServiceBinding[]>();
    for (const binding of bindings) {
      this.bindings.set(serviceKey(binding.pluginId, binding.definition.name), binding);
      this.setStatus(binding, {
        status: "stopped",
        boundPort: null,
        submitUrl: null,
        resultUrlTemplate: null,
        error: null,
      });
      const key = serverKey(binding);
      groups.set(key, [...(groups.get(key) ?? []), binding]);
    }
    for (const group of groups.values()) {
      await this.startGroup(group);
    }
  }

  private managedBindings(config: PluginHttpProjectConfig): PluginHttpServiceBinding[] {
    const bindings: PluginHttpServiceBinding[] = [];
    for (const listener of config.listeners) {
      if (!listener.enabled) continue;
      const common = {
        host: listener.host,
        port: listener.port,
        authTokenEnv: listener.authTokenEnv,
        projectId: config.projectId,
        listenerId: listener.id,
      };
      if (listener.defaultJobApi?.enabled) {
        bindings.push({
          pluginId: config.pluginId,
          pluginName: config.pluginId,
          definition: {
            name: routeServiceName(config.projectId, listener.id, "default"),
            ...common,
            routeId: "default",
            path: listener.defaultJobApi.submitPath,
            queryPath: listener.defaultJobApi.queryPath,
            deletePath: listener.defaultJobApi.deletePath,
            workflowPath: listener.defaultJobApi.workflowPath,
            targetNodeId: listener.defaultJobApi.targetNodeId,
            requestTemplate: listener.defaultJobApi.requestTemplate,
            responseTemplate: listener.defaultJobApi.responseTemplate,
            maxBodyBytes: 1024 * 1024,
          },
        });
      }
      for (const route of listener.routes) {
        if (!route.enabled) continue;
        bindings.push({
          pluginId: config.pluginId,
          pluginName: config.pluginId,
          definition: {
            name: routeServiceName(config.projectId, listener.id, route.id),
            ...common,
            routeId: route.id,
            path: route.path,
            queryPath: `${route.path}/{requestId}`,
            deletePath: `${route.path}/{requestId}`,
            workflowPath: route.workflowPath,
            targetNodeId: route.targetNodeId,
            requestTemplate: route.requestTemplate,
            responseTemplate: route.responseTemplate,
            maxBodyBytes: route.maxBodyBytes,
          },
        });
      }
    }
    return bindings;
  }

  private defaultProjectConfig(pluginId: string, projectId: string): PluginHttpProjectConfig {
    const staticBindings = this.staticBindings.filter((binding) => binding.pluginId === pluginId);
    const groups = new Map<string, PluginHttpServiceBinding[]>();
    for (const binding of staticBindings) {
      const key = `${binding.definition.host}\u0000${binding.definition.port}`;
      groups.set(key, [...(groups.get(key) ?? []), binding]);
    }
    const listeners = [...groups.values()].map((bindings, index) => {
      const first = bindings[0]!;
      return {
        id: `listener-${index + 1}`,
        name: index === 0 ? "异步处理服务" : `监听端口 ${index + 1}`,
        enabled: true,
        host: first.definition.host,
        port: first.definition.port,
        authTokenEnv: first.definition.authTokenEnv,
        defaultJobApi: {
          enabled: true,
          submitPath: "/jobs",
          queryPath: "/jobs/{requestId}",
          deletePath: "/jobs/{requestId}",
          workflowPath: first.definition.workflowPath,
          requestTemplate: "",
          responseTemplate: "",
        },
        routes: bindings.map((binding) => ({
          id: binding.definition.name,
          name: binding.definition.name,
          enabled: true,
          method: "POST" as const,
          path: binding.definition.path,
          requestTemplate: "",
          responseTemplate: "",
          workflowPath: binding.definition.workflowPath,
          maxBodyBytes: binding.definition.maxBodyBytes,
        })),
        retention: {
          enabled: false,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          statuses: ["succeeded", "failed", "cancelled", "timed_out"] as PluginHttpJobStatus[],
        },
      };
    });
    return PluginHttpProjectConfigSchema.parse({
      version: 1,
      pluginId,
      projectId,
      listeners:
        listeners.length > 0
          ? listeners
          : [
              {
                id: "listener-1",
                name: "异步处理服务",
                enabled: false,
                host: "127.0.0.1",
                port: 0,
                routes: [],
                retention: {},
              },
            ],
      updatedAt: this.now().toISOString(),
    });
  }

  private validateProjectConfig(config: PluginHttpProjectConfig): void {
    const listenerIds = new Set<string>();
    for (const listener of config.listeners) {
      if (listenerIds.has(listener.id)) throw new Error(`Duplicate listener ID: ${listener.id}`);
      listenerIds.add(listener.id);
      const routeIds = new Set<string>();
      const paths = new Set<string>();
      const addPath = (value: string, label: string) => {
        if (paths.has(value)) throw new Error(`${listener.name}: duplicate HTTP path ${value}`);
        paths.add(value);
        if ((label === "query" || label === "delete") && !value.includes("{requestId}")) {
          throw new Error(`${listener.name}: ${label} path must contain {requestId}`);
        }
      };
      if (listener.defaultJobApi?.enabled) {
        addPath(listener.defaultJobApi.submitPath, "submit");
        addPath(listener.defaultJobApi.queryPath, "query");
        if (listener.defaultJobApi.deletePath !== listener.defaultJobApi.queryPath) {
          addPath(listener.defaultJobApi.deletePath, "delete");
        } else if (!listener.defaultJobApi.deletePath.includes("{requestId}")) {
          throw new Error(`${listener.name}: delete path must contain {requestId}`);
        }
        if (listener.defaultJobApi.requestTemplate.trim()) {
          JSON.parse(listener.defaultJobApi.requestTemplate);
        }
        if (listener.defaultJobApi.responseTemplate.trim()) {
          JSON.parse(listener.defaultJobApi.responseTemplate);
        }
      }
      for (const route of listener.routes) {
        if (routeIds.has(route.id))
          throw new Error(`${listener.name}: duplicate route ID ${route.id}`);
        routeIds.add(route.id);
        if (route.enabled) addPath(route.path, "route");
        if (route.requestTemplate.trim()) JSON.parse(route.requestTemplate);
        if (route.responseTemplate.trim()) JSON.parse(route.responseTemplate);
      }
    }
  }

  private projectRuntimes(config: PluginHttpProjectConfig): PluginHttpListenerRuntime[] {
    return config.listeners.map((listener) => {
      const statuses = [...this.statuses.values()].filter((status) => {
        const binding = this.bindings.get(serviceKey(config.pluginId, status.name));
        return (
          binding?.definition.projectId === config.projectId &&
          binding.definition.listenerId === listener.id
        );
      });
      return listenerRuntimeStatus(listener, statuses);
    });
  }

  private async startGroup(bindings: PluginHttpServiceBinding[]): Promise<void> {
    const first = bindings[0];
    if (!first) return;
    const routes = this.prepareRoutes(bindings);
    if (routes.length === 0) return;
    const duplicateSignatures = new Set<string>();
    const seenSignatures = new Set<string>();
    for (const route of routes) {
      for (const signature of [
        `POST ${route.submitPath}`,
        `GET ${route.queryPath}`,
        `DELETE ${route.deletePath}`,
      ]) {
        if (seenSignatures.has(signature)) duplicateSignatures.add(signature);
        seenSignatures.add(signature);
      }
    }
    const activeRoutes = routes.filter((route) => {
      const ownSignatures = [
        `POST ${route.submitPath}`,
        `GET ${route.queryPath}`,
        `DELETE ${route.deletePath}`,
      ];
      const duplicate = ownSignatures.find((signature) => duplicateSignatures.has(signature));
      if (!duplicate) return true;
      this.setError(route.binding, `Duplicate HTTP route: ${duplicate}`);
      return false;
    });
    if (activeRoutes.length === 0) return;

    const server = createServer((request, response) => {
      void this.handleRequest(activeRoutes, request, response).catch((error) => {
        this.logger.error({ err: error }, "Plugin HTTP request failed");
        if (!response.headersSent) {
          writeJson(response, 500, { error: "Internal server error" });
        } else if (!response.writableEnded) {
          response.end();
        }
      });
    });
    try {
      const boundPort = await this.listen(server, first.definition.host, first.definition.port);
      server.on("error", (error) => {
        for (const route of activeRoutes) this.setError(route.binding, error.message);
      });
      this.activeServers.push({ server, routes: activeRoutes });
      for (const route of activeRoutes) {
        const host = formatHost(route.binding.definition.host);
        const baseUrl = `http://${host}:${boundPort}`;
        this.setStatus(route.binding, {
          status: "running",
          boundPort,
          submitUrl: `${baseUrl}${route.submitPath}`,
          resultUrlTemplate: `${baseUrl}${route.queryPath}`,
          error: null,
        });
      }
    } catch (error) {
      server.close();
      const message = error instanceof Error ? error.message : String(error);
      for (const route of activeRoutes) this.setError(route.binding, message);
      this.logger.warn(
        { err: error, host: first.definition.host, port: first.definition.port },
        "Failed to start plugin HTTP service",
      );
    }
  }

  private prepareRoutes(bindings: PluginHttpServiceBinding[]): ActiveRoute[] {
    const routes: ActiveRoute[] = [];
    for (const binding of bindings) {
      const { authTokenEnv, host, path: submitPath } = binding.definition;
      if (!isLoopbackHost(host) && !authTokenEnv) {
        this.setError(binding, "Non-loopback HTTP services require authTokenEnv");
        continue;
      }
      const authToken = authTokenEnv ? (process.env[authTokenEnv]?.trim() ?? "") : "";
      if (authTokenEnv && !authToken) {
        this.setError(binding, `Authentication environment variable is not set: ${authTokenEnv}`);
        continue;
      }
      routes.push({
        binding,
        authToken: authToken || null,
        submitPath,
        queryPath: binding.definition.queryPath ?? `${submitPath}/{requestId}`,
        deletePath: binding.definition.deletePath ?? `${submitPath}/{requestId}`,
      });
    }
    return routes;
  }

  private async handleRequest(
    routes: ActiveRoute[],
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const requestUrl = new URL(request.url ?? "/", "http://plugin.local");
    const submitRoute = routes.find((route) => route.submitPath === requestUrl.pathname);
    if (submitRoute) {
      if (!authorize(request, submitRoute)) {
        writeJson(response, 401, { error: "Unauthorized" });
        return;
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        writeJson(response, 405, { error: "Method not allowed" });
        return;
      }
      await this.handleSubmission(submitRoute, request, response);
      return;
    }

    const matched = routes
      .map((route) => ({
        route,
        queryId: matchRequestId(route.queryPath, requestUrl.pathname),
        deleteId: matchRequestId(route.deletePath, requestUrl.pathname),
      }))
      .find((entry) => entry.queryId !== null || entry.deleteId !== null);
    if (!matched) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }
    if (!authorize(request, matched.route)) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }
    const processId = matched.queryId ?? matched.deleteId!;
    const job = this.store.get(processId);
    if (
      !job ||
      job.pluginId !== matched.route.binding.pluginId ||
      job.serviceName !== matched.route.binding.definition.name
    ) {
      writeJson(response, 404, { error: "Processing job not found" });
      return;
    }
    if (request.method === "GET" && matched.queryId !== null) {
      const payload = matched.route.binding.definition.responseTemplate?.trim()
        ? applyJsonTemplate(matched.route.binding.definition.responseTemplate, {
            request: job,
            job,
            result: job.result,
          })
        : job;
      writeJson(response, 200, payload);
      return;
    }
    if (request.method === "DELETE" && matched.deleteId !== null) {
      if (job.status === "queued" || job.status === "running") {
        writeJson(response, 409, { error: "Running requests cannot be deleted" });
        return;
      }
      await this.store.delete(job.id);
      writeJson(response, 200, { processId: job.id, deleted: true });
      return;
    }
    response.setHeader(
      "Allow",
      matched.route.queryPath === matched.route.deletePath ? "GET, DELETE" : "GET",
    );
    writeJson(response, 405, { error: "Method not allowed" });
  }

  private async handleSubmission(
    route: ActiveRoute,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const requestBody = await readJsonBody(request, route.binding.definition.maxBodyBytes);
      const input = route.binding.definition.requestTemplate?.trim()
        ? applyJsonTemplate(route.binding.definition.requestTemplate, { request: requestBody })
        : requestBody;
      const job = await this.submitBinding(route.binding, input);
      const status = this.getStatus(route.binding.pluginId, route.binding.definition.name);
      const standardResponse = {
        processId: job.id,
        status: job.status,
        statusUrl: status?.resultUrlTemplate?.replace("{requestId}", job.id) ?? null,
      };
      const payload = route.binding.definition.responseTemplate?.trim()
        ? applyJsonTemplate(route.binding.definition.responseTemplate, {
            request: standardResponse,
            job,
            result: job.result,
          })
        : standardResponse;
      writeJson(response, 202, payload);
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async submitBinding(
    binding: PluginHttpServiceBinding,
    input: unknown,
  ): Promise<PluginHttpJob> {
    const job = await this.store.create({
      pluginId: binding.pluginId,
      serviceName: binding.definition.name,
      projectId: binding.definition.projectId,
      listenerId: binding.definition.listenerId,
      routeId: binding.definition.routeId,
      input,
      createdAt: this.now().toISOString(),
    });
    void this.executeJob(binding, job).catch((error) => {
      this.logger.error(
        {
          err: error,
          processId: job.id,
          pluginId: binding.pluginId,
          serviceName: binding.definition.name,
        },
        "Plugin HTTP processing job failed",
      );
    });
    return job;
  }

  private async executeJob(binding: PluginHttpServiceBinding, job: PluginHttpJob): Promise<void> {
    await this.store.update(job.id, (current) => ({
      ...current,
      status: "running",
      startedAt: this.now().toISOString(),
    }));
    try {
      const run = await this.workflowService.runScript({
        scriptPath: binding.definition.workflowPath,
        inputPayload: JSON.stringify(job.input),
        targetNodeId: binding.definition.targetNodeId,
      });
      await this.store.update(job.id, (current) => ({ ...current, workflowRunId: run.id }));
      const completed = await this.workflowService.waitForRun(run.id);
      const result = parseJsonResult(completed.outputPayload);
      if (completed.status === "succeeded" && binding.definition.memory && this.memoryWriter) {
        await this.memoryWriter.write({
          pluginId: binding.pluginId,
          serviceName: binding.definition.name,
          outputPath: binding.definition.memory.outputPath,
          result,
        });
      }
      await this.store.update(job.id, (current) => ({
        ...current,
        status: completed.status === "running" ? "failed" : completed.status,
        result,
        error:
          completed.status === "running"
            ? "Workflow remained running after waitForRun completed"
            : completed.error,
        errorCode: completed.status === "running" ? "INVALID_WORKFLOW_STATE" : completed.errorCode,
        endedAt: completed.endedAt ?? this.now().toISOString(),
      }));
    } catch (error) {
      await this.store.update(job.id, (current) => ({
        ...current,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        errorCode: "HTTP_PROCESSOR_FAILED",
        endedAt: this.now().toISOString(),
      }));
    }
  }

  private async cleanupExpiredJobs(): Promise<void> {
    for (const config of this.configStore.list()) {
      await this.cleanupProjectJobs(config.pluginId, config.projectId);
    }
  }

  private setError(binding: PluginHttpServiceBinding, error: string): void {
    this.setStatus(binding, {
      status: "error",
      boundPort: null,
      submitUrl: null,
      resultUrlTemplate: null,
      error,
    });
  }

  private setStatus(
    binding: PluginHttpServiceBinding,
    runtime: MutablePluginHttpServiceStatus,
  ): void {
    this.statuses.set(serviceKey(binding.pluginId, binding.definition.name), {
      name: binding.definition.name,
      host: binding.definition.host,
      configuredPort: binding.definition.port,
      boundPort: runtime.boundPort,
      path: binding.definition.path,
      workflowPath: binding.definition.workflowPath,
      status: runtime.status,
      submitUrl: runtime.submitUrl,
      resultUrlTemplate: runtime.resultUrlTemplate,
      error: runtime.error,
    });
  }

  private listen(server: Server, host: string, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address() as AddressInfo | string | null;
        if (!address || typeof address === "string") {
          reject(new Error("Plugin HTTP service did not expose a TCP address"));
          return;
        }
        resolve(address.port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
  }

  private async closeServers(): Promise<void> {
    const servers = this.activeServers;
    this.activeServers = [];
    await Promise.all(
      servers.map(
        ({ server }) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
  }
}
