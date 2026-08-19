import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type pino from "pino";
import { LarkChannelService } from "./lark-channel-service.js";
import { LarkBotApplicationService } from "./lark-bot-application-service.js";

export type LarkChannelSessionRequest = Extract<
  SessionInboundMessage,
  {
    type:
      | "channel.lark.get_status.request"
      | "channel.lark.apply_bot.request"
      | "channel.lark.get_bot_application.request"
      | "channel.lark.configure.request"
      | "channel.lark.delete_bot.request"
      | "channel.lark.test_connection.request"
      | "channel.lark.set_enabled.request"
      | "channel.lark.approve_pairing.request"
      | "channel.lark.reject_pairing.request"
      | "channel.lark.revoke_user.request"
      | "channel.lark.directory.resolve_users.request"
      | "channel.lark.directory.resolve_chats.request"
      | "channel.lark.reminder.list.request"
      | "channel.lark.reminder.create.request"
      | "channel.lark.reminder.set_enabled.request"
      | "channel.lark.reminder.delete.request";
  }
>;

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
      | "channel.lark.directory.resolve_users.response"
      | "channel.lark.directory.resolve_chats.response"
      | "channel.lark.reminder.list.response"
      | "channel.lark.reminder.create.response"
      | "channel.lark.reminder.set_enabled.response"
      | "channel.lark.reminder.delete.response";
  }
>;

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
              error: ok ? null : "Lark reminder not found",
            },
          });
          return;
        }
      }
    } catch (error) {
      this.logger.warn({ err: error, requestType: message.type }, "Lark channel RPC failed");
      this.emitErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private emitResponse(message: LarkChannelResponse): void {
    this.host.emit(message);
  }

  private emitErrorResponse(message: LarkChannelSessionRequest, error: string): void {
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
      case "channel.lark.directory.resolve_users.request":
        this.emitResponse({
          type: "channel.lark.directory.resolve_users.response",
          payload: {
            requestId: message.requestId,
            users: [],
            status: this.service.getStatus(),
            error,
          },
        });
        return;
      case "channel.lark.directory.resolve_chats.request":
        this.emitResponse({
          type: "channel.lark.directory.resolve_chats.response",
          payload: {
            requestId: message.requestId,
            chats: [],
            status: this.service.getStatus(),
            error,
          },
        });
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
}
