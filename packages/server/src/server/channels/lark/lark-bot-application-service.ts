import { randomUUID } from "node:crypto";
import { registerApp } from "@larksuiteoapi/node-sdk";
import type { LarkBotApplication } from "@getpaseo/protocol/channel/lark/rpc-schemas";
import type pino from "pino";
import {
  buildLarkBotApplicationAddons,
  buildLarkBotApplicationRequirements,
} from "./lark-bot-capability-requirements.js";
import { invalidateLarkClientTokens } from "./lark-client-token-cache.js";
import type { LarkChannelService } from "./lark-channel-service.js";

const APPLICATION_TTL_MS = 30 * 60 * 1000;

interface MutableApplication extends LarkBotApplication {
  createdAtMs: number;
}

interface LarkBotApplicationInput {
  name?: string;
  appId?: string;
  botId?: string;
}

export interface LarkAppRegistrar {
  register(options: {
    addons: {
      scopes: { tenant: string[]; user: string[] };
      events: { items: { tenant: string[] } };
      callbacks: { items: string[] };
    };
    appId?: string;
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
      ...(options.appId ? { appId: options.appId } : {}),
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

  start(input: string | LarkBotApplicationInput = {}): LarkBotApplication {
    this.cleanup();
    const options = typeof input === "string" ? { name: input } : input;
    const id = randomUUID();
    const requirements = buildLarkBotApplicationRequirements();
    const updating = Boolean(options.appId);
    const application: MutableApplication = {
      id,
      status: "starting",
      qrUrl: null,
      expiresAt: null,
      message: updating ? "正在生成机器人权限更新链接…" : "正在向飞书申请机器人…",
      error: null,
      botId: options.botId ?? null,
      appId: options.appId ?? null,
      domain: null,
      requirements,
      createdAtMs: Date.now(),
    };
    this.applications.set(id, application);
    void this.run(application, {
      name: options.name?.trim() || undefined,
      appId: options.appId?.trim() || undefined,
      botId: options.botId?.trim() || undefined,
    });
    return publicSnapshot(application);
  }

  get(id: string): LarkBotApplication | null {
    this.cleanup();
    const application = this.applications.get(id);
    return application ? publicSnapshot(application) : null;
  }

  private async run(
    application: MutableApplication,
    input: LarkBotApplicationInput,
  ): Promise<void> {
    try {
      const requirements = application.requirements ?? buildLarkBotApplicationRequirements();
      const result = await this.registrar.register({
        addons: buildLarkBotApplicationAddons(requirements),
        ...(input.appId ? { appId: input.appId } : {}),
        createOnly: !input.appId,
        onQRCodeReady: ({ url, expireIn }) => {
          application.status = "waiting_for_scan";
          application.qrUrl = url;
          application.expiresAt = new Date(Date.now() + expireIn * 1000).toISOString();
          application.message = input.appId
            ? "请打开链接并确认新增的机器人权限"
            : "请使用飞书 App 扫码确认权限、事件订阅和回调白名单";
        },
        onStatusChange: ({ status, interval }) => {
          if (status === "domain_switched") {
            application.message = "已识别为 Lark 国际版租户，正在继续申请…";
          } else if (status === "slow_down") {
            application.message = `飞书处理中，${interval ?? 1} 秒后继续检查…`;
          }
        },
      });
      if (!result.client_id || (!input.appId && !result.client_secret)) {
        throw new Error("飞书没有返回 App ID 或 App Secret");
      }

      application.status = "registering";
      application.qrUrl = null;
      application.expiresAt = null;
      application.appId = result.client_id;
      application.domain = result.user_info?.tenant_brand === "lark" ? "lark" : "feishu";
      if (input.appId) {
        this.completePermissionUpdate(application, input);
        return;
      }
      await this.completeNewApplication(application, input, result.client_secret!);
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

  private completePermissionUpdate(
    application: MutableApplication,
    input: LarkBotApplicationInput,
  ): void {
    invalidateLarkClientTokens(application.appId ?? input.appId ?? "");
    application.status = "completed";
    application.botId = input.botId ?? null;
    application.message = "机器人权限配置已提交，将在重新执行任务时验证是否生效";
    application.error = null;
  }

  private async completeNewApplication(
    application: MutableApplication,
    input: LarkBotApplicationInput,
    appSecret: string,
  ): Promise<void> {
    application.message = "申请成功，正在启动群消息长连接监听…";
    let status = await this.channelService.configure({
      createNew: true,
      ...(input.name ? { name: input.name } : {}),
      appId: application.appId!,
      appSecret,
      domain: application.domain!,
    });
    let bot =
      status.bots.find((entry) => entry.id === status.activeBotId) ?? status.bots.at(-1) ?? null;
    if (!bot) throw new Error("机器人已申请，但 Paseo 未能保存机器人配置");
    if (bot.connectionStatus === "error") {
      throw new Error(bot.error || "机器人已申请，但群消息长连接启动失败");
    }
    if (!input.name) {
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
    application.message = "机器人申请完成，权限与回调白名单已申请，群消息监听已开启";
    application.error = null;
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
