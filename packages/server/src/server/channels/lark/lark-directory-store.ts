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
    users: readonly { email?: string | null; openId: string; displayName?: string | null }[],
    now: string,
  ): LarkDirectoryUser[] {
    this.ensureLoaded();
    const next = structuredClone(this.payload);
    const result: LarkDirectoryUser[] = [];
    for (const user of users) {
      const openId = user.openId.trim();
      if (!openId) continue;
      const email = normalizeLarkDirectoryEmail(user.email);
      const existing = next.users.find(
        (entry) =>
          entry.appId === appId &&
          (entry.openId === openId || (email !== null && entry.email === email)),
      );
      const record = LarkDirectoryUserSchema.parse({
        appId,
        email: email ?? existing?.email ?? null,
        openId,
        displayName: pickLarkDirectoryDisplayName(user.displayName, existing?.displayName),
        firstMessageContent: existing?.firstMessageContent ?? null,
        firstMessageAt: existing?.firstMessageAt ?? null,
        updatedAt: now,
      });
      next.users = next.users.filter(
        (entry) =>
          entry.appId !== appId ||
          (entry.openId !== openId && (email === null || entry.email !== email)),
      );
      next.users.push(record);
      result.push(record);
    }
    this.persist(next);
    return result;
  }

  observeUser(
    appId: string,
    input: {
      openId: string;
      email?: string | null;
      displayName?: string | null;
      firstMessageContent?: string | null;
      firstMessageAt?: string | null;
    },
    now: string,
  ): LarkDirectoryUser {
    this.ensureLoaded();
    const existing = this.findUser(appId, input.openId);
    const record = LarkDirectoryUserSchema.parse({
      appId,
      email: normalizeLarkDirectoryEmail(input.email) ?? existing?.email ?? null,
      openId: input.openId,
      displayName: pickLarkDirectoryDisplayName(input.displayName, existing?.displayName),
      firstMessageContent: existing?.firstMessageContent ?? input.firstMessageContent ?? null,
      firstMessageAt: existing?.firstMessageAt ?? input.firstMessageAt ?? null,
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

  updateUser(
    appId: string,
    openId: string,
    input: { email: string | null; displayName: string | null },
    now: string,
  ): LarkDirectoryUser | null {
    this.ensureLoaded();
    const existing = this.findUser(appId, openId);
    if (!existing) return null;
    const record = LarkDirectoryUserSchema.parse({
      ...existing,
      email: normalizeLarkDirectoryEmail(input.email),
      displayName: input.displayName?.trim() || null,
      updatedAt: now,
    });
    this.persist({
      ...this.payload,
      users: this.payload.users.map((entry) =>
        entry.appId === appId && entry.openId === openId ? record : entry,
      ),
    });
    return record;
  }

  clearFirstMessageContents(appId: string, now: string): number {
    this.ensureLoaded();
    let clearedCount = 0;
    const users = this.payload.users.map((entry) => {
      if (entry.appId !== appId || entry.firstMessageContent == null) {
        return entry;
      }
      clearedCount += 1;
      return LarkDirectoryUserSchema.parse({
        ...entry,
        firstMessageContent: null,
        updatedAt: now,
      });
    });
    if (clearedCount > 0) {
      this.persist({ ...this.payload, users });
    }
    return clearedCount;
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
      const incomingGroupId = chat.groupId.trim();
      const groupIdCandidate =
        incomingGroupId && incomingGroupId !== chat.chatId
          ? incomingGroupId
          : (existing?.groupId ?? incomingGroupId);
      const record = LarkDirectoryChatSchema.parse({
        appId,
        groupId: inferLarkGroupId({
          groupId: groupIdCandidate,
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
