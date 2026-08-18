import type {
  LarkDirectory,
  LarkDirectoryChat,
  LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import type { LarkChannelStore, StoredLarkChannelConfig } from "./lark-channel-store.js";
import type { LarkDirectoryStore } from "./lark-directory-store.js";

function uniqueEmails(emails: readonly string[]): string[] {
  return Array.from(
    new Set(emails.map((email) => email.trim().toLocaleLowerCase()).filter(Boolean)),
  );
}

export class LarkDirectoryService {
  constructor(
    private readonly channelStore: LarkChannelStore,
    private readonly store: LarkDirectoryStore,
    private readonly adapter: LarkChannelClientAdapter,
  ) {}

  getState(): LarkDirectory {
    return this.store.getState();
  }

  async resolveUsers(appId: string, emails: readonly string[]): Promise<LarkDirectoryUser[]> {
    const normalizedEmails = uniqueEmails(emails);
    if (normalizedEmails.length === 0) {
      throw new Error("At least one user email is required");
    }
    const config = this.requireConfig(appId);
    if (!this.adapter.resolveUsersByEmails) {
      throw new Error("This Paseo daemon does not support Lark user lookup");
    }
    const resolved = await this.adapter.resolveUsersByEmails(config, normalizedEmails);
    const byEmail = new Map(resolved.map((entry) => [entry.email.toLocaleLowerCase(), entry]));
    const missing = normalizedEmails.filter((email) => !byEmail.has(email));
    if (missing.length > 0) {
      throw new Error(`No visible Lark user found for: ${missing.join(", ")}`);
    }
    return this.store.upsertResolvedUsers(appId, resolved, new Date().toISOString());
  }

  async resolveChats(appId: string, query: string): Promise<LarkDirectoryChat[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new Error("A Lark group name or group ID is required");
    }
    const config = this.requireConfig(appId);
    if (!this.adapter.resolveChats) {
      throw new Error("This Paseo daemon does not support Lark group lookup");
    }
    const resolved = await this.adapter.resolveChats(config, normalizedQuery);
    if (resolved.length === 0) {
      throw new Error(`No visible Lark group found for: ${normalizedQuery}`);
    }
    return this.store.upsertChats(appId, resolved, new Date().toISOString());
  }

  observeUser(appId: string, openId: string, displayName?: string | null): void {
    this.store.observeUser(appId, { openId, displayName }, new Date().toISOString());
  }

  observeChat(appId: string, chatId: string, name: string): void {
    this.store.upsertChats(appId, [{ groupId: chatId, chatId, name }], new Date().toISOString());
  }

  private requireConfig(appId: string): StoredLarkChannelConfig {
    const bot = this.channelStore.getBots().find((entry) => entry.config.appId === appId);
    if (!bot) {
      throw new Error(`Lark bot App ID is not configured: ${appId}`);
    }
    if (!bot.config.appSecret) {
      throw new Error(`Lark bot App Secret is missing for App ID: ${appId}`);
    }
    return bot.config;
  }
}
