import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Logger } from "pino";
import type { PluginHttpJob, PluginHttpServiceSummary } from "@getpaseo/protocol/messages";
import { PluginHttpJobStore } from "./plugin-http-job-store.js";
import type {
  MutablePluginHttpServiceStatus,
  PluginHttpServiceBinding,
  PluginHttpServiceRuntime,
  PluginWorkflowMemoryWriter,
} from "./plugin-http-runtime-types.js";

interface PluginHttpWorkflowRunner {
  runScript(input: { scriptPath: string; inputPayload: string }): Promise<{ id: string }>;
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
}

interface ActiveServer {
  server: Server;
  routes: ActiveRoute[];
}

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function serviceKey(pluginId: string, serviceName: string): string {
  return `${pluginId}\u0000${serviceName}`;
}

function serverKey(binding: PluginHttpServiceBinding): string {
  return `${binding.definition.host}\u0000${binding.definition.port}`;
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

function resultJobId(routePath: string, requestPath: string): string | null {
  const prefix = routePath === "/" ? "/" : `${routePath}/`;
  if (!requestPath.startsWith(prefix)) return null;
  const suffix = requestPath.slice(prefix.length);
  if (!suffix || suffix.includes("/")) return null;
  try {
    return decodeURIComponent(suffix);
  } catch {
    return null;
  }
}

export class PluginHttpServiceManager implements PluginHttpServiceRuntime {
  private readonly logger: Logger;
  private readonly store: PluginHttpJobStore;
  private readonly workflowService: PluginHttpWorkflowRunner;
  private readonly memoryWriter: PluginWorkflowMemoryWriter | null;
  private readonly now: () => Date;
  private readonly statuses = new Map<string, PluginHttpServiceSummary>();
  private readonly bindings = new Map<string, PluginHttpServiceBinding>();
  private activeServers: ActiveServer[] = [];

  constructor(options: {
    paseoHome: string;
    logger: Logger;
    workflowService: PluginHttpWorkflowRunner;
    memoryWriter?: PluginWorkflowMemoryWriter;
    now?: () => Date;
  }) {
    this.logger = options.logger.child({ module: "plugin-http-service-manager" });
    this.store = new PluginHttpJobStore(path.join(options.paseoHome, "plugins", "http-jobs"));
    this.workflowService = options.workflowService;
    this.memoryWriter = options.memoryWriter ?? null;
    this.now = options.now ?? (() => new Date());
    this.store.initialize(this.now().toISOString());
  }

  async reconcile(bindings: PluginHttpServiceBinding[]): Promise<void> {
    await this.closeServers();
    this.statuses.clear();
    this.bindings.clear();
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

  getStatus(pluginId: string, serviceName: string): PluginHttpServiceSummary | null {
    return this.statuses.get(serviceKey(pluginId, serviceName)) ?? null;
  }

  async submit(pluginId: string, serviceName: string, input: unknown): Promise<PluginHttpJob> {
    const key = serviceKey(pluginId, serviceName);
    const binding = this.bindings.get(key);
    const status = this.statuses.get(key);
    if (!binding || status?.status !== "running") {
      throw new Error(`Plugin HTTP service is not running: ${pluginId}/${serviceName}`);
    }
    const job = await this.store.create({
      pluginId,
      serviceName,
      input,
      createdAt: this.now().toISOString(),
    });
    void this.executeJob(binding, job).catch((error) => {
      this.logger.error(
        { err: error, processId: job.id, pluginId, serviceName },
        "Plugin HTTP processing job failed",
      );
    });
    return job;
  }

  getJob(processId: string): PluginHttpJob | null {
    return this.store.get(processId);
  }

  listJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
  }): PluginHttpJob[] {
    return this.store.list(options);
  }

  async stop(): Promise<void> {
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

  private async startGroup(bindings: PluginHttpServiceBinding[]): Promise<void> {
    const first = bindings[0];
    if (!first) return;
    const routes = this.prepareRoutes(bindings);
    if (routes.length === 0) return;
    const duplicatePaths = new Set<string>();
    const seenPaths = new Set<string>();
    for (const route of routes) {
      const routePath = route.binding.definition.path;
      if (seenPaths.has(routePath)) duplicatePaths.add(routePath);
      seenPaths.add(routePath);
    }
    const activeRoutes = routes.filter((route) => {
      if (!duplicatePaths.has(route.binding.definition.path)) return true;
      this.setError(route.binding, `Duplicate HTTP route path: ${route.binding.definition.path}`);
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
        for (const route of activeRoutes) {
          this.setError(route.binding, error.message);
        }
        this.logger.error(
          {
            err: error,
            host: first.definition.host,
            port: boundPort,
          },
          "Plugin HTTP service listener failed",
        );
      });
      this.activeServers.push({ server, routes: activeRoutes });
      for (const route of activeRoutes) {
        const host = formatHost(route.binding.definition.host);
        const baseUrl = `http://${host}:${boundPort}`;
        this.setStatus(route.binding, {
          status: "running",
          boundPort,
          submitUrl: `${baseUrl}${route.binding.definition.path}`,
          resultUrlTemplate: `${baseUrl}${route.binding.definition.path}/{processId}`,
          error: null,
        });
      }
    } catch (error) {
      server.close();
      const message = error instanceof Error ? error.message : String(error);
      for (const route of activeRoutes) this.setError(route.binding, message);
      this.logger.warn(
        {
          err: error,
          host: first.definition.host,
          port: first.definition.port,
        },
        "Failed to start plugin HTTP service",
      );
    }
  }

  private prepareRoutes(bindings: PluginHttpServiceBinding[]): ActiveRoute[] {
    const routes: ActiveRoute[] = [];
    for (const binding of bindings) {
      const { authTokenEnv, host } = binding.definition;
      if (!isLoopbackHost(host) && !authTokenEnv) {
        this.setError(binding, "Non-loopback HTTP services require authTokenEnv");
        continue;
      }
      const authToken = authTokenEnv ? (process.env[authTokenEnv]?.trim() ?? "") : "";
      if (authTokenEnv && !authToken) {
        this.setError(binding, `Authentication environment variable is not set: ${authTokenEnv}`);
        continue;
      }
      routes.push({ binding, authToken: authToken || null });
    }
    return routes;
  }

  private async handleRequest(
    routes: ActiveRoute[],
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const requestUrl = new URL(request.url ?? "/", "http://plugin.local");
    const submitRoute = routes.find(
      (route) => route.binding.definition.path === requestUrl.pathname,
    );
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

    const resultRoute = routes
      .map((route) => ({
        route,
        id: resultJobId(route.binding.definition.path, requestUrl.pathname),
      }))
      .find((entry) => entry.id !== null);
    if (!resultRoute) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }
    if (!authorize(request, resultRoute.route)) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      writeJson(response, 405, { error: "Method not allowed" });
      return;
    }
    const job = this.store.get(resultRoute.id!);
    if (
      !job ||
      job.pluginId !== resultRoute.route.binding.pluginId ||
      job.serviceName !== resultRoute.route.binding.definition.name
    ) {
      writeJson(response, 404, { error: "Processing job not found" });
      return;
    }
    writeJson(response, 200, job);
  }

  private async handleSubmission(
    route: ActiveRoute,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const input = await readJsonBody(request, route.binding.definition.maxBodyBytes);
      const job = await this.submit(route.binding.pluginId, route.binding.definition.name, input);
      const status = this.getStatus(route.binding.pluginId, route.binding.definition.name);
      writeJson(response, 202, {
        processId: job.id,
        status: job.status,
        statusUrl: status?.submitUrl ? `${status.submitUrl}/${job.id}` : null,
      });
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
      });
      await this.store.update(job.id, (current) => ({
        ...current,
        workflowRunId: run.id,
      }));
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
