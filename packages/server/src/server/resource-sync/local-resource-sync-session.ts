import { getErrorMessage } from "@getpaseo/protocol/error-utils";
import type {
  LocalResourceApplyRequest,
  LocalResourceExportRequest,
} from "@getpaseo/protocol/resource-sync/rpc-schemas";
import type { SessionOutboundMessage } from "../messages.js";
import { applyLocalResource, exportLocalResource } from "./local-resource-sync-service.js";

export class LocalResourceSyncSession {
  constructor(private readonly emit: (message: SessionOutboundMessage) => void) {}

  async handleRequest(request: LocalResourceExportRequest | LocalResourceApplyRequest) {
    if (request.type === "resource_sync.local.export.request") {
      try {
        const snapshot = await exportLocalResource(request.path);
        this.emit({
          type: "resource_sync.local.export.response",
          payload: { requestId: request.requestId, snapshot, error: null },
        });
      } catch (error) {
        this.emit({
          type: "resource_sync.local.export.response",
          payload: { requestId: request.requestId, snapshot: null, error: getErrorMessage(error) },
        });
      }
      return;
    }

    try {
      const result = await applyLocalResource({
        targetPath: request.path,
        snapshot: request.snapshot,
        missingPolicy: request.missingPolicy,
        existingPolicy: request.existingPolicy,
        sourceLabel: request.sourceLabel,
      });
      this.emit({
        type: "resource_sync.local.apply.response",
        payload: { requestId: request.requestId, result, error: null },
      });
    } catch (error) {
      this.emit({
        type: "resource_sync.local.apply.response",
        payload: { requestId: request.requestId, result: null, error: getErrorMessage(error) },
      });
    }
  }
}
