import type pino from "pino";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type { WorkflowService } from "../../workflow/service.js";

export interface WorkflowSessionOptions {
  host: {
    emit(msg: SessionOutboundMessage): void;
  };
  workflowService?: WorkflowService | null;
  logger: pino.Logger;
}

export class WorkflowSession {
  private readonly host: WorkflowSessionOptions["host"];
  private readonly workflowService: WorkflowService | null;
  private readonly logger: pino.Logger;

  constructor(options: WorkflowSessionOptions) {
    this.host = options.host;
    this.workflowService = options.workflowService ?? null;
    this.logger = options.logger;
  }

  private emitRpcError(
    request: Extract<
      SessionInboundMessage,
      {
        type:
          | "workflow/list"
          | "workflow/inspect"
          | "workflow/run"
          | "workflow/get-run"
          | "workflow/cancel-run"
          | "workflow/save"
          | "workflow/delete";
      }
    >,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error({ err: error, requestType: request.type }, "Workflow request failed");
    this.host.emit({
      type: "rpc_error",
      payload: {
        requestId: request.requestId,
        requestType: request.type,
        error: message,
        code: "workflow_request_failed",
      },
    });
  }

  async handleListRequest(
    request: Extract<SessionInboundMessage, { type: "workflow/list" }>,
  ): Promise<void> {
    try {
      if (!this.workflowService) {
        throw new Error("Workflow service is not configured");
      }
      const scripts = await this.workflowService.listScripts();
      this.host.emit({
        type: "workflow/list/response",
        payload: { requestId: request.requestId, scripts, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleInspectRequest(
    request: Extract<SessionInboundMessage, { type: "workflow/inspect" }>,
  ): Promise<void> {
    try {
      if (!this.workflowService) {
        throw new Error("Workflow service is not configured");
      }
      const script = await this.workflowService.inspectScript(request.scriptPath);
      const latestRun = await this.workflowService.getLatestRunForScript(script.path);
      this.host.emit({
        type: "workflow/inspect/response",
        payload: { requestId: request.requestId, script, latestRun, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleRunRequest(
    request: Extract<SessionInboundMessage, { type: "workflow/run" }>,
  ): Promise<void> {
    try {
      if (!this.workflowService) {
        throw new Error("Workflow service is not configured");
      }
      const run = await this.workflowService.runScript({
        scriptPath: request.scriptPath,
        inputPayload: request.inputPayload,
        targetNodeId: request.targetNodeId,
      });
      this.host.emit({
        type: "workflow/run/response",
        payload: { requestId: request.requestId, run, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleGetRunRequest(
    request: Extract<SessionInboundMessage, { type: "workflow/get-run" }>,
  ): Promise<void> {
    try {
      if (!this.workflowService) {
        throw new Error("Workflow service is not configured");
      }
      const run = await this.workflowService.getRun(request.runId);
      this.host.emit({
        type: "workflow/get-run/response",
        payload: { requestId: request.requestId, run, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleCancelRunRequest(
    request: Extract<SessionInboundMessage, { type: "workflow/cancel-run" }>,
  ): Promise<void> {
    try {
      if (!this.workflowService) {
        throw new Error("Workflow service is not configured");
      }
      const run = await this.workflowService.cancelRun(request.runId);
      this.host.emit({
        type: "workflow/cancel-run/response",
        payload: { requestId: request.requestId, run, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleSaveRequest(
    request: Extract<SessionInboundMessage, { type: "workflow/save" }>,
  ): Promise<void> {
    try {
      if (!this.workflowService) {
        throw new Error("Workflow service is not configured");
      }
      const script = await this.workflowService.saveScript({
        scriptPath: request.scriptPath,
        fileName: request.fileName,
        script: request.script,
      });
      this.host.emit({
        type: "workflow/save/response",
        payload: { requestId: request.requestId, script, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleDeleteRequest(
    request: Extract<SessionInboundMessage, { type: "workflow/delete" }>,
  ): Promise<void> {
    try {
      if (!this.workflowService) {
        throw new Error("Workflow service is not configured");
      }
      await this.workflowService.deleteScript(request.scriptPath);
      this.host.emit({
        type: "workflow/delete/response",
        payload: { requestId: request.requestId, scriptPath: request.scriptPath, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }
}
