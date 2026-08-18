import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  LarkReminderCreateInputSchema,
  LarkReminderSchema,
  type LarkReminder,
  type LarkReminderCreateInput,
} from "@getpaseo/protocol/messages";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";

const LARK_REMINDER_STORE_VERSION = 1;
const LarkReminderStorePayloadSchema = z.object({
  version: z.literal(LARK_REMINDER_STORE_VERSION),
  reminders: z.array(LarkReminderSchema),
});

interface LarkReminderStorePayload {
  version: typeof LARK_REMINDER_STORE_VERSION;
  reminders: LarkReminder[];
}

function cloneReminder(reminder: LarkReminder): LarkReminder {
  return LarkReminderSchema.parse(JSON.parse(JSON.stringify(reminder)));
}

export class LarkReminderStore {
  private readonly filePath: string;
  private loaded = false;
  private payload: LarkReminderStorePayload = {
    version: LARK_REMINDER_STORE_VERSION,
    reminders: [],
  };

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "channels", "lark-reminders.json");
  }

  list(): LarkReminder[] {
    this.ensureLoaded();
    return this.payload.reminders
      .map(cloneReminder)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  get(id: string): LarkReminder | null {
    this.ensureLoaded();
    const reminder = this.payload.reminders.find((entry) => entry.id === id);
    return reminder ? cloneReminder(reminder) : null;
  }

  create(input: LarkReminderCreateInput, now: string): LarkReminder {
    this.ensureLoaded();
    const parsed = LarkReminderCreateInputSchema.parse(input);
    const targetOpenIds = Array.from(new Set(parsed.targetOpenIds.map((entry) => entry.trim())));
    const enabled = parsed.enabled;
    const reminder = LarkReminderSchema.parse({
      id: randomUUID(),
      name: parsed.name?.trim() || parsed.message.slice(0, 80),
      botId: parsed.botId,
      chatId: parsed.chatId,
      targetOpenIds,
      message: parsed.message,
      frequencySeconds: parsed.frequencySeconds,
      sender: parsed.sender,
      status: enabled ? "active" : "paused",
      createdAt: now,
      updatedAt: now,
      startedAt: enabled ? now : null,
      completedAt: null,
      lastSentAt: null,
      nextRunAt: enabled ? now : null,
      sendCount: 0,
      lastError: null,
      reply: null,
    });
    this.persist({
      ...this.payload,
      reminders: [...this.payload.reminders, reminder],
    });
    return cloneReminder(reminder);
  }

  update(id: string, updater: (reminder: LarkReminder) => LarkReminder): LarkReminder | null {
    this.ensureLoaded();
    const index = this.payload.reminders.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = cloneReminder(this.payload.reminders[index]!);
    const updated = LarkReminderSchema.parse(updater(current));
    if (updated.id !== id) {
      throw new Error(`Lark reminder update cannot change id: ${id}`);
    }
    const reminders = [...this.payload.reminders];
    reminders[index] = updated;
    this.persist({ ...this.payload, reminders });
    return cloneReminder(updated);
  }

  delete(id: string): boolean {
    this.ensureLoaded();
    const reminders = this.payload.reminders.filter((entry) => entry.id !== id);
    if (reminders.length === this.payload.reminders.length) return false;
    this.persist({ ...this.payload, reminders });
    return true;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (!existsSync(this.filePath)) {
      this.loaded = true;
      return;
    }
    ensurePrivateFile(this.filePath);
    this.payload = LarkReminderStorePayloadSchema.parse(
      JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
    );
    this.loaded = true;
  }

  private persist(payload: LarkReminderStorePayload): void {
    const parsed = LarkReminderStorePayloadSchema.parse(payload);
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(parsed, null, 2));
    this.payload = parsed;
    this.loaded = true;
  }
}
