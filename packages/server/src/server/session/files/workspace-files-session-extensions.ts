import type pino from "pino";
import type { SessionOutboundMessage } from "../../messages.js";
import type { WorkspaceFilesSessionHost } from "./workspace-files-session.js";

const MISSING_PATH_ERROR_PATTERN = /\b(?:ENOENT|ENOTDIR)\b|no such file or directory/iu;

export function classifyFileExplorerErrorMessage(
  message: string | null | undefined,
): "not_found" | null {
  return message && MISSING_PATH_ERROR_PATTERN.test(message) ? "not_found" : null;
}

export function extendWorkspaceFilesSessionHost(
  host: WorkspaceFilesSessionHost,
): WorkspaceFilesSessionHost {
  return {
    ...host,
    emit(message, source) {
      host.emit(extendFileExplorerResponse(message), source);
    },
  };
}

export function createWorkspaceFilesSessionLogger(logger: pino.Logger): pino.Logger {
  return new Proxy(logger, {
    get(target, property, receiver) {
      if (property === "error") {
        return (bindings: unknown, message?: string) => {
          if (
            isMissingPathError(bindings) &&
            message?.startsWith("Failed to fulfill file explorer request")
          ) {
            target.debug(bindings, "File explorer path does not exist");
            return;
          }
          target.error(bindings, message);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function extendFileExplorerResponse(message: SessionOutboundMessage): SessionOutboundMessage {
  if (
    message.type !== "file_explorer_response" ||
    message.payload.error === null ||
    message.payload.errorCode !== undefined
  ) {
    return message;
  }
  const errorCode = classifyFileExplorerErrorMessage(message.payload.error);
  return errorCode
    ? {
        ...message,
        payload: {
          ...message.payload,
          errorCode,
        },
      }
    : message;
}

function isMissingPathError(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const error = "err" in value ? value.err : null;
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}
