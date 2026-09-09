import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type {
  LarkChannelStore,
  StoredLarkChannelConfig,
} from "../channels/lark/lark-channel-store.js";
import type { BambooBotCredentialStore } from "./bamboo-bot-credential-store.js";

export interface ResolvedBambooBotCredential {
  identity: string;
  config: StoredLarkChannelConfig;
}

function customChannelConfig(appId: string, appSecret: string): StoredLarkChannelConfig {
  return {
    enabled: true,
    appId,
    appSecret,
    encryptKey: null,
    verificationToken: null,
    domain: "feishu",
    target: {
      kind: "workspace",
      provider: null,
      model: null,
      cwd: null,
      workspaceId: null,
    },
    substitute: {
      enabled: false,
      openId: null,
      name: null,
    },
  };
}

export class BambooBotCredentialResolver {
  constructor(
    private readonly channelStore: Pick<LarkChannelStore, "getBot">,
    private readonly customStore: BambooBotCredentialStore,
  ) {}

  resolve(config: AlertTroubleshooterConfig): ResolvedBambooBotCredential {
    if (config.bot.kind === "existing") {
      const bot = this.channelStore.getBot(config.bot.botId);
      if (!bot) throw new Error(`飞书机器人 ${config.bot.botId} 不存在`);
      return { identity: `existing:${config.bot.botId}`, config: bot.config };
    }
    const credential = this.customStore.get(config.bot.credentialId);
    if (!credential || credential.appId !== config.bot.appId) {
      throw new Error("Bamboo 专用飞书机器人凭证不存在或 App ID 已变更，请重新填写 App Secret");
    }
    return {
      identity: `custom:${config.bot.credentialId}:${credential.appId}`,
      config: customChannelConfig(credential.appId, credential.appSecret),
    };
  }

  commandEnvironment(
    config: AlertTroubleshooterConfig,
    base: NodeJS.ProcessEnv = process.env,
  ): NodeJS.ProcessEnv {
    const credential = this.resolve(config).config;
    const env = { ...base };
    delete env.LARKSUITE_CLI_APP_ID;
    delete env.LARKSUITE_CLI_APP_SECRET;
    delete env.LARKSUITE_CLI_BRAND;
    delete env.LARKSUITE_CLI_USER_ACCESS_TOKEN;
    delete env.LARKSUITE_CLI_TENANT_ACCESS_TOKEN;
    env.LARKSUITE_CLI_STRICT_MODE = "off";
    env.FEISHU_BOT_APP_ID = credential.appId ?? "";
    env.FEISHU_BOT_APP_SECRET = credential.appSecret ?? "";
    env.FEISHU_APP_ID = credential.appId ?? "";
    env.FEISHU_APP_SECRET = credential.appSecret ?? "";
    env.LARK_CLI_APP_ID = credential.appId ?? "";
    env.LARK_CLI_APP_SECRET = credential.appSecret ?? "";
    return env;
  }
}
