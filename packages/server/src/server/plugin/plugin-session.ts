import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type pino from "pino";
import type { McpStore } from "../mcp/mcp-store.js";
import type { SkillStore } from "../skill/skill-store.js";
import type { PluginService } from "./plugin-service.js";

export type PluginSessionRequest = Extract<
  SessionInboundMessage,
  {
    type:
      | "plugin.list.request"
      | "plugin.marketplace.add.request"
      | "plugin.marketplace.remove.request"
      | "plugin.install.request"
      | "plugin.set_enabled.request"
      | "plugin.uninstall.request"
      | "plugin.app.get.request"
      | "plugin.app.generate.request"
      | "plugin.app.action.submit.request"
      | "plugin.app.job.get.request"
      | "plugin.app.job.list.request"
      | "plugin.app.job.update.request"
      | "plugin.app.job.delete.request"
      | "plugin.http.submit.request"
      | "plugin.http.config.get.request"
      | "plugin.http.config.save.request"
      | "plugin.http.job.delete_many.request"
      | "plugin.http.job.cleanup.request";
  }
>;

type PluginJobMutationRequest = Extract<
  PluginSessionRequest,
  {
    type: "plugin.app.job.update.request" | "plugin.app.job.delete.request";
  }
>;

type PluginCatalogRequest = Extract<
  PluginSessionRequest,
  {
    type:
      | "plugin.list.request"
      | "plugin.marketplace.add.request"
      | "plugin.marketplace.remove.request"
      | "plugin.install.request"
      | "plugin.set_enabled.request"
      | "plugin.uninstall.request";
  }
>;

type PluginAppRequest = Extract<
  PluginSessionRequest,
  {
    type:
      | "plugin.app.get.request"
      | "plugin.app.generate.request"
      | "plugin.app.action.submit.request"
      | "plugin.http.submit.request"
      | "plugin.app.job.get.request"
      | "plugin.app.job.list.request";
  }
>;

type PluginHttpManagementRequest = Extract<
  PluginSessionRequest,
  {
    type:
      | "plugin.http.config.get.request"
      | "plugin.http.config.save.request"
      | "plugin.http.job.delete_many.request"
      | "plugin.http.job.cleanup.request";
  }
>;

function isPluginJobMutationRequest(
  message: PluginSessionRequest,
): message is PluginJobMutationRequest {
  return (
    message.type === "plugin.app.job.update.request" ||
    message.type === "plugin.app.job.delete.request"
  );
}

function isPluginCatalogRequest(message: PluginSessionRequest): message is PluginCatalogRequest {
  return (
    message.type === "plugin.list.request" ||
    message.type === "plugin.marketplace.add.request" ||
    message.type === "plugin.marketplace.remove.request" ||
    message.type === "plugin.install.request" ||
    message.type === "plugin.set_enabled.request" ||
    message.type === "plugin.uninstall.request"
  );
}

function isPluginAppRequest(message: PluginSessionRequest): message is PluginAppRequest {
  return (
    message.type === "plugin.app.get.request" ||
    message.type === "plugin.app.generate.request" ||
    message.type === "plugin.app.action.submit.request" ||
    message.type === "plugin.http.submit.request" ||
    message.type === "plugin.app.job.get.request" ||
    message.type === "plugin.app.job.list.request"
  );
}

function requirePluginProjectId(projectId: string | undefined): string {
  if (!projectId) {
    throw new Error("This plugin app requires a Project. Update Paseo and reopen the plugin.");
  }
  return projectId;
}

export interface PluginSessionHost {
  emit(message: SessionOutboundMessage): void;
}

export class PluginSession {
  private readonly host: PluginSessionHost;
  private readonly service: PluginService;
  private readonly mcpStore: McpStore;
  private readonly skillStore: SkillStore;
  private readonly logger: pino.Logger;

  constructor(options: {
    host: PluginSessionHost;
    service: PluginService;
    mcpStore: McpStore;
    skillStore: SkillStore;
    logger: pino.Logger;
  }) {
    this.host = options.host;
    this.service = options.service;
    this.mcpStore = options.mcpStore;
    this.skillStore = options.skillStore;
    this.logger = options.logger.child({ module: "plugin-session" });
  }

  async handleRequest(message: PluginSessionRequest): Promise<void> {
    try {
      if (isPluginJobMutationRequest(message)) {
        await this.handleJobMutation(message);
        return;
      }
      if (isPluginCatalogRequest(message)) {
        await this.handleCatalogRequest(message);
        return;
      }
      if (isPluginAppRequest(message)) {
        await this.handleAppRequest(message);
        return;
      }
      await this.handleHttpManagementRequest(message);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.logger.warn({ err: error, requestType: message.type }, "Plugin RPC failed");
      this.emitError(message, messageText);
    }
  }

  private async handleCatalogRequest(message: PluginCatalogRequest): Promise<void> {
    switch (message.type) {
      case "plugin.list.request": {
        const state = message.refresh ? this.service.refresh() : this.service.getState();
        this.host.emit({
          type: "plugin.list.response",
          payload: { requestId: message.requestId, ...state, error: null },
        });
        return;
      }
      case "plugin.marketplace.add.request": {
        const result = this.service.addMarketplace(message.path);
        this.emitChanged(result.state);
        this.host.emit({
          type: "plugin.marketplace.add.response",
          payload: {
            requestId: message.requestId,
            marketplace: result.marketplace,
            ...result.state,
            error: null,
          },
        });
        return;
      }
      case "plugin.marketplace.remove.request": {
        const result = this.service.removeMarketplace(message.marketplaceId);
        this.emitChanged(result.state);
        this.host.emit({
          type: "plugin.marketplace.remove.response",
          payload: {
            requestId: message.requestId,
            marketplaceId: message.marketplaceId,
            ok: result.ok,
            ...result.state,
            error: result.ok ? null : "Marketplace not found or cannot be removed",
          },
        });
        return;
      }
      case "plugin.install.request": {
        const result = await this.service.install(message.source);
        this.emitResourceChanges();
        this.emitChanged(result.state);
        this.host.emit({
          type: "plugin.install.response",
          payload: {
            requestId: message.requestId,
            plugin: result.plugin,
            state: result.state,
            error: null,
          },
        });
        return;
      }
      case "plugin.set_enabled.request": {
        const result = await this.service.setEnabled(message.pluginId, message.enabled);
        this.emitResourceChanges();
        this.emitChanged(result.state);
        this.host.emit({
          type: "plugin.set_enabled.response",
          payload: {
            requestId: message.requestId,
            plugin: result.plugin,
            state: result.state,
            error: null,
          },
        });
        return;
      }
      case "plugin.uninstall.request": {
        const result = await this.service.uninstall(message.pluginId);
        this.emitResourceChanges();
        this.emitChanged(result.state);
        this.host.emit({
          type: "plugin.uninstall.response",
          payload: {
            requestId: message.requestId,
            pluginId: message.pluginId,
            ok: result.ok,
            ...result.state,
            error: result.ok ? null : "Plugin not found",
          },
        });
        return;
      }
    }
  }

  private async handleAppRequest(message: PluginAppRequest): Promise<void> {
    switch (message.type) {
      case "plugin.app.get.request": {
        const projectId = requirePluginProjectId(message.projectId);
        this.host.emit({
          type: "plugin.app.get.response",
          payload: {
            requestId: message.requestId,
            app: this.service.getApp(message.pluginId, message.appId, projectId),
            error: null,
          },
        });
        return;
      }
      case "plugin.app.generate.request": {
        const projectId = requirePluginProjectId(message.projectId);
        this.host.emit({
          type: "plugin.app.generate.response",
          payload: {
            requestId: message.requestId,
            app: await this.service.generateApp(
              message.pluginId,
              message.appId,
              projectId,
              message.prompt,
            ),
            error: null,
          },
        });
        return;
      }
      case "plugin.app.action.submit.request": {
        const projectId = requirePluginProjectId(message.projectId);
        this.host.emit({
          type: "plugin.app.action.submit.response",
          payload: {
            requestId: message.requestId,
            job: await this.service.submitAppAction({
              pluginId: message.pluginId,
              appId: message.appId,
              projectId,
              componentId: message.componentId,
              form: message.form,
            }),
            error: null,
          },
        });
        return;
      }
      case "plugin.http.submit.request": {
        this.host.emit({
          type: "plugin.http.submit.response",
          payload: {
            requestId: message.requestId,
            job: await this.service.submitHttpService(
              message.pluginId,
              message.serviceName,
              message.input,
            ),
            error: null,
          },
        });
        return;
      }
      case "plugin.app.job.get.request": {
        const job = this.service.getAppJob(message.processId);
        this.host.emit({
          type: "plugin.app.job.get.response",
          payload: {
            requestId: message.requestId,
            job,
            error: job ? null : "Plugin app processing job not found",
          },
        });
        return;
      }
      case "plugin.app.job.list.request": {
        this.host.emit({
          type: "plugin.app.job.list.response",
          payload: {
            requestId: message.requestId,
            jobs: this.service.listAppJobs({
              pluginId: message.pluginId,
              serviceName: message.serviceName,
              projectId: message.projectId,
              limit: message.limit,
              statuses: message.filters?.statuses,
              listenerId: message.filters?.listenerId,
              routeId: message.filters?.routeId,
              createdBefore: message.filters?.createdBefore,
              createdAfter: message.filters?.createdAfter,
            }),
            error: null,
          },
        });
        return;
      }
    }
  }

  private async handleHttpManagementRequest(message: PluginHttpManagementRequest): Promise<void> {
    switch (message.type) {
      case "plugin.http.config.get.request": {
        const result = this.service.getHttpProjectConfig(message.pluginId, message.projectId);
        this.host.emit({
          type: "plugin.http.config.get.response",
          payload: { requestId: message.requestId, ...result, error: null },
        });
        return;
      }
      case "plugin.http.config.save.request": {
        const result = await this.service.saveHttpProjectConfig(message.config);
        this.host.emit({
          type: "plugin.http.config.save.response",
          payload: { requestId: message.requestId, ...result, error: null },
        });
        return;
      }
      case "plugin.http.job.delete_many.request": {
        const result = await this.service.deleteAppJobs(message.processIds);
        this.host.emit({
          type: "plugin.http.job.delete_many.response",
          payload: { requestId: message.requestId, ...result, error: null },
        });
        return;
      }
      case "plugin.http.job.cleanup.request": {
        const deleted = await this.service.cleanupHttpProjectJobs(
          message.pluginId,
          message.projectId,
        );
        this.host.emit({
          type: "plugin.http.job.cleanup.response",
          payload: { requestId: message.requestId, deleted, error: null },
        });
        return;
      }
    }
  }

  private async handleJobMutation(message: PluginJobMutationRequest): Promise<void> {
    if (message.type === "plugin.app.job.update.request") {
      const job = await this.service.updateAppJob(message.processId, message.input);
      this.host.emit({
        type: "plugin.app.job.update.response",
        payload: {
          requestId: message.requestId,
          job,
          error: job ? null : "Plugin app processing job not found",
        },
      });
      return;
    }
    const deleted = await this.service.deleteAppJob(message.processId);
    this.host.emit({
      type: "plugin.app.job.delete.response",
      payload: {
        requestId: message.requestId,
        processId: message.processId,
        deleted,
        error: deleted ? null : "Plugin app processing job not found",
      },
    });
  }

  private emitChanged(state = this.service.getState()): void {
    this.host.emit({ type: "plugin.changed", payload: state });
  }

  private emitResourceChanges(): void {
    this.host.emit({
      type: "skill.changed",
      payload: { skills: this.skillStore.list() },
    });
    this.host.emit({
      type: "mcp.changed",
      payload: { servers: this.mcpStore.list() },
    });
  }

  private emitError(message: PluginSessionRequest, error: string): void {
    const state = this.service.getState();
    switch (message.type) {
      case "plugin.list.request":
        this.host.emit({
          type: "plugin.list.response",
          payload: { requestId: message.requestId, ...state, error },
        });
        return;
      case "plugin.marketplace.add.request":
        this.host.emit({
          type: "plugin.marketplace.add.response",
          payload: { requestId: message.requestId, marketplace: null, ...state, error },
        });
        return;
      case "plugin.marketplace.remove.request":
        this.host.emit({
          type: "plugin.marketplace.remove.response",
          payload: {
            requestId: message.requestId,
            marketplaceId: message.marketplaceId,
            ok: false,
            ...state,
            error,
          },
        });
        return;
      case "plugin.install.request":
        this.host.emit({
          type: "plugin.install.response",
          payload: { requestId: message.requestId, plugin: null, state, error },
        });
        return;
      case "plugin.set_enabled.request":
        this.host.emit({
          type: "plugin.set_enabled.response",
          payload: { requestId: message.requestId, plugin: null, state, error },
        });
        return;
      case "plugin.uninstall.request":
        this.host.emit({
          type: "plugin.uninstall.response",
          payload: {
            requestId: message.requestId,
            pluginId: message.pluginId,
            ok: false,
            ...state,
            error,
          },
        });
        return;
      case "plugin.app.get.request":
        this.host.emit({
          type: "plugin.app.get.response",
          payload: { requestId: message.requestId, app: null, error },
        });
        return;
      case "plugin.app.generate.request":
        this.host.emit({
          type: "plugin.app.generate.response",
          payload: { requestId: message.requestId, app: null, error },
        });
        return;
      case "plugin.app.action.submit.request":
        this.host.emit({
          type: "plugin.app.action.submit.response",
          payload: { requestId: message.requestId, job: null, error },
        });
        return;
      case "plugin.http.submit.request":
        this.host.emit({
          type: "plugin.http.submit.response",
          payload: { requestId: message.requestId, job: null, error },
        });
        return;
      case "plugin.app.job.get.request":
        this.host.emit({
          type: "plugin.app.job.get.response",
          payload: { requestId: message.requestId, job: null, error },
        });
        return;
      case "plugin.app.job.list.request":
        this.host.emit({
          type: "plugin.app.job.list.response",
          payload: { requestId: message.requestId, jobs: [], error },
        });
        return;
      case "plugin.app.job.update.request":
        this.host.emit({
          type: "plugin.app.job.update.response",
          payload: { requestId: message.requestId, job: null, error },
        });
        return;
      case "plugin.app.job.delete.request":
        this.host.emit({
          type: "plugin.app.job.delete.response",
          payload: {
            requestId: message.requestId,
            processId: message.processId,
            deleted: false,
            error,
          },
        });
        return;
      case "plugin.http.config.get.request":
        this.host.emit({
          type: "plugin.http.config.get.response",
          payload: { requestId: message.requestId, config: null, runtimes: [], error },
        });
        return;
      case "plugin.http.config.save.request":
        this.host.emit({
          type: "plugin.http.config.save.response",
          payload: { requestId: message.requestId, config: null, runtimes: [], error },
        });
        return;
      case "plugin.http.job.delete_many.request":
        this.host.emit({
          type: "plugin.http.job.delete_many.response",
          payload: { requestId: message.requestId, deleted: [], skipped: [], error },
        });
        return;
      case "plugin.http.job.cleanup.request":
        this.host.emit({
          type: "plugin.http.job.cleanup.response",
          payload: { requestId: message.requestId, deleted: [], error },
        });
        return;
    }
  }
}
