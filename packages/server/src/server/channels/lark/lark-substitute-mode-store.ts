import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT,
  DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS,
  LarkSubstituteModeCreateInputSchema,
  LarkSubstituteModeSchema,
  LarkSubstituteModeUpdateInputSchema,
  type LarkSubstituteMode,
  type LarkSubstituteModeCreateInput,
  type LarkSubstituteModeUpdateInput,
} from "@getpaseo/protocol/messages";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";
import type { StoredLarkChannelBot } from "./lark-channel-store.js";

const LARK_SUBSTITUTE_MODE_STORE_VERSION = 4;
const LarkSubstituteModeStorePayloadSchema = z.object({
  version: z.literal(LARK_SUBSTITUTE_MODE_STORE_VERSION),
  migratedLegacyBotIds: z.array(z.string()),
  modes: z.array(LarkSubstituteModeSchema),
});
const StoredLarkSubstituteModePayloadSchema = z.object({
  version: z.number().int(),
  migratedLegacyBotIds: z.array(z.string()).default([]),
  modes: z.array(z.unknown()).default([]),
});

type LarkSubstituteModeStorePayload = z.infer<typeof LarkSubstituteModeStorePayloadSchema>;

function cloneMode(mode: LarkSubstituteMode): LarkSubstituteMode {
  return LarkSubstituteModeSchema.parse(JSON.parse(JSON.stringify(mode)));
}

function migrateStoredMode(value: unknown, storedVersion: number): LarkSubstituteMode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return LarkSubstituteModeSchema.parse(value);
  }
  const mode = value as Record<string, unknown>;
  const activeTimeRanges = Array.isArray(mode.activeTimeRanges)
    ? mode.activeTimeRanges.map((range) => {
        if (!range || typeof range !== "object" || Array.isArray(range)) return range;
        const record = range as Record<string, unknown>;
        const weekdays = Array.isArray(record.weekdays)
          ? Array.from(
              new Set(record.weekdays.map((weekday) => (weekday === 0 ? 7 : weekday))),
            ).sort((left, right) => Number(left) - Number(right))
          : record.weekdays;
        return { ...record, weekdays };
      })
    : mode.activeTimeRanges;
  const legacyDefaults =
    storedVersion < LARK_SUBSTITUTE_MODE_STORE_VERSION &&
    typeof mode.id === "string" &&
    mode.id.startsWith("legacy-")
      ? {
          customPrompt:
            typeof mode.customPrompt !== "string" || !mode.customPrompt.trim()
              ? DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT
              : mode.customPrompt,
          delaySeconds:
            mode.delaySeconds === 0 || mode.delaySeconds === undefined
              ? DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS
              : mode.delaySeconds,
        }
      : {};
  return LarkSubstituteModeSchema.parse({ ...mode, ...legacyDefaults, activeTimeRanges });
}

function legacyModeName(bot: StoredLarkChannelBot): string {
  const botName = bot.name?.trim() || bot.config.appId?.trim() || bot.id;
  return `${botName} 的替身模式`;
}

export class LarkSubstituteModeStore {
  private readonly filePath: string;
  private loaded = false;
  private payload: LarkSubstituteModeStorePayload = {
    version: LARK_SUBSTITUTE_MODE_STORE_VERSION,
    migratedLegacyBotIds: [],
    modes: [],
  };

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "channels", "lark-substitute-modes.json");
  }

  getFilePath(): string {
    return this.filePath;
  }

  list(): LarkSubstituteMode[] {
    this.ensureLoaded();
    return this.payload.modes
      .map(cloneMode)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  get(id: string): LarkSubstituteMode | null {
    this.ensureLoaded();
    const mode = this.payload.modes.find((entry) => entry.id === id);
    return mode ? cloneMode(mode) : null;
  }

  create(input: LarkSubstituteModeCreateInput, now: string): LarkSubstituteMode {
    this.ensureLoaded();
    const parsed = LarkSubstituteModeCreateInputSchema.parse(input);
    const mode = LarkSubstituteModeSchema.parse({
      ...parsed,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.persist({ ...this.payload, modes: [...this.payload.modes, mode] });
    return cloneMode(mode);
  }

  update(id: string, input: LarkSubstituteModeUpdateInput, now: string): LarkSubstituteMode | null {
    this.ensureLoaded();
    const parsed = LarkSubstituteModeUpdateInputSchema.parse(input);
    const index = this.payload.modes.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = this.payload.modes[index]!;
    const updated = LarkSubstituteModeSchema.parse({
      ...parsed,
      id,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    const modes = [...this.payload.modes];
    modes[index] = updated;
    this.persist({ ...this.payload, modes });
    return cloneMode(updated);
  }

  setEnabled(id: string, enabled: boolean, now: string): LarkSubstituteMode | null {
    const current = this.get(id);
    return current ? this.update(id, { ...current, enabled }, now) : null;
  }

  delete(id: string): boolean {
    this.ensureLoaded();
    const modes = this.payload.modes.filter((entry) => entry.id !== id);
    if (modes.length === this.payload.modes.length) return false;
    this.persist({ ...this.payload, modes });
    return true;
  }

  deleteByBotId(botId: string): void {
    this.ensureLoaded();
    const modes = this.payload.modes.filter((entry) => entry.botId !== botId);
    if (modes.length !== this.payload.modes.length) {
      this.persist({ ...this.payload, modes });
    }
  }

  migrateLegacyBots(bots: readonly StoredLarkChannelBot[], now: string): void {
    this.ensureLoaded();
    const migrated = new Set(this.payload.migratedLegacyBotIds);
    const modes = [...this.payload.modes];
    let changed = false;
    for (const bot of bots) {
      if (migrated.has(bot.id)) continue;
      migrated.add(bot.id);
      changed = true;
      const substitute = bot.config.substitute;
      if (!substitute.openId?.trim()) continue;
      modes.push(
        LarkSubstituteModeSchema.parse({
          id: `legacy-${bot.id}`,
          name: legacyModeName(bot),
          enabled: substitute.enabled,
          botId: bot.id,
          disclosure: {
            enabled: true,
            prompt: substitute.name ? `【代${substitute.name}回复】` : "【替身回复】",
          },
          customPrompt: DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT,
          delaySeconds: DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS,
          autoArchiveAgent: false,
          activeTimeRanges: [],
          allowlist: [{ id: `legacy-${bot.id}-allow-all`, type: "all" }],
          denylist: [],
          target: bot.config.target,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    if (changed) {
      this.persist({
        version: LARK_SUBSTITUTE_MODE_STORE_VERSION,
        migratedLegacyBotIds: [...migrated],
        modes,
      });
    }
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (existsSync(this.filePath)) {
      ensurePrivateFile(this.filePath);
      const stored = StoredLarkSubstituteModePayloadSchema.parse(
        JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
      );
      const migrated = LarkSubstituteModeStorePayloadSchema.parse({
        version: LARK_SUBSTITUTE_MODE_STORE_VERSION,
        migratedLegacyBotIds: stored.migratedLegacyBotIds,
        modes: stored.modes.map((mode) => migrateStoredMode(mode, stored.version)),
      });
      this.payload = migrated;
      if (stored.version !== LARK_SUBSTITUTE_MODE_STORE_VERSION) {
        this.persist(migrated);
      }
    }
    this.loaded = true;
  }

  private persist(payload: LarkSubstituteModeStorePayload): void {
    const parsed = LarkSubstituteModeStorePayloadSchema.parse(payload);
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(parsed, null, 2));
    this.payload = parsed;
    this.loaded = true;
  }
}
