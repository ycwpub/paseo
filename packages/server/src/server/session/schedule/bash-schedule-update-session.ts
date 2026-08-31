import type pino from "pino";

import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type { ScheduleService } from "../../schedule/service.js";

interface BashScheduleUpdateSessionOptions {
  emit(message: SessionOutboundMessage): void;
  scheduleService: ScheduleService;
  logger: pino.Logger;
}

export class BashScheduleUpdateSession {
  constructor(private readonly options: BashScheduleUpdateSessionOptions) {}

  async handle(
    request: Extract<SessionInboundMessage, { type: "schedule/update" }>,
  ): Promise<void> {
    try {
      const schedule = await this.options.scheduleService.update({
        id: request.scheduleId,
        ...(request.name !== undefined ? { name: request.name } : {}),
        ...(request.prompt !== undefined ? { prompt: request.prompt } : {}),
        ...(request.cadence !== undefined ? { cadence: request.cadence } : {}),
        ...(request.newAgentConfig !== undefined ? { newAgentConfig: request.newAgentConfig } : {}),
        ...(request.bashConfig !== undefined ? { bashConfig: request.bashConfig } : {}),
        ...(request.maxRuns !== undefined ? { maxRuns: request.maxRuns } : {}),
        ...(request.expiresAt !== undefined ? { expiresAt: request.expiresAt } : {}),
      });
      this.options.emit({
        type: "schedule/update/response",
        payload: {
          requestId: request.requestId,
          schedule,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.error(
        { err: error, requestType: request.type },
        "Schedule request failed",
      );
      this.options.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: message,
          code: "schedule_request_failed",
        },
      });
    }
  }
}
