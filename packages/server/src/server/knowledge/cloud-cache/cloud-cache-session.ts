import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type { Logger } from "pino";
import type { CloudDocumentCacheService } from "./service.js";

type CloudCacheRequest = Extract<
  SessionInboundMessage,
  {
    type: "knowledge.cloud_document.cache.request" | "knowledge.cloud_document.get_status.request";
  }
>;

export class CloudDocumentCacheSession {
  constructor(
    private readonly options: {
      emit: (message: SessionOutboundMessage) => void;
      service: CloudDocumentCacheService;
      logger: Logger;
    },
  ) {}

  async handleRequest(message: CloudCacheRequest): Promise<void> {
    try {
      const target = {
        scope: message.scope,
        ...(message.projectId ? { projectId: message.projectId } : {}),
        source: message.source,
      };
      const resolved =
        message.type === "knowledge.cloud_document.cache.request"
          ? await this.options.service.resolve(target, { force: message.force === true })
          : null;
      const publicStatus =
        resolved === null
          ? await this.options.service.getStatus(target)
          : {
              source: resolved.source,
              cached: resolved.cached,
              cachedAt: resolved.cachedAt,
              checkedAt: resolved.checkedAt,
              localPath: resolved.localPath,
              stale: resolved.stale,
              error: resolved.error,
              authIssue: resolved.authIssue,
            };
      this.options.emit({
        type:
          message.type === "knowledge.cloud_document.cache.request"
            ? "knowledge.cloud_document.cache.response"
            : "knowledge.cloud_document.get_status.response",
        payload: {
          requestId: message.requestId,
          status: publicStatus,
          error: null,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.options.logger.warn(
        { err: error, requestType: message.type, source: message.source },
        "Cloud knowledge cache RPC failed",
      );
      this.options.emit({
        type:
          message.type === "knowledge.cloud_document.cache.request"
            ? "knowledge.cloud_document.cache.response"
            : "knowledge.cloud_document.get_status.response",
        payload: {
          requestId: message.requestId,
          status: null,
          error: errorMessage,
        },
      });
    }
  }
}
