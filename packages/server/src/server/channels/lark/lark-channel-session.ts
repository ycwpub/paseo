import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type pino from "pino";
import { LarkChannelService } from "./lark-channel-service.js";
import { LarkBotApplicationService } from "./lark-bot-application-service.js";
import {
  emitLarkSubstituteSessionError,
  handleLarkSubstituteSessionRequest,
  isLarkSubstituteSessionRequest,
} from "./lark-substitute-session-handler.js";
import {
  emitLarkSubstituteTaskSessionError,
  handleLarkSubstituteTaskSessionRequest,
  isLarkSubstituteTaskSessionRequest,
} from "./lark-substitute-task-session-handler.js";

export type LarkChannelSessionRequest = Extract<
  SessionInboundMessage,
  { type: `channel.lark.${string}.request` }
>;

export function isLarkChannelSessionRequest(
  message: SessionInboundMessage,
): message is LarkChannelSessionRequest {
  return message.type.startsWith("channel.lark.") && message.type.endsWith(".request");
}

type LarkChannelResponse = Extract<
  SessionOutboundMessage,
  {
    type:
      | "channel.lark.get_status.response"
      | "channel.lark.apply_bot.response"
      | "channel.lark.get_bot_application.response"
      | "channel.lark.configure.response"
      | "channel.lark.delete_bot.response"
      | "channel.lark.test_connection.response"
      | "channel.lark.set_enabled.response"
      | "channel.lark.approve_pairing.response"
      | "channel.lark.reject_pairing.response"
      | "channel.lark.revoke_user.response"
      | "channel.lark.directory.resolve_user.response"
      | "channel.lark.directory.resolve_users.response"
      | "channel.lark.directory.resolve_chats.response"
      | "channel.lark.directory.update_user.response"
      | "channel.lark.directory.scan_private_users.response"
      | "channel.lark.directory.add_private_user.response"
      | "channel.lark.user_oauth.get_status.response"
      | "channel.lark.user_oauth.start.response"
      | "channel.lark.user_oauth.complete.response"
      | "channel.lark.user_oauth.disconnect.response"
      | "channel.lark.reminder.list.response"
      | "channel.lark.reminder.create.response"
      | "channel.lark.reminder.update.response"
      | "channel.lark.reminder.set_enabled.response"
      | "channel.lark.reminder.delete.response"
      | "channel.lark.substitute.list.response"
      | "channel.lark.substitute.create.response"
      | "channel.lark.substitute.update.response"
      | "channel.lark.substitute.set_enabled.response"
      | "channel.lark.substitute.delete.response"
      | "channel.lark.substitute_task.list.response"
      | "channel.lark.substitute_task.scan.response"
      | "channel.lark.substitute_task.pause.response"
      | "channel.lark.substitute_task.delete.response";
  }
>;

type LarkDirectoryOrOAuthRequest = Extract<
  LarkChannelSessionRequest,
  {
    type:
      | "channel.lark.directory.resolve_user.request"
      | "channel.lark.directory.resolve_users.request"
      | "channel.lark.directory.resolve_chats.request"
      | "channel.lark.directory.update_user.request"
      | "channel.lark.directory.scan_private_users.request"
      | "channel.lark.directory.add_private_user.request"
      | "channel.lark.user_oauth.get_status.request"
      | "channel.lark.user_oauth.start.request"
      | "channel.lark.user_oauth.complete.request"
      | "channel.lark.user_oauth.disconnect.request";
  }
>;

type LarkUserOAuthRequest = Extract<
  LarkDirectoryOrOAuthRequest,
  { type: `channel.lark.user_oauth.${string}` }
>;

type LarkDirectoryRequest = Extract<
  LarkDirectoryOrOAuthRequest,
  { type: `channel.lark.directory.${string}` }
>;

function isDirectoryOrOAuthRequest(
  message: LarkChannelSessionRequest,
): message is LarkDirectoryOrOAuthRequest {
  return (
    message.type === "channel.lark.directory.resolve_user.request" ||
    message.type === "channel.lark.directory.resolve_users.request" ||
    message.type === "channel.lark.directory.resolve_chats.request" ||
    message.type === "channel.lark.directory.update_user.request" ||
    message.type === "channel.lark.directory.scan_private_users.request" ||
    message.type === "channel.lark.directory.add_private_user.request" ||
    message.type.startsWith("channel.lark.user_oauth.")
  );
}

function isUserOAuthRequest(message: LarkChannelSessionRequest): message is LarkUserOAuthRequest {
  return message.type.startsWith("channel.lark.user_oauth.");
}

function isDirectoryRequest(message: LarkChannelSessionRequest): message is LarkDirectoryRequest {
  return message.type.startsWith("channel.lark.directory.");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getReminderDeleteError(ok: boolean): string | null {
  return ok ? null : "Lark reminder not found";
}

export interface LarkChannelSessionHost {
  emit(message: SessionOutboundMessage): void;
}

export class LarkChannelSession {
  private readonly host: LarkChannelSessionHost;
  private readonly service: LarkChannelService;
  private readonly logger: pino.Logger;
  private readonly applicationService: LarkBotApplicationService;

  constructor(options: {
    host: LarkChannelSessionHost;
    service: LarkChannelService;
    logger: pino.Logger;
  }) {
    this.host = options.host;
    this.service = options.service;
    this.applicationService = new LarkBotApplicationService({
      channelService: options.service,
      logger: options.logger,
    });
    this.logger = options.logger.child({ module: "lark-channel-session" });
  }

  async handleRequest(message: LarkChannelSessionRequest): Promise<void> {
    try {
      if (isDirectoryOrOAuthRequest(message)) {
        await this.handleDirectoryOrOAuthRequest(message);
        return;
      }
      if (isLarkSubstituteSessionRequest(message)) {
        handleLarkSubstituteSessionRequest(message, this.service, (response) =>
          this.emitResponse(response),
        );
        return;
      }
      if (isLarkSubstituteTaskSessionRequest(message)) {
        await handleLarkSubstituteTaskSessionRequest(message, this.service, (response) =>
          this.emitResponse(response),
        );
        return;
      }
      switch (message.type) {
        case "channel.lark.get_status.request":
          this.emitResponse({
            type: "channel.lark.get_status.response",
            payload: {
              requestId: message.requestId,
              status: this.service.getStatus(),
              error: null,
            },
          });
          return;
        case "channel.lark.apply_bot.request":
          this.emitResponse({
            type: "channel.lark.apply_bot.response",
            payload: {
              requestId: message.requestId,
              application: this.applicationService.start(message.name),
              error: null,
            },
          });
          return;
        case "channel.lark.get_bot_application.request":
          this.emitResponse({
            type: "channel.lark.get_bot_application.response",
            payload: {
              requestId: message.requestId,
              application: this.applicationService.get(message.applicationId),
              error: null,
            },
          });
          return;
        case "channel.lark.configure.request":
          this.emitResponse({
            type: "channel.lark.configure.response",
            payload: {
              requestId: message.requestId,
              status: await this.service.configure({
                appId: message.appId,
                botId: message.botId,
                name: message.name,
                createNew: message.createNew,
                appSecret: message.appSecret,
                encryptKey: message.encryptKey,
                verificationToken: message.verificationToken,
                clearEncryptKey: message.clearEncryptKey,
                clearVerificationToken: message.clearVerificationToken,
                domain: message.domain,
                target: message.target,
                substitute: message.substitute,
              }),
              error: null,
            },
          });
          return;
        case "channel.lark.delete_bot.request":
          this.emitResponse({
            type: "channel.lark.delete_bot.response",
            payload: {
              requestId: message.requestId,
              status: await this.service.deleteBot(message.botId),
              error: null,
            },
          });
          return;
        case "channel.lark.test_connection.request":
          this.emitResponse({
            type: "channel.lark.test_connection.response",
            payload: {
              requestId: message.requestId,
              status: await this.service.testConnection(message.botId),
              error: null,
            },
          });
          return;
        case "channel.lark.set_enabled.request":
          this.emitResponse({
            type: "channel.lark.set_enabled.response",
            payload: {
              requestId: message.requestId,
              status: await this.service.setEnabled(message.enabled, message.botId),
              error: null,
            },
          });
          return;
        case "channel.lark.approve_pairing.request":
          this.emitResponse({
            type: "channel.lark.approve_pairing.response",
            payload: {
              requestId: message.requestId,
              status: this.service.approvePairing(message.code, message.botId),
              error: null,
            },
          });
          return;
        case "channel.lark.reject_pairing.request":
          this.emitResponse({
            type: "channel.lark.reject_pairing.response",
            payload: {
              requestId: message.requestId,
              status: this.service.rejectPairing(message.code, message.botId),
              error: null,
            },
          });
          return;
        case "channel.lark.revoke_user.request":
          this.emitResponse({
            type: "channel.lark.revoke_user.response",
            payload: {
              requestId: message.requestId,
              status: this.service.revokeUser(message.userId, message.botId),
              error: null,
            },
          });
          return;
        case "channel.lark.reminder.list.request":
          this.emitResponse({
            type: "channel.lark.reminder.list.response",
            payload: {
              requestId: message.requestId,
              reminders: this.service.listReminders(),
              error: null,
            },
          });
          return;
        case "channel.lark.reminder.create.request": {
          const reminder = this.service.createReminder({
            name: message.name,
            botId: message.botId,
            chatId: message.chatId,
            targetOpenIds: message.targetOpenIds,
            message: message.message,
            frequencySeconds: message.frequencySeconds,
            sender: message.sender,
            enabled: message.enabled,
          });
          this.emitResponse({
            type: "channel.lark.reminder.create.response",
            payload: {
              requestId: message.requestId,
              reminder,
              reminders: this.service.listReminders(),
              error: null,
            },
          });
          return;
        }
        case "channel.lark.reminder.update.request": {
          const reminder = this.service.updateReminder(message.reminderId, {
            name: message.name,
            botId: message.botId,
            chatId: message.chatId,
            targetOpenIds: message.targetOpenIds,
            message: message.message,
            frequencySeconds: message.frequencySeconds,
            sender: message.sender,
          });
          this.emitResponse({
            type: "channel.lark.reminder.update.response",
            payload: {
              requestId: message.requestId,
              reminder,
              reminders: this.service.listReminders(),
              error: null,
            },
          });
          return;
        }
        case "channel.lark.reminder.set_enabled.request": {
          const reminder = this.service.setReminderEnabled(message.reminderId, message.enabled);
          this.emitResponse({
            type: "channel.lark.reminder.set_enabled.response",
            payload: {
              requestId: message.requestId,
              reminder,
              reminders: this.service.listReminders(),
              error: null,
            },
          });
          return;
        }
        case "channel.lark.reminder.delete.request": {
          const ok = this.service.deleteReminder(message.reminderId);
          this.emitResponse({
            type: "channel.lark.reminder.delete.response",
            payload: {
              requestId: message.requestId,
              reminderId: message.reminderId,
              ok,
              reminders: this.service.listReminders(),
              error: getReminderDeleteError(ok),
            },
          });
          return;
        }
      }
    } catch (error) {
      this.logger.warn({ err: error, requestType: message.type }, "Lark channel RPC failed");
      this.emitErrorResponse(message, getErrorMessage(error));
    }
  }

  private async handleDirectoryOrOAuthRequest(message: LarkDirectoryOrOAuthRequest): Promise<void> {
    switch (message.type) {
      case "channel.lark.directory.resolve_user.request": {
        const user = await this.service.resolveDirectoryUser(message.appId, message.openId);
        this.emitResponse({
          type: "channel.lark.directory.resolve_user.response",
          payload: {
            requestId: message.requestId,
            user,
            status: this.service.getStatus(),
            error: null,
          },
        });
        return;
      }
      case "channel.lark.directory.resolve_users.request": {
        const users = await this.service.resolveDirectoryUsers(message.appId, message.emails);
        this.emitResponse({
          type: "channel.lark.directory.resolve_users.response",
          payload: {
            requestId: message.requestId,
            users,
            status: this.service.getStatus(),
            error: null,
          },
        });
        return;
      }
      case "channel.lark.directory.resolve_chats.request": {
        const chats = await this.service.resolveDirectoryChats(message.appId, message.query);
        this.emitResponse({
          type: "channel.lark.directory.resolve_chats.response",
          payload: {
            requestId: message.requestId,
            chats,
            status: this.service.getStatus(),
            error: null,
          },
        });
        return;
      }
      case "channel.lark.directory.update_user.request": {
        const user = this.service.updateDirectoryUser(message.appId, message.openId, {
          displayName: message.displayName,
          email: message.email,
        });
        this.emitResponse({
          type: "channel.lark.directory.update_user.response",
          payload: {
            requestId: message.requestId,
            user,
            status: this.service.getStatus(),
            error: null,
          },
        });
        return;
      }
      case "channel.lark.directory.scan_private_users.request": {
        const users = await this.service.scanRecentDirectoryPrivateUsers(
          message.appId,
          message.lookbackMinutes,
        );
        this.emitResponse({
          type: "channel.lark.directory.scan_private_users.response",
          payload: {
            requestId: message.requestId,
            users,
            error: null,
          },
        });
        return;
      }
      case "channel.lark.directory.add_private_user.request": {
        const user = await this.service.addRecentDirectoryPrivateUser(message.appId, {
          openId: message.openId,
          displayName: message.displayName,
          firstMessageContent: message.firstMessageContent,
          firstMessageAt: message.firstMessageAt,
        });
        this.emitResponse({
          type: "channel.lark.directory.add_private_user.response",
          payload: {
            requestId: message.requestId,
            user,
            status: this.service.getStatus(),
            error: null,
          },
        });
        return;
      }
      case "channel.lark.user_oauth.get_status.request":
        this.emitResponse({
          type: "channel.lark.user_oauth.get_status.response",
          payload: {
            requestId: message.requestId,
            status: await this.service.getUserOAuthStatus(message.appId),
            error: null,
          },
        });
        return;
      case "channel.lark.user_oauth.start.request": {
        const authorization = this.service.startUserOAuth(message.appId, message.redirectUri);
        this.emitResponse({
          type: "channel.lark.user_oauth.start.response",
          payload: {
            requestId: message.requestId,
            authorizationUrl: authorization.authorizationUrl,
            state: authorization.state,
            error: null,
          },
        });
        return;
      }
      case "channel.lark.user_oauth.complete.request":
        this.emitResponse({
          type: "channel.lark.user_oauth.complete.response",
          payload: {
            requestId: message.requestId,
            status: await this.service.completeUserOAuth(
              message.appId,
              message.codeOrCallbackUrl,
              message.state,
            ),
            error: null,
          },
        });
        return;
      case "channel.lark.user_oauth.disconnect.request":
        this.emitResponse({
          type: "channel.lark.user_oauth.disconnect.response",
          payload: {
            requestId: message.requestId,
            status: this.service.disconnectUserOAuth(message.appId),
            error: null,
          },
        });
        return;
    }
  }

  private emitResponse(message: LarkChannelResponse): void {
    this.host.emit(message);
  }

  private emitErrorResponse(message: LarkChannelSessionRequest, error: string): void {
    if (isUserOAuthRequest(message)) {
      this.emitUserOAuthErrorResponse(message, error);
      return;
    }
    if (isDirectoryRequest(message)) {
      this.emitDirectoryErrorResponse(message, error);
      return;
    }
    if (isLarkSubstituteSessionRequest(message)) {
      emitLarkSubstituteSessionError(
        message,
        this.service,
        (response) => this.emitResponse(response),
        error,
      );
      return;
    }
    if (isLarkSubstituteTaskSessionRequest(message)) {
      emitLarkSubstituteTaskSessionError(
        message,
        this.service,
        (response) => this.emitResponse(response),
        error,
      );
      return;
    }
    const payload = {
      requestId: message.requestId,
      status: this.service.getStatus(),
      error,
    };
    switch (message.type) {
      case "channel.lark.get_status.request":
        this.emitResponse({ type: "channel.lark.get_status.response", payload });
        return;
      case "channel.lark.apply_bot.request":
        this.emitResponse({
          type: "channel.lark.apply_bot.response",
          payload: { requestId: message.requestId, application: null, error },
        });
        return;
      case "channel.lark.get_bot_application.request":
        this.emitResponse({
          type: "channel.lark.get_bot_application.response",
          payload: { requestId: message.requestId, application: null, error },
        });
        return;
      case "channel.lark.configure.request":
        this.emitResponse({ type: "channel.lark.configure.response", payload });
        return;
      case "channel.lark.delete_bot.request":
        this.emitResponse({ type: "channel.lark.delete_bot.response", payload });
        return;
      case "channel.lark.test_connection.request":
        this.emitResponse({ type: "channel.lark.test_connection.response", payload });
        return;
      case "channel.lark.set_enabled.request":
        this.emitResponse({ type: "channel.lark.set_enabled.response", payload });
        return;
      case "channel.lark.approve_pairing.request":
        this.emitResponse({ type: "channel.lark.approve_pairing.response", payload });
        return;
      case "channel.lark.reject_pairing.request":
        this.emitResponse({ type: "channel.lark.reject_pairing.response", payload });
        return;
      case "channel.lark.revoke_user.request":
        this.emitResponse({ type: "channel.lark.revoke_user.response", payload });
        return;
      case "channel.lark.reminder.list.request":
        this.emitResponse({
          type: "channel.lark.reminder.list.response",
          payload: { requestId: message.requestId, reminders: this.service.listReminders(), error },
        });
        return;
      case "channel.lark.reminder.create.request":
        this.emitResponse({
          type: "channel.lark.reminder.create.response",
          payload: {
            requestId: message.requestId,
            reminder: null,
            reminders: this.service.listReminders(),
            error,
          },
        });
        return;
      case "channel.lark.reminder.update.request":
        this.emitResponse({
          type: "channel.lark.reminder.update.response",
          payload: {
            requestId: message.requestId,
            reminder: null,
            reminders: this.service.listReminders(),
            error,
          },
        });
        return;
      case "channel.lark.reminder.set_enabled.request":
        this.emitResponse({
          type: "channel.lark.reminder.set_enabled.response",
          payload: {
            requestId: message.requestId,
            reminder: null,
            reminders: this.service.listReminders(),
            error,
          },
        });
        return;
      case "channel.lark.reminder.delete.request":
        this.emitResponse({
          type: "channel.lark.reminder.delete.response",
          payload: {
            requestId: message.requestId,
            reminderId: message.reminderId,
            ok: false,
            reminders: this.service.listReminders(),
            error,
          },
        });
        return;
    }
  }

  private emitDirectoryErrorResponse(message: LarkDirectoryRequest, error: string): void {
    const status = this.service.getStatus();
    switch (message.type) {
      case "channel.lark.directory.resolve_user.request":
        this.emitResponse({
          type: "channel.lark.directory.resolve_user.response",
          payload: { requestId: message.requestId, user: null, status, error },
        });
        return;
      case "channel.lark.directory.resolve_users.request":
        this.emitResponse({
          type: "channel.lark.directory.resolve_users.response",
          payload: { requestId: message.requestId, users: [], status, error },
        });
        return;
      case "channel.lark.directory.resolve_chats.request":
        this.emitResponse({
          type: "channel.lark.directory.resolve_chats.response",
          payload: { requestId: message.requestId, chats: [], status, error },
        });
        return;
      case "channel.lark.directory.update_user.request":
        this.emitResponse({
          type: "channel.lark.directory.update_user.response",
          payload: { requestId: message.requestId, user: null, status, error },
        });
        return;
      case "channel.lark.directory.scan_private_users.request":
        this.emitResponse({
          type: "channel.lark.directory.scan_private_users.response",
          payload: { requestId: message.requestId, users: [], error },
        });
        return;
      case "channel.lark.directory.add_private_user.request":
        this.emitResponse({
          type: "channel.lark.directory.add_private_user.response",
          payload: { requestId: message.requestId, user: null, status, error },
        });
        return;
    }
  }

  private emitUserOAuthErrorResponse(message: LarkUserOAuthRequest, error: string): void {
    switch (message.type) {
      case "channel.lark.user_oauth.get_status.request":
        this.emitResponse({
          type: "channel.lark.user_oauth.get_status.response",
          payload: { requestId: message.requestId, status: null, error },
        });
        return;
      case "channel.lark.user_oauth.start.request":
        this.emitResponse({
          type: "channel.lark.user_oauth.start.response",
          payload: {
            requestId: message.requestId,
            authorizationUrl: null,
            state: null,
            error,
          },
        });
        return;
      case "channel.lark.user_oauth.complete.request":
        this.emitResponse({
          type: "channel.lark.user_oauth.complete.response",
          payload: { requestId: message.requestId, status: null, error },
        });
        return;
      case "channel.lark.user_oauth.disconnect.request":
        this.emitResponse({
          type: "channel.lark.user_oauth.disconnect.response",
          payload: { requestId: message.requestId, status: null, error },
        });
        return;
    }
  }
}
