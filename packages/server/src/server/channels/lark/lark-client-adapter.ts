import * as lark from "@larksuiteoapi/node-sdk";
import type pino from "pino";
import type { StoredLarkChannelConfig } from "./lark-channel-store.js";
import {
  normalizeLarkMessageEvent,
  type LarkChatBot,
  type NormalizedLarkMessageEvent,
} from "./lark-message-format.js";

export interface LarkChannelBotInfo {
  openId: string;
  appId: string;
  name?: string;
  avatarUrl?: string;
}

export interface LarkChannelEventSubscription {
  close(): void;
}

export interface LarkThreadReplyResult {
  threadId: string | null;
  messageId: string | null;
}

export interface LarkMessageListOptions {
  pageSize?: number;
}

export interface LarkChatMessageListOptions extends LarkMessageListOptions {
  startTime?: number;
}

export interface LarkMessageGetOptions {
  userCardContent?: boolean;
}

export interface LarkResolvedUser {
  email: string;
  openId: string;
}

export interface LarkResolvedChat {
  groupId: string;
  chatId: string;
  name: string;
}

export interface LarkChannelClientAdapter {
  testConnection(config: StoredLarkChannelConfig): Promise<LarkChannelBotInfo>;
  startEvents(
    config: StoredLarkChannelConfig,
    handler: (event: NormalizedLarkMessageEvent) => Promise<void>,
  ): Promise<LarkChannelEventSubscription>;
  sendText(config: StoredLarkChannelConfig, chatId: string, text: string): Promise<void>;
  sendTextAsUser?(
    config: StoredLarkChannelConfig,
    chatId: string,
    text: string,
    userAccessToken: string,
  ): Promise<void>;
  replyToMessageInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
  ): Promise<LarkThreadReplyResult>;
  replyInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
  ): Promise<LarkThreadReplyResult>;
  listChatBots(config: StoredLarkChannelConfig, chatId: string): Promise<LarkChatBot[]>;
  getMessage(
    config: StoredLarkChannelConfig,
    messageId: string,
    options?: LarkMessageGetOptions,
  ): Promise<unknown | null>;
  listThreadMessages(
    config: StoredLarkChannelConfig,
    threadId: string,
    options?: LarkMessageListOptions,
  ): Promise<unknown[]>;
  listChatMessages?(
    config: StoredLarkChannelConfig,
    chatId: string,
    options?: LarkChatMessageListOptions,
  ): Promise<unknown[]>;
  resolveUsersByEmails?(
    config: StoredLarkChannelConfig,
    emails: readonly string[],
  ): Promise<LarkResolvedUser[]>;
  resolveChats?(config: StoredLarkChannelConfig, query: string): Promise<LarkResolvedChat[]>;
}

function requireCredentials(config: StoredLarkChannelConfig): { appId: string; appSecret: string } {
  if (!config.appId || !config.appSecret) {
    throw new Error("Lark App ID and App Secret are required");
  }
  return { appId: config.appId, appSecret: config.appSecret };
}

function resolveDomain(domain: StoredLarkChannelConfig["domain"]): lark.Domain {
  return domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu;
}

function createClient(config: StoredLarkChannelConfig): lark.Client {
  const credentials = requireCredentials(config);
  return new lark.Client({
    ...credentials,
    appType: lark.AppType.SelfBuild,
    domain: resolveDomain(config.domain),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function describeLarkError(error: unknown): Error {
  const response = asRecord(asRecord(error)?.response);
  const data = asRecord(response?.data);
  const code = data?.code;
  const msg = recordString(data, "msg");
  const headers = asRecord(response?.headers);
  const logId =
    recordString(data, "log_id") ??
    recordString(data, "logId") ??
    recordString(headers, "x-tt-logid");
  if (msg || typeof code === "number") {
    return new Error(
      [
        "Lark API error",
        msg ? `: ${msg}` : "",
        typeof code === "number" ? ` (code: ${code})` : "",
        logId ? ` log_id=${logId}` : "",
      ].join(""),
      { cause: error },
    );
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function assertSuccess(result: { code?: number; msg?: string }): void {
  if (typeof result.code === "number" && result.code !== 0) {
    throw new Error(
      result.msg
        ? `Lark API error: ${result.msg} (code: ${result.code})`
        : `Lark API returned code ${result.code}`,
    );
  }
}

const LARK_MESSAGE_LIST_MAX_PAGE_SIZE = 50;

function wantsAllMessages(pageSize: number): boolean {
  return pageSize <= 0 || !Number.isFinite(pageSize);
}

type LarkGetParams = Record<string, string | number | boolean | undefined>;
interface LarkGetResult {
  code?: number;
  msg?: string;
  data?: { items?: unknown[]; page_token?: string } & Record<string, unknown>;
}

async function larkGet(
  client: lark.Client,
  url: string,
  params: LarkGetParams,
): Promise<LarkGetResult> {
  // The generated SDK message.list helper can attach an empty GET body. Some
  // Feishu gateways reject that before the OpenAPI handler runs. Use the SDK's
  // generic request path, matching botmux, so GETs are sent without a body while
  // still using the SDK token/cache/auth plumbing.
  try {
    return (await (client as unknown as { request(input: unknown): Promise<unknown> }).request({
      method: "GET",
      url,
      params,
    })) as LarkGetResult;
  } catch (error) {
    throw describeLarkError(error);
  }
}

function getPageSize(pageSize: number, unlimited: boolean): number {
  return unlimited
    ? LARK_MESSAGE_LIST_MAX_PAGE_SIZE
    : Math.min(Math.max(Math.floor(pageSize), 1), LARK_MESSAGE_LIST_MAX_PAGE_SIZE);
}

function messageListItems(result: { data?: { items?: unknown[] } }): unknown[] {
  return Array.isArray(result.data?.items) ? result.data.items : [];
}

export class OfficialLarkChannelClientAdapter implements LarkChannelClientAdapter {
  private readonly logger: pino.Logger;

  constructor(options: { logger: pino.Logger }) {
    this.logger = options.logger.child({ module: "lark-client-adapter" });
  }

  async testConnection(config: StoredLarkChannelConfig): Promise<LarkChannelBotInfo> {
    const credentials = requireCredentials(config);
    const client = createClient(config);
    try {
      const result = await client.request<{
        code?: number;
        msg?: string;
        bot?: {
          open_id?: string;
          app_name?: string;
          avatar_url?: string;
        };
      }>({
        method: "GET",
        url: "/open-apis/bot/v3/info",
      });
      assertSuccess(result);
      const openId = result.bot?.open_id;
      if (!openId) {
        throw new Error("Lark bot info response is missing open_id");
      }
      return {
        openId,
        appId: credentials.appId,
        ...(result.bot?.app_name ? { name: result.bot.app_name } : {}),
        ...(result.bot?.avatar_url ? { avatarUrl: result.bot.avatar_url } : {}),
      };
    } catch (error) {
      throw describeLarkError(error);
    }
  }

  async startEvents(
    config: StoredLarkChannelConfig,
    handler: (event: NormalizedLarkMessageEvent) => Promise<void>,
  ): Promise<LarkChannelEventSubscription> {
    const credentials = requireCredentials(config);
    const wsClient = new lark.WSClient({
      ...credentials,
      domain: resolveDomain(config.domain),
      loggerLevel: lark.LoggerLevel.info,
      onError: (err) => {
        this.logger.error({ err, appId: credentials.appId }, "Lark WebSocket client error");
      },
      onReady: () => {
        this.logger.info({ appId: credentials.appId }, "Lark WebSocket client ready");
      },
    });
    const dispatcher = new lark.EventDispatcher({
      encryptKey: config.encryptKey ?? undefined,
      verificationToken: config.verificationToken ?? undefined,
    }).register({
      "im.message.receive_v1": async (event: unknown) => {
        const normalized = normalizeLarkMessageEvent(event);
        if (!normalized) {
          this.logger.debug({ event }, "Ignoring unsupported Lark event");
          return;
        }
        await handler(normalized);
      },
    });
    await wsClient.start({ eventDispatcher: dispatcher });
    this.logger.info(
      { appId: credentials.appId, domain: config.domain },
      "Lark WebSocket event subscription started",
    );
    return {
      close: () => {
        wsClient.close({ force: true });
      },
    };
  }

  async sendText(config: StoredLarkChannelConfig, chatId: string, text: string): Promise<void> {
    const client = createClient(config);
    const result = await client.im.v1.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
    assertSuccess(result);
  }

  async sendTextAsUser(
    config: StoredLarkChannelConfig,
    chatId: string,
    text: string,
    userAccessToken: string,
  ): Promise<void> {
    const client = createClient(config);
    const result = await client.im.v1.message.create(
      {
        params: {
          receive_id_type: "chat_id",
        },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        },
      },
      lark.withUserAccessToken(userAccessToken),
    );
    assertSuccess(result);
  }

  async replyToMessageInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
  ): Promise<LarkThreadReplyResult> {
    const client = createClient(config);
    const result = await client.im.v1.message.reply({
      path: {
        message_id: messageId,
      },
      data: {
        msg_type: "text",
        content: JSON.stringify({ text }),
        reply_in_thread: true,
      },
    });
    assertSuccess(result);
    return {
      threadId: result.data?.thread_id ?? null,
      messageId: result.data?.message_id ?? null,
    };
  }

  async replyInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
  ): Promise<LarkThreadReplyResult> {
    const client = createClient(config);
    const result = await client.im.v1.message.reply({
      path: {
        message_id: messageId,
      },
      data: {
        msg_type: "text",
        content: JSON.stringify({ text }),
        reply_in_thread: true,
      },
    });
    assertSuccess(result);
    return {
      threadId: result.data?.thread_id ?? null,
      messageId: result.data?.message_id ?? null,
    };
  }

  async listChatBots(config: StoredLarkChannelConfig, chatId: string): Promise<LarkChatBot[]> {
    const client = createClient(config);
    const result = await larkGet(
      client,
      `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members/bots`,
      {},
    );
    assertSuccess(result);
    return messageListItems(result).flatMap((item) => {
      const record = asRecord(item);
      const openId = recordString(record, "bot_id");
      const name = recordString(record, "bot_name");
      return openId && name ? [{ openId, name }] : [];
    });
  }

  async resolveUsersByEmails(
    config: StoredLarkChannelConfig,
    emails: readonly string[],
  ): Promise<LarkResolvedUser[]> {
    const client = createClient(config);
    try {
      const result = await client.contact.v3.user.batchGetId({
        data: { emails: [...emails] },
        params: { user_id_type: "open_id" },
      });
      assertSuccess(result);
      return (result.data?.user_list ?? []).flatMap((user) =>
        user.email && user.user_id ? [{ email: user.email, openId: user.user_id }] : [],
      );
    } catch (error) {
      throw describeLarkError(error);
    }
  }

  async resolveChats(config: StoredLarkChannelConfig, query: string): Promise<LarkResolvedChat[]> {
    const client = createClient(config);
    try {
      if (/^oc_[A-Za-z0-9_-]+$/u.test(query)) {
        const result = await client.im.v1.chat.get({ path: { chat_id: query } });
        assertSuccess(result);
        return [
          {
            groupId: query,
            chatId: query,
            name: result.data?.name?.trim() || query,
          },
        ];
      }
      const result = await client.im.v1.chat.search({
        params: { query, page_size: 50, user_id_type: "open_id" },
      });
      assertSuccess(result);
      const chats = (result.data?.items ?? []).flatMap((chat) =>
        chat.chat_id && chat.name
          ? [{ groupId: chat.chat_id, chatId: chat.chat_id, name: chat.name }]
          : [],
      );
      const exact = chats.filter((chat) => chat.name.trim() === query);
      return exact.length > 0 ? exact : chats;
    } catch (error) {
      throw describeLarkError(error);
    }
  }

  async getMessage(
    config: StoredLarkChannelConfig,
    messageId: string,
    options: LarkMessageGetOptions = {},
  ): Promise<unknown | null> {
    const client = createClient(config);
    const result = await larkGet(
      client,
      `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`,
      options.userCardContent ? { card_msg_content_type: "user_card_content" } : {},
    );
    assertSuccess(result);
    return messageListItems(result)[0] ?? null;
  }

  async listThreadMessages(
    config: StoredLarkChannelConfig,
    threadId: string,
    options: LarkMessageListOptions = {},
  ): Promise<unknown[]> {
    const client = createClient(config);
    const pageSize = options.pageSize ?? 0;
    const unlimited = wantsAllMessages(pageSize);
    const items: unknown[] = [];
    let pageToken: string | undefined;
    do {
      const result = await larkGet(client, "/open-apis/im/v1/messages", {
        container_id_type: "thread",
        container_id: threadId,
        page_size: getPageSize(pageSize, unlimited),
        sort_type: "ByCreateTimeAsc",
        with_sender_name: "true",
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      assertSuccess(result);
      items.push(...messageListItems(result));
      pageToken = result.data?.page_token;
      if (!unlimited && items.length >= pageSize) {
        break;
      }
    } while (pageToken);
    return unlimited ? items : items.slice(0, pageSize);
  }

  async listChatMessages(
    config: StoredLarkChannelConfig,
    chatId: string,
    options: LarkChatMessageListOptions = {},
  ): Promise<unknown[]> {
    const client = createClient(config);
    const pageSize = options.pageSize ?? 0;
    const unlimited = wantsAllMessages(pageSize);
    const items: unknown[] = [];
    let pageToken: string | undefined;
    do {
      const result = await larkGet(client, "/open-apis/im/v1/messages", {
        container_id_type: "chat",
        container_id: chatId,
        page_size: getPageSize(pageSize, unlimited),
        sort_type: "ByCreateTimeAsc",
        with_sender_name: "true",
        ...(options.startTime !== undefined ? { start_time: options.startTime } : {}),
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      assertSuccess(result);
      items.push(...messageListItems(result));
      pageToken = result.data?.page_token;
      if (!unlimited && items.length >= pageSize) break;
    } while (pageToken);
    return unlimited ? items : items.slice(0, pageSize);
  }
}
