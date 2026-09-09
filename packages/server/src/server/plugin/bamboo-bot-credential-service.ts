import {
  BAMBOO_TROUBLESHOOTER_APP_ID,
  BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
  BambooTroubleshooterConfigSchema,
} from "@getpaseo/protocol/messages";
import type { BambooBotCredentialStore } from "./bamboo-bot-credential-store.js";

export const BAMBOO_BOT_APP_SECRET_CREDENTIAL_KEY = "bambooBotAppSecret";

export class BambooBotCredentialService {
  constructor(private readonly store: BambooBotCredentialStore) {}

  configure(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    data?: Record<string, unknown>;
    credentials?: Record<string, string>;
  }): Record<string, unknown> | undefined {
    const isBamboo =
      input.pluginId === BAMBOO_TROUBLESHOOTER_PLUGIN_ID &&
      input.appId === BAMBOO_TROUBLESHOOTER_APP_ID;
    if (!isBamboo) {
      if (input.credentials && Object.keys(input.credentials).length > 0) {
        throw new Error("该插件不支持保存专用凭证");
      }
      return input.data;
    }
    const rawConfig = input.data?.[BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY];
    if (rawConfig === undefined) return input.data;
    const config = BambooTroubleshooterConfigSchema.parse(rawConfig);
    if (config.bot.kind === "existing") {
      this.store.delete(input.projectId);
      return input.data;
    }
    if (config.bot.credentialId !== input.projectId) {
      throw new Error("Bamboo 专用机器人凭证必须绑定当前 Project");
    }
    const credential = this.store.configure({
      credentialId: config.bot.credentialId,
      appId: config.bot.appId,
      appSecret: input.credentials?.[BAMBOO_BOT_APP_SECRET_CREDENTIAL_KEY],
    });
    return {
      ...input.data,
      [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: {
        ...config,
        bot: {
          ...config.bot,
          appId: credential.appId,
          hasAppSecret: true,
        },
      },
    };
  }

  delete(input: { pluginId: string; appId: string; projectId: string }): void {
    if (
      input.pluginId === BAMBOO_TROUBLESHOOTER_PLUGIN_ID &&
      input.appId === BAMBOO_TROUBLESHOOTER_APP_ID
    ) {
      this.store.delete(input.projectId);
    }
  }
}
