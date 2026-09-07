import type {
  LarkDirectory,
  LarkDirectoryChat,
  LarkDirectoryRecentPrivateUser,
  LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import type { LarkChannelStore, StoredLarkChannelConfig } from "./lark-channel-store.js";
import {
  PASEO_LARK_CHAT_LOOKUP_USER_SCOPES,
  PASEO_LARK_PRIVATE_MESSAGE_SCAN_USER_SCOPES,
} from "./lark-bot-capability-requirements.js";
import { hasCompleteLarkDirectoryUser } from "./lark-directory-identity.js";
import { collectRecentLarkPrivateUsers } from "./lark-directory-private-user-scan.js";
import type { LarkDirectoryStore } from "./lark-directory-store.js";
import { toLarkDirectoryMessageTime } from "./lark-directory-message.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

function uniqueEmails(emails: readonly string[]): string[] {
  return Array.from(
    new Set(emails.map((email) => email.trim().toLocaleLowerCase()).filter(Boolean)),
  );
}

const DIRECTORY_CHAT_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class LarkDirectoryService {
  constructor(
    private readonly channelStore: LarkChannelStore,
    private readonly store: LarkDirectoryStore,
    private readonly adapter: LarkChannelClientAdapter,
    private readonly userOAuthService: LarkUserOAuthService,
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
    const byEmail = new Map(
      resolved.flatMap((entry) =>
        entry.email ? [[entry.email.toLocaleLowerCase(), entry] as const] : [],
      ),
    );
    const missing = normalizedEmails.filter((email) => !byEmail.has(email));
    if (missing.length > 0) {
      throw new Error(`No visible Lark user found for: ${missing.join(", ")}`);
    }
    const enriched = this.adapter.resolveUserByOpenId
      ? await Promise.all(
          resolved.map(async (user) => {
            if (hasCompleteLarkDirectoryUser(user)) return user;
            try {
              const details = await this.adapter.resolveUserByOpenId!(config, user.openId);
              return details
                ? {
                    email: details.email || user.email,
                    openId: details.openId || user.openId,
                    displayName: details.displayName ?? user.displayName,
                  }
                : user;
            } catch {
              return user;
            }
          }),
        )
      : resolved;
    return this.store.upsertResolvedUsers(appId, enriched, new Date().toISOString());
  }

  async resolveUserByOpenId(appId: string, openId: string): Promise<LarkDirectoryUser> {
    const normalizedOpenId = openId.trim();
    if (!normalizedOpenId) {
      throw new Error("A Lark user Open ID is required");
    }
    const config = this.requireConfig(appId);
    const existing = this.store.findUser(appId, normalizedOpenId);
    if (existing && hasCompleteLarkDirectoryUser(existing)) {
      return existing;
    }
    if (!this.adapter.resolveUserByOpenId) {
      if (existing) return existing;
      throw new Error("This Paseo daemon does not support Lark Open ID lookup");
    }
    const resolved = await this.adapter.resolveUserByOpenId(config, normalizedOpenId);
    if (!resolved) {
      if (existing) return existing;
      throw new Error(
        `飞书未返回用户 ${normalizedOpenId} 的可见资料，请检查应用通讯录权限范围以及 contact:user.base:readonly、contact:user.id:readonly 权限`,
      );
    }
    const user = this.store.upsertResolvedUsers(appId, [resolved], new Date().toISOString())[0];
    if (!user) {
      throw new Error(`无法保存飞书联系人：${normalizedOpenId}`);
    }
    return user;
  }

  async refreshUserByOpenId(appId: string, openId: string): Promise<LarkDirectoryUser | null> {
    const normalizedOpenId = openId.trim();
    if (!normalizedOpenId) {
      return null;
    }
    const existing = this.store.findUser(appId, normalizedOpenId);
    if (existing && hasCompleteLarkDirectoryUser(existing)) {
      return existing;
    }
    if (!this.adapter.resolveUserByOpenId) {
      return existing;
    }
    try {
      return await this.resolveUserByOpenId(appId, normalizedOpenId);
    } catch {
      return existing;
    }
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
    const userAccessToken = await this.userOAuthService.getValidUserAccessToken(
      appId,
      PASEO_LARK_CHAT_LOOKUP_USER_SCOPES,
    );
    const resolved = await this.adapter.resolveChats(config, normalizedQuery, userAccessToken);
    if (resolved.length === 0) {
      throw new Error(`No visible Lark group found for: ${normalizedQuery}`);
    }
    return this.store.upsertChats(appId, resolved, new Date().toISOString());
  }

  async scanRecentPrivateUsers(
    appId: string,
    lookbackMinutes: number,
  ): Promise<LarkDirectoryRecentPrivateUser[]> {
    if (!Number.isInteger(lookbackMinutes) || lookbackMinutes < 1 || lookbackMinutes > 10_080) {
      throw new Error("私聊扫描时间范围必须是 1 到 10080 分钟");
    }
    const config = this.requireConfig(appId);
    if (!this.adapter.searchPrivateMessagesAsUser) {
      throw new Error("当前飞书连接不支持扫描最近私聊用户");
    }
    const oauth = this.userOAuthService.getStatus(appId);
    const userAccessToken = await this.userOAuthService.getValidUserAccessToken(
      appId,
      PASEO_LARK_PRIVATE_MESSAGE_SCAN_USER_SCOPES,
    );
    const now = new Date();
    const rawMessages = await this.adapter.searchPrivateMessagesAsUser(
      config,
      {
        startTime: Math.floor((now.getTime() - lookbackMinutes * 60 * 1_000) / 1_000),
        endTime: Math.floor(now.getTime() / 1_000),
      },
      userAccessToken,
    );
    return collectRecentLarkPrivateUsers({
      appId,
      rawMessages,
      currentUserOpenId: oauth.openId,
      directory: this.store.getState(),
      now: now.toISOString(),
    });
  }

  async addRecentPrivateUser(
    appId: string,
    input: {
      openId: string;
      displayName: string | null;
      firstMessageContent: string;
      firstMessageAt: string;
    },
  ): Promise<LarkDirectoryUser> {
    this.requireConfig(appId);
    const observed = this.store.observeUser(
      appId,
      {
        openId: input.openId.trim(),
        displayName: input.displayName,
        firstMessageContent: input.firstMessageContent,
        firstMessageAt: input.firstMessageAt,
      },
      new Date().toISOString(),
    );
    return (await this.refreshUserByOpenId(appId, observed.openId)) ?? observed;
  }

  async refreshChatById(
    appId: string,
    chatId: string,
    options: { force?: boolean } = {},
  ): Promise<LarkDirectoryChat | null> {
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) {
      return null;
    }
    const existing = this.store.findChat(appId, normalizedChatId);
    const updatedAt = existing ? Date.parse(existing.updatedAt) : Number.NaN;
    if (
      existing &&
      !options.force &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt < DIRECTORY_CHAT_REFRESH_INTERVAL_MS
    ) {
      return existing;
    }
    const config = this.requireConfig(appId);
    if (!this.adapter.resolveChats) {
      return existing;
    }
    const userAccessToken = await this.userOAuthService.getValidUserAccessToken(
      appId,
      PASEO_LARK_CHAT_LOOKUP_USER_SCOPES,
    );
    const resolved = await this.adapter.resolveChats(config, normalizedChatId, userAccessToken);
    const chat =
      resolved.find((entry) => entry.chatId.trim() === normalizedChatId) ?? resolved[0] ?? null;
    if (!chat) {
      return existing;
    }
    return this.store.upsertChats(appId, [chat], new Date().toISOString())[0] ?? existing;
  }

  observeChats(
    appId: string,
    chats: readonly { groupId: string; chatId: string; name: string }[],
  ): LarkDirectoryChat[] {
    return this.store.upsertChats(appId, chats, new Date().toISOString());
  }

  observeUser(
    appId: string,
    openId: string,
    displayName?: string | null,
    email?: string | null,
    firstMessage?: { content: string; createTime: number | null },
  ): LarkDirectoryUser {
    const now = new Date().toISOString();
    return this.store.observeUser(
      appId,
      {
        openId,
        displayName,
        email,
        firstMessageContent: firstMessage?.content ?? null,
        firstMessageAt: firstMessage
          ? toLarkDirectoryMessageTime(firstMessage.createTime, now)
          : null,
      },
      now,
    );
  }

  updateUser(
    appId: string,
    openId: string,
    input: { displayName: string | null; email: string | null },
  ): LarkDirectoryUser {
    if (!this.channelStore.getBots().some((entry) => entry.config.appId === appId)) {
      throw new Error(`Lark bot App ID is not configured: ${appId}`);
    }
    const user = this.store.updateUser(appId, openId, input, new Date().toISOString());
    if (!user) {
      throw new Error(`Lark contact not found: ${openId}`);
    }
    return user;
  }

  clearFirstMessageContents(appId: string): number {
    if (!this.channelStore.getBots().some((entry) => entry.config.appId === appId)) {
      throw new Error(`Lark bot App ID is not configured: ${appId}`);
    }
    return this.store.clearFirstMessageContents(appId, new Date().toISOString());
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
