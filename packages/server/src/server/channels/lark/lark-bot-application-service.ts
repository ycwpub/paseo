import { randomUUID } from "node:crypto";
import { registerApp } from "@larksuiteoapi/node-sdk";
import type { LarkBotApplication } from "@getpaseo/protocol/channel/lark/rpc-schemas";
import type pino from "pino";
import type { LarkChannelService } from "./lark-channel-service.js";

const APPLICATION_TTL_MS = 30 * 60 * 1000;
const REQUIRED_TENANT_SCOPES = [
  "im:message.group_msg",
  "im:message.group_at_msg.include_bot:readonly",
  "im:chat.members:read",
  "im:chat:read",
  "contact:user.id:readonly",
] as const;
const REQUIRED_USER_SCOPES = ["im:message.group_msg:get_as_user"] as const;
const REQUIRED_TENANT_EVENTS = ["im.message.receive_v1"] as const;

interface MutableApplication extends LarkBotApplication {
  createdAtMs: number;
}

export interface LarkAppRegistrar {
  register(options: {
    addons: {
      scopes: { tenant: string[]; user: string[] };
      events: { items: { tenant: string[] } };
    };
    createOnly: boolean;
    onQRCodeReady: (info: { url: string; expireIn: number }) => void;
    onStatusChange: (info: { status: string; interval?: number }) => void;
  }): Promise<{
    client_id?: string;
    client_secret?: string;
    user_info?: { tenant_brand?: string };
  }>;
}

const officialRegistrar: LarkAppRegistrar = {
  register: (options) =>
    registerApp({
      source: "paseo",
      addons: options.addons,
      createOnly: options.createOnly,
      onQRCodeReady: options.onQRCodeReady,
      onStatusChange: options.onStatusChange,
    }),
};

function publicSnapshot(application: MutableApplication): LarkBotApplication {
  const { createdAtMs: _createdAtMs, ...snapshot } = application;
  return snapshot;
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[A-Za-z0-9_=-]{24,}/g, "***");
}

export class LarkBotApplicationService {
  private readonly applications = new Map<string, MutableApplication>();
  private readonly channelService: LarkChannelService;
  private readonly registrar: LarkAppRegistrar;
  private readonly logger: pino.Logger;

  constructor(options: {
    channelService: LarkChannelService;
    logger: pino.Logger;
    registrar?: LarkAppRegistrar;
  }) {
    this.channelService = options.channelService;
    this.registrar = options.registrar ?? officialRegistrar;
    this.logger = options.logger.child({ module: "lark-bot-application-service" });
  }

  start(name?: string): LarkBotApplication {
    this.cleanup();
    const id = randomUUID();
    const application: MutableApplication = {
      id,
      status: "starting",
      qrUrl: null,
      expiresAt: null,
      message: "正在向飞书申请机器人…",
      error: null,
      botId: null,
      appId: null,
      domain: null,
      createdAtMs: Date.now(),
    };
    this.applications.set(id, application);
    void this.run(application, name?.trim() || undefined);
    return publicSnapshot(application);
  }

  get(id: string): LarkBotApplication | null {
    this.cleanup();
    const application = this.applications.get(id);
    return application ? publicSnapshot(application) : null;
  }

  private async run(application: MutableApplication, name?: string): Promise<void> {
    try {
      const result = await this.registrar.register({
        addons: {
          scopes: {
            tenant: [...REQUIRED_TENANT_SCOPES],
            user: [...REQUIRED_USER_SCOPES],
          },
          events: { items: { tenant: [...REQUIRED_TENANT_EVENTS] } },
        },
        createOnly: true,
        onQRCodeReady: ({ url, expireIn }) => {
          application.status = "waiting_for_scan";
          application.qrUrl = url;
          application.expiresAt = new Date(Date.now() + expireIn * 1000).toISOString();
          application.message = "请使用飞书 App 扫码确认申请并开通群消息权限";
        },
        onStatusChange: ({ status, interval }) => {
          if (status === "domain_switched") {
            application.message = "已识别为 Lark 国际版租户，正在继续申请…";
          } else if (status === "slow_down") {
            application.message = `飞书处理中，${interval ?? 1} 秒后继续检查…`;
          }
        },
      });
      if (!result.client_id || !result.client_secret) {
        throw new Error("飞书没有返回 App ID 或 App Secret");
      }

      application.status = "registering";
      application.qrUrl = null;
      application.expiresAt = null;
      application.appId = result.client_id;
      application.domain = result.user_info?.tenant_brand === "lark" ? "lark" : "feishu";
      application.message = "申请成功，正在启动群消息长连接监听…";

      let status = await this.channelService.configure({
        createNew: true,
        ...(name ? { name } : {}),
        appId: result.client_id,
        appSecret: result.client_secret,
        domain: application.domain,
      });
      let bot =
        status.bots.find((entry) => entry.id === status.activeBotId) ?? status.bots.at(-1) ?? null;
      if (!bot) {
        throw new Error("机器人已申请，但 Paseo 未能保存机器人配置");
      }
      if (bot.connectionStatus === "error") {
        throw new Error(bot.error || "机器人已申请，但群消息长连接启动失败");
      }
      if (!name) {
        status = await this.channelService.testConnection(bot.id);
        bot = status.bots.find((entry) => entry.id === bot?.id) ?? bot;
        const actualBotName = bot.bot?.name?.trim();
        if (actualBotName) {
          status = await this.channelService.configure({
            botId: bot.id,
            name: actualBotName,
          });
          bot = status.bots.find((entry) => entry.id === bot?.id) ?? bot;
        }
      }

      application.status = "completed";
      application.botId = bot.id;
      application.message = "机器人申请完成，已自动开启群消息监听";
      application.error = null;
    } catch (error) {
      const message = safeError(error);
      application.status = "failed";
      application.qrUrl = null;
      application.expiresAt = null;
      application.message = null;
      application.error = message;
      this.logger.warn(
        { applicationId: application.id, appId: application.appId, err: message },
        "Lark bot application failed",
      );
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - APPLICATION_TTL_MS;
    for (const [id, application] of this.applications) {
      if (application.createdAtMs < cutoff) {
        this.applications.delete(id);
      }
    }
  }
}
