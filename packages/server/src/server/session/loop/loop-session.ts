import type pino from "pino";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type { LoopService } from "../../loop-service.js";

export interface LoopSessionOptions {
  host: {
    emit(msg: SessionOutboundMessage): void;
  };
  loopService: LoopService;
  logger: pino.Logger;
}

export class LoopSession {
  private readonly host: LoopSessionOptions["host"];
  private readonly loopService: LoopService;
  private readonly logger: pino.Logger;

  constructor(options: LoopSessionOptions) {
    this.host = options.host;
    this.loopService = options.loopService;
    this.logger = options.logger;
  }

  private emitRpcError(
    request: Extract<
      SessionInboundMessage,
      { type: "loop/run" | "loop/list" | "loop/inspect" | "loop/logs" | "loop/stop" }
    >,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error({ err: error, requestType: request.type }, "Loop request failed");
    this.host.emit({
      type: "rpc_error",
      payload: {
        requestId: request.requestId,
        requestType: request.type,
        error: message,
        code: "loop_request_failed",
      },
    });
  }

  async handleRunRequest(
    request: Extract<SessionInboundMessage, { type: "loop/run" }>,
  ): Promise<void> {
    try {
      const loop = await this.loopService.runLoop({
        prompt: request.prompt,
        cwd: request.cwd,
        provider: request.provider,
        model: request.model,
        modeId: request.modeId,
        workerProvider: request.workerProvider,
        workerModel: request.workerModel,
        verifierProvider: request.verifierProvider,
        verifierModel: request.verifierModel,
        verifierModeId: request.verifierModeId,
        verifyPrompt: request.verifyPrompt,
        verifyChecks: request.verifyChecks,
        archive: request.archive,
        name: request.name,
        sleepMs: request.sleepMs,
        maxIterations: request.maxIterations,
        maxTimeMs: request.maxTimeMs,
      });
      this.host.emit({
        type: "loop/run/response",
        payload: { requestId: request.requestId, loop, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleListRequest(
    request: Extract<SessionInboundMessage, { type: "loop/list" }>,
  ): Promise<void> {
    try {
      const loops = await this.loopService.listLoops();
      this.host.emit({
        type: "loop/list/response",
        payload: { requestId: request.requestId, loops, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleInspectRequest(
    request: Extract<SessionInboundMessage, { type: "loop/inspect" }>,
  ): Promise<void> {
    try {
      const loop = await this.loopService.inspectLoop(request.id);
      this.host.emit({
        type: "loop/inspect/response",
        payload: { requestId: request.requestId, loop, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleLogsRequest(
    request: Extract<SessionInboundMessage, { type: "loop/logs" }>,
  ): Promise<void> {
    try {
      const result = await this.loopService.getLoopLogs(request.id, request.afterSeq ?? 0);
      this.host.emit({
        type: "loop/logs/response",
        payload: {
          requestId: request.requestId,
          loop: result.loop,
          entries: result.entries,
          nextCursor: result.nextCursor,
          error: null,
        },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }

  async handleStopRequest(
    request: Extract<SessionInboundMessage, { type: "loop/stop" }>,
  ): Promise<void> {
    try {
      const loop = await this.loopService.stopLoop(request.id);
      this.host.emit({
        type: "loop/stop/response",
        payload: { requestId: request.requestId, loop, error: null },
      });
    } catch (error) {
      this.emitRpcError(request, error);
    }
  }
}
