import type {
  McpServer,
  McpServerCreateInput,
  McpServerUpdateInput,
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
  CreateAssistantOptions,
  DeleteAssistantOptions,
  DeleteLarkBotOptions,
  GetLarkBotApplicationOptions,
  LarkChannelRequestOptions,
  RejectLarkPairingOptions,
  RevokeLarkUserOptions,
  SetLarkChannelEnabledOptions,
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
}
