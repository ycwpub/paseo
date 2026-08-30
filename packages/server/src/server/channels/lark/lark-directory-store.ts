import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type pino from "pino";
import { z } from "zod";
import {
  LarkDirectoryChatSchema,
  LarkDirectorySchema,
  LarkDirectoryUserSchema,
  type LarkDirectory,
  type LarkDirectoryChat,
  type LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";
import {
  inferLarkGroupId,
  normalizeLarkDirectoryEmail,
  pickLarkDirectoryDisplayName,
} from "./lark-directory-identity.js";

const LARK_DIRECTORY_STORE_VERSION = 1;

const LarkDirectoryStorePayloadSchema = z.object({
  version: z.literal(LARK_DIRECTORY_STORE_VERSION),
  users: z.array(LarkDirectoryUserSchema),
  chats: z.array(LarkDirectoryChatSchema),
});

type LarkDirectoryStorePayload = z.infer<typeof LarkDirectoryStorePayloadSchema>;

function cloneDirectory(payload: LarkDirectoryStorePayload): LarkDirectory {
  return LarkDirectorySchema.parse(JSON.parse(JSON.stringify(payload)));
}

export class LarkDirectoryStore {
  private readonly filePath: string;
  private readonly logger: pino.Logger;
  private loaded = false;
  private payload: LarkDirectoryStorePayload = {
    version: LARK_DIRECTORY_STORE_VERSION,
    users: [],
    chats: [],
  };

  constructor(options: { paseoHome: string; logger: pino.Logger }) {
    this.filePath = path.join(options.paseoHome, "channels", "lark-directory.json");
    this.logger = options.logger.child({ module: "lark-directory-store" });
  }

  getState(): LarkDirectory {
    this.ensureLoaded();
    return cloneDirectory(this.payload);
  }

  findUser(appId: string, openId: string): LarkDirectoryUser | null {
    this.ensureLoaded();
    return (
      this.payload.users.find((entry) => entry.appId === appId && entry.openId === openId) ?? null
    );
  }

  findChat(appId: string, chatId: string): LarkDirectoryChat | null {
    this.ensureLoaded();
    return (
      this.payload.chats.find((entry) => entry.appId === appId && entry.chatId === chatId) ?? null
    );
  }

  upsertResolvedUsers(
    appId: string,
    users: readonly { email: string; openId: string; displayName?: string | null }[],
    now: string,
  ): LarkDirectoryUser[] {
    this.ensureLoaded();
    const next = structuredClone(this.payload);
    const result: LarkDirectoryUser[] = [];
    for (const user of users) {
      const email = normalizeLarkDirectoryEmail(user.email);
      if (!email) continue;
      const existing = next.users.find(
        (entry) => entry.appId === appId && (entry.openId === user.openId || entry.email === email),
      );
      const record = LarkDirectoryUserSchema.parse({
        appId,
        email,
        openId: user.openId,
        displayName: pickLarkDirectoryDisplayName(user.displayName, existing?.displayName),
        updatedAt: now,
      });
      next.users = next.users.filter(
        (entry) => entry.appId !== appId || (entry.openId !== user.openId && entry.email !== email),
      );
      next.users.push(record);
      result.push(record);
    }
    this.persist(next);
    return result;
  }

  observeUser(
    appId: string,
    input: { openId: string; email?: string | null; displayName?: string | null },
    now: string,
  ): LarkDirectoryUser {
    this.ensureLoaded();
    const existing = this.findUser(appId, input.openId);
    const record = LarkDirectoryUserSchema.parse({
      appId,
      email: normalizeLarkDirectoryEmail(input.email) ?? existing?.email ?? null,
      openId: input.openId,
      displayName: pickLarkDirectoryDisplayName(input.displayName, existing?.displayName),
      updatedAt: now,
    });
    this.persist({
      ...this.payload,
      users: [
        ...this.payload.users.filter(
          (entry) => entry.appId !== appId || entry.openId !== input.openId,
        ),
        record,
      ],
    });
    return record;
  }

  upsertChats(
    appId: string,
    chats: readonly { groupId: string; chatId: string; name: string }[],
    now: string,
  ): LarkDirectoryChat[] {
    this.ensureLoaded();
    const next = structuredClone(this.payload);
    const result: LarkDirectoryChat[] = [];
    for (const chat of chats) {
      const existing = next.chats.find(
        (entry) => entry.appId === appId && entry.chatId === chat.chatId,
      );
      const record = LarkDirectoryChatSchema.parse({
        appId,
        groupId: inferLarkGroupId({
          groupId: chat.groupId.trim() || existing?.groupId,
          chatId: chat.chatId,
          name: chat.name,
        }),
        chatId: chat.chatId,
        name: chat.name.trim() || existing?.name || chat.chatId,
        updatedAt: now,
      });
      next.chats = next.chats.filter(
        (entry) => entry.appId !== appId || entry.chatId !== chat.chatId,
      );
      next.chats.push(record);
      result.push(record);
    }
    this.persist(next);
    return result;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (!existsSync(this.filePath)) {
      this.loaded = true;
      return;
    }
    ensurePrivateFile(this.filePath);
    try {
      this.payload = LarkDirectoryStorePayloadSchema.parse(
        JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
      );
    } catch (error) {
      this.logger.error({ err: error, filePath: this.filePath }, "Failed to parse Lark directory");
      throw error;
    }
    this.loaded = true;
  }

  private persist(payload: LarkDirectoryStorePayload): void {
    const parsed = LarkDirectoryStorePayloadSchema.parse(payload);
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(parsed, null, 2));
    this.payload = parsed;
    this.loaded = true;
  }
}
