import type {
  McpServer,
  McpServerCreateInput,
  McpServerUpdateInput,
  PaseoMemoryUpdateInput,
  PaseoMemorySyncSnapshot,
  PluginAppDefaultAgent,
  PluginAppState,
  PluginHttpJob,
  PluginHttpJobStatus,
  PluginHttpProjectConfig,
  PluginInstallSource,
  PluginMarketplaceSummary,
  PluginState,
  PluginSummary,
  SessionInboundMessage,
  SessionOutboundMessage,
  Skill,
  SkillCreateInput,
  SkillUpdateInput,
  Team,
  TeamCreateInput,
  TeamUpdateInput,
} from "@getpaseo/protocol/messages";

import type {
  ApplyLarkBotOptions,
  ApproveLarkPairingOptions,
  AssistantRequestOptions,
  ConfigureLarkChannelOptions,
  CreateLarkReminderOptions,
  CreateAssistantOptions,
  DeleteAssistantOptions,
  DeleteLarkBotOptions,
  DeleteLarkReminderOptions,
  GetLarkBotApplicationOptions,
  LarkChannelRequestOptions,
  RejectLarkPairingOptions,
  ResolveLarkDirectoryChatsOptions,
  ResolveLarkDirectoryUsersOptions,
  RevokeLarkUserOptions,
  SetLarkChannelEnabledOptions,
  SetLarkReminderEnabledOptions,
  UpdateAssistantOptions,
} from "./daemon-client.js";

type ResponsePayload<TType extends SessionOutboundMessage["type"]> =
  Extract<SessionOutboundMessage, { type: TType }> extends { payload: infer TPayload }
    ? TPayload
    : never;

export type FeatureRpcRequest = (params: {
  requestId?: string;
  message: { type: SessionInboundMessage["type"] } & Record<string, unknown>;
  responseType: SessionOutboundMessage["type"];
  timeout?: number;
}) => Promise<unknown>;

export class DaemonResourceRpcClient {
  constructor(private readonly sendRequest: FeatureRpcRequest) {}

  private request<TType extends SessionOutboundMessage["type"]>(params: {
    requestId?: string;
    message: { type: SessionInboundMessage["type"] } & Record<string, unknown>;
    responseType: TType;
    timeout?: number;
  }): Promise<ResponsePayload<TType>> {
    return this.sendRequest(params) as Promise<ResponsePayload<TType>>;
  }

  listAssistants(options?: AssistantRequestOptions) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "assistant.list.request" },
      responseType: "assistant.list.response",
    });
  }

  createAssistant(options: CreateAssistantOptions) {
    const { requestId, ...assistant } = options;
    return this.request({
      requestId,
      message: { type: "assistant.create.request", assistant },
      responseType: "assistant.create.response",
    });
  }

  updateAssistant(options: UpdateAssistantOptions) {
    const { requestId, ...assistant } = options;
    return this.request({
      requestId,
      message: { type: "assistant.update.request", assistant },
      responseType: "assistant.update.response",
    });
  }

  deleteAssistant(options: DeleteAssistantOptions) {
    return this.request({
      requestId: options.requestId,
      message: { type: "assistant.delete.request", id: options.id },
      responseType: "assistant.delete.response",
    });
  }

  getMemoryState(options?: { requestId?: string }) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "memory.get_state.request" },
      responseType: "memory.get_state.response",
    });
  }

  updateMemoryState(update: PaseoMemoryUpdateInput, options?: { requestId?: string }) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "memory.update_state.request", update },
      responseType: "memory.update_state.response",
    });
  }

  clearMemory(options?: { requestId?: string }) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "memory.clear.request" },
      responseType: "memory.clear.response",
    });
  }

  getMemorySyncSnapshot(options?: { requestId?: string }) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "memory.get_sync_snapshot.request" },
      responseType: "memory.get_sync_snapshot.response",
    });
  }

  mergeMemorySyncSnapshot(snapshot: PaseoMemorySyncSnapshot, options?: { requestId?: string }) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "memory.merge_sync_snapshot.request", snapshot },
      responseType: "memory.merge_sync_snapshot.response",
    });
  }

  translateReasoning(options: { agentId: string; text: string; requestId?: string }) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "reasoning.translate.request",
        agentId: options.agentId,
        text: options.text,
      },
      responseType: "reasoning.translate.response",
      timeout: 180_000,
    });
  }

  async listTeams(): Promise<{ teams: Team[]; error: string | null }> {
    const result = await this.request({
      message: { type: "team.list.request" },
      responseType: "team.list.response",
    });
    return { teams: result.teams, error: result.error };
  }

  async createTeam(input: TeamCreateInput): Promise<{ team: Team | null; error: string | null }> {
    const result = await this.request({
      message: { type: "team.create.request", team: input },
      responseType: "team.create.response",
    });
    return { team: result.team, error: result.error };
  }

  async updateTeam(input: TeamUpdateInput): Promise<{ team: Team | null; error: string | null }> {
    const result = await this.request({
      message: { type: "team.update.request", team: input },
      responseType: "team.update.response",
    });
    return { team: result.team, error: result.error };
  }

  async deleteTeam(id: string): Promise<{ ok: boolean; error: string | null }> {
    const result = await this.request({
      message: { type: "team.delete.request", id },
      responseType: "team.delete.response",
    });
    return { ok: result.ok, error: result.error };
  }

  async listMcpServers(options?: {
    refresh?: boolean;
  }): Promise<{ servers: McpServer[]; error: string | null }> {
    const result = await this.request({
      message: { type: "mcp.list.request", refresh: options?.refresh },
      responseType: "mcp.list.response",
    });
    return { servers: result.servers, error: result.error };
  }

  async createMcpServer(
    input: McpServerCreateInput,
  ): Promise<{ server: McpServer | null; error: string | null }> {
    const result = await this.request({
      message: { type: "mcp.create.request", server: input },
      responseType: "mcp.create.response",
    });
    return { server: result.server, error: result.error };
  }

  async updateMcpServer(
    input: McpServerUpdateInput,
  ): Promise<{ server: McpServer | null; error: string | null }> {
    const result = await this.request({
      message: { type: "mcp.update.request", server: input },
      responseType: "mcp.update.response",
    });
    return { server: result.server, error: result.error };
  }

  async deleteMcpServer(id: string): Promise<{ ok: boolean; error: string | null }> {
    const result = await this.request({
      message: { type: "mcp.delete.request", id },
      responseType: "mcp.delete.response",
    });
    return { ok: result.ok, error: result.error };
  }

  async testMcpServerConnection(id: string): Promise<{
    status: "connected" | "error";
    tools?: { name: string; description?: string }[];
    error: string | null;
  }> {
    const result = await this.request({
      message: { type: "mcp.test_connection.request", id },
      responseType: "mcp.test_connection.response",
    });
    return { status: result.status, tools: result.tools, error: result.error };
  }

  async listSkills(options?: {
    refresh?: boolean;
  }): Promise<{ skills: Skill[]; error: string | null }> {
    const result = await this.request({
      message: { type: "skill.list.request", refresh: options?.refresh },
      responseType: "skill.list.response",
    });
    return { skills: result.skills, error: result.error };
  }

  async createSkill(
    input: SkillCreateInput,
  ): Promise<{ skill: Skill | null; error: string | null }> {
    const result = await this.request({
      message: { type: "skill.create.request", skill: input },
      responseType: "skill.create.response",
    });
    return { skill: result.skill, error: result.error };
  }

  async updateSkill(
    input: SkillUpdateInput,
  ): Promise<{ skill: Skill | null; error: string | null }> {
    const result = await this.request({
      message: { type: "skill.update.request", skill: input },
      responseType: "skill.update.response",
    });
    return { skill: result.skill, error: result.error };
  }

  async deleteSkill(id: string): Promise<{ ok: boolean; error: string | null }> {
    const result = await this.request({
      message: { type: "skill.delete.request", id },
      responseType: "skill.delete.response",
    });
    return { ok: result.ok, error: result.error };
  }

  async listPlugins(options?: {
    refresh?: boolean;
  }): Promise<PluginState & { error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.list.request", refresh: options?.refresh },
      responseType: "plugin.list.response",
    });
    return {
      plugins: result.plugins,
      marketplaces: result.marketplaces,
      error: result.error,
    };
  }

  async addPluginMarketplace(path: string): Promise<
    PluginState & {
      marketplace: PluginMarketplaceSummary | null;
      error: string | null;
    }
  > {
    const result = await this.request({
      message: { type: "plugin.marketplace.add.request", path },
      responseType: "plugin.marketplace.add.response",
    });
    return {
      marketplace: result.marketplace,
      plugins: result.plugins,
      marketplaces: result.marketplaces,
      error: result.error,
    };
  }

  async removePluginMarketplace(
    marketplaceId: string,
  ): Promise<PluginState & { ok: boolean; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.marketplace.remove.request", marketplaceId },
      responseType: "plugin.marketplace.remove.response",
    });
    return {
      ok: result.ok,
      plugins: result.plugins,
      marketplaces: result.marketplaces,
      error: result.error,
    };
  }

  async installPlugin(source: PluginInstallSource): Promise<{
    plugin: PluginSummary | null;
    state: PluginState;
    error: string | null;
  }> {
    const result = await this.request({
      message: { type: "plugin.install.request", source },
      responseType: "plugin.install.response",
    });
    return { plugin: result.plugin, state: result.state, error: result.error };
  }

  async setPluginEnabled(
    pluginId: string,
    enabled: boolean,
  ): Promise<{ plugin: PluginSummary | null; state: PluginState; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.set_enabled.request", pluginId, enabled },
      responseType: "plugin.set_enabled.response",
    });
    return { plugin: result.plugin, state: result.state, error: result.error };
  }

  async uninstallPlugin(
    pluginId: string,
  ): Promise<PluginState & { ok: boolean; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.uninstall.request", pluginId },
      responseType: "plugin.uninstall.response",
    });
    return {
      ok: result.ok,
      plugins: result.plugins,
      marketplaces: result.marketplaces,
      error: result.error,
    };
  }

  async getPluginApp(
    pluginId: string,
    appId: string,
    projectId: string,
  ): Promise<{ app: PluginAppState | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.get.request", pluginId, appId, projectId },
      responseType: "plugin.app.get.response",
    });
    return { app: result.app, error: result.error };
  }

  async configurePluginApp(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    defaultAgent: PluginAppDefaultAgent;
  }): Promise<{ app: PluginAppState | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.configure.request", ...input },
      responseType: "plugin.app.configure.response",
    });
    return { app: result.app, error: result.error };
  }

  async listPluginAppProjects(
    pluginId: string,
    appId: string,
  ): Promise<{ projects: PluginAppState[]; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.project.list.request", pluginId, appId },
      responseType: "plugin.app.project.list.response",
    });
    return { projects: result.projects, error: result.error };
  }

  async deletePluginAppProject(input: {
    pluginId: string;
    appId: string;
    projectId: string;
  }): Promise<{ projectId: string; deleted: boolean; error: string | null }> {
    return this.request({
      message: { type: "plugin.app.project.delete.request", ...input },
      responseType: "plugin.app.project.delete.response",
    });
  }

  async generatePluginApp(
    pluginId: string,
    appId: string,
    projectId: string,
    prompt: string,
  ): Promise<{ app: PluginAppState | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.generate.request", pluginId, appId, projectId, prompt },
      responseType: "plugin.app.generate.response",
      timeout: 180_000,
    });
    return { app: result.app, error: result.error };
  }

  async submitPluginAppAction(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    componentId: string;
    form: Record<string, unknown>;
  }): Promise<{ job: PluginHttpJob | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.action.submit.request", ...input },
      responseType: "plugin.app.action.submit.response",
    });
    return { job: result.job, error: result.error };
  }

  async submitPluginHttpService(input: {
    pluginId: string;
    serviceName: string;
    input: unknown;
  }): Promise<{ job: PluginHttpJob | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.http.submit.request", ...input },
      responseType: "plugin.http.submit.response",
    });
    return { job: result.job, error: result.error };
  }

  async getPluginAppJob(
    processId: string,
  ): Promise<{ job: PluginHttpJob | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.job.get.request", processId },
      responseType: "plugin.app.job.get.response",
    });
    return { job: result.job, error: result.error };
  }

  async listPluginAppJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
    filters?: {
      statuses?: PluginHttpJobStatus[];
      listenerId?: string;
      routeId?: string;
      createdBefore?: string;
      createdAfter?: string;
    };
  }): Promise<{ jobs: PluginHttpJob[]; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.job.list.request", ...options },
      responseType: "plugin.app.job.list.response",
    });
    return { jobs: result.jobs, error: result.error };
  }

  async updatePluginAppJob(
    processId: string,
    input: unknown,
  ): Promise<{ job: PluginHttpJob | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.job.update.request", processId, input },
      responseType: "plugin.app.job.update.response",
    });
    return { job: result.job, error: result.error };
  }

  async createPluginAppJobDraft(input: {
    pluginId: string;
    serviceName: string;
    projectId: string;
    input: unknown;
  }): Promise<{ job: PluginHttpJob | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.job.draft.create.request", ...input },
      responseType: "plugin.app.job.draft.create.response",
    });
    return { job: result.job, error: result.error };
  }

  async startPluginAppJob(
    processId: string,
  ): Promise<{ job: PluginHttpJob | null; error: string | null }> {
    const result = await this.request({
      message: { type: "plugin.app.job.start.request", processId },
      responseType: "plugin.app.job.start.response",
    });
    return { job: result.job, error: result.error };
  }

  async deletePluginAppJob(
    processId: string,
  ): Promise<{ processId: string; deleted: boolean; error: string | null }> {
    return this.request({
      message: { type: "plugin.app.job.delete.request", processId },
      responseType: "plugin.app.job.delete.response",
    });
  }

  async getPluginHttpConfig(pluginId: string, projectId: string) {
    return this.request({
      message: { type: "plugin.http.config.get.request", pluginId, projectId },
      responseType: "plugin.http.config.get.response",
    });
  }

  async savePluginHttpConfig(config: Omit<PluginHttpProjectConfig, "updatedAt">) {
    return this.request({
      message: { type: "plugin.http.config.save.request", config },
      responseType: "plugin.http.config.save.response",
    });
  }

  async deletePluginHttpJobs(processIds: string[]) {
    return this.request({
      message: { type: "plugin.http.job.delete_many.request", processIds },
      responseType: "plugin.http.job.delete_many.response",
    });
  }

  async cleanupPluginHttpJobs(pluginId: string, projectId: string) {
    return this.request({
      message: { type: "plugin.http.job.cleanup.request", pluginId, projectId },
      responseType: "plugin.http.job.cleanup.response",
    });
  }

  getLarkChannelStatus(options?: LarkChannelRequestOptions) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "channel.lark.get_status.request" },
      responseType: "channel.lark.get_status.response",
    });
  }

  applyLarkBot(options: ApplyLarkBotOptions = {}) {
    return this.request({
      requestId: options.requestId,
      message: { type: "channel.lark.apply_bot.request", name: options.name },
      responseType: "channel.lark.apply_bot.response",
    });
  }

  getLarkBotApplication(options: GetLarkBotApplicationOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.get_bot_application.request",
        applicationId: options.applicationId,
      },
      responseType: "channel.lark.get_bot_application.response",
    });
  }

  configureLarkChannel(options: ConfigureLarkChannelOptions) {
    const { requestId, ...messageOptions } = options;
    return this.request({
      requestId,
      message: { type: "channel.lark.configure.request", ...messageOptions },
      responseType: "channel.lark.configure.response",
    });
  }

  testLarkChannel(options?: LarkChannelRequestOptions) {
    return this.request({
      requestId: options?.requestId,
      message: { type: "channel.lark.test_connection.request", botId: options?.botId },
      responseType: "channel.lark.test_connection.response",
    });
  }

  deleteLarkChannelBot(options: DeleteLarkBotOptions) {
    return this.request({
      requestId: options.requestId,
      message: { type: "channel.lark.delete_bot.request", botId: options.botId },
      responseType: "channel.lark.delete_bot.response",
    });
  }

  setLarkChannelEnabled(options: SetLarkChannelEnabledOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.set_enabled.request",
        botId: options.botId,
        enabled: options.enabled,
      },
      responseType: "channel.lark.set_enabled.response",
    });
  }

  approveLarkPairing(options: ApproveLarkPairingOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.approve_pairing.request",
        botId: options.botId,
        code: options.code,
      },
      responseType: "channel.lark.approve_pairing.response",
    });
  }

  rejectLarkPairing(options: RejectLarkPairingOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.reject_pairing.request",
        botId: options.botId,
        code: options.code,
      },
      responseType: "channel.lark.reject_pairing.response",
    });
  }

  revokeLarkUser(options: RevokeLarkUserOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.revoke_user.request",
        botId: options.botId,
        userId: options.userId,
      },
      responseType: "channel.lark.revoke_user.response",
    });
  }

  resolveLarkDirectoryUsers(options: ResolveLarkDirectoryUsersOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.directory.resolve_users.request",
        appId: options.appId,
        emails: options.emails,
      },
      responseType: "channel.lark.directory.resolve_users.response",
    });
  }

  resolveLarkDirectoryChats(options: ResolveLarkDirectoryChatsOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.directory.resolve_chats.request",
        appId: options.appId,
        query: options.query,
      },
      responseType: "channel.lark.directory.resolve_chats.response",
    });
  }

  listLarkReminders(requestId?: string) {
    return this.request({
      requestId,
      message: { type: "channel.lark.reminder.list.request" },
      responseType: "channel.lark.reminder.list.response",
    });
  }

  createLarkReminder(options: CreateLarkReminderOptions) {
    const { requestId, ...reminder } = options;
    return this.request({
      requestId,
      message: { type: "channel.lark.reminder.create.request", ...reminder },
      responseType: "channel.lark.reminder.create.response",
    });
  }

  setLarkReminderEnabled(options: SetLarkReminderEnabledOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.reminder.set_enabled.request",
        reminderId: options.reminderId,
        enabled: options.enabled,
      },
      responseType: "channel.lark.reminder.set_enabled.response",
    });
  }

  deleteLarkReminder(options: DeleteLarkReminderOptions) {
    return this.request({
      requestId: options.requestId,
      message: {
        type: "channel.lark.reminder.delete.request",
        reminderId: options.reminderId,
      },
      responseType: "channel.lark.reminder.delete.response",
    });
  }
}
