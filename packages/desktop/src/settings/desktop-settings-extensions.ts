import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  createDesktopSettingsStore,
  type DesktopSettings,
  type DesktopSettingsStore,
} from "./desktop-settings.js";

export interface DesktopSettingsExtensions {
  notifications: {
    enabled: boolean;
  };
  attention: {
    soundVolume: number;
  };
  island: {
    enabled: boolean;
    showWhenFocused: boolean;
  };
}

export interface ExtendedDesktopSettings
  extends Omit<DesktopSettings, "notifications">, DesktopSettingsExtensions {
  notifications: DesktopSettings["notifications"] & DesktopSettingsExtensions["notifications"];
}

export interface ExtendedDesktopSettingsStore {
  get(): Promise<ExtendedDesktopSettings>;
  patch(patch: unknown): Promise<ExtendedDesktopSettings>;
  migrateLegacyRendererSettings(legacySettings: unknown): Promise<ExtendedDesktopSettings>;
}

interface DesktopSettingsExtensionsPatch {
  notifications?: Partial<DesktopSettingsExtensions["notifications"]>;
  attention?: Partial<DesktopSettingsExtensions["attention"]>;
  island?: Partial<DesktopSettingsExtensions["island"]>;
}

export const DEFAULT_DESKTOP_SETTINGS_EXTENSIONS: DesktopSettingsExtensions = {
  notifications: { enabled: true },
  attention: { soundVolume: 0.5 },
  island: { enabled: true, showWhenFocused: true },
};

const EXTENSION_SETTINGS_FILENAME = "desktop-settings-extensions.json";
const LEGACY_SETTINGS_FILENAME = "desktop-settings.json";

const ExtensionSettingsSchema = z
  .looseObject({
    notifications: z
      .looseObject({
        enabled: z.boolean().catch(DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.notifications.enabled),
      })
      .catch(() => ({ ...DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.notifications })),
    attention: z
      .looseObject({
        soundVolume: z
          .number()
          .finite()
          .transform((value) => Math.min(1, Math.max(0, value)))
          .catch(DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.attention.soundVolume),
      })
      .catch(() => ({ ...DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.attention })),
    island: z
      .looseObject({
        enabled: z.boolean().catch(DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.island.enabled),
        showWhenFocused: z
          .boolean()
          .catch(DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.island.showWhenFocused),
      })
      .catch(() => ({ ...DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.island })),
  })
  .catch(() => buildDefaultExtensions());

const PersistedExtensionDocumentSchema = z
  .looseObject({
    version: z.literal(1).catch(1),
    settings: ExtensionSettingsSchema,
  })
  .catch(() => buildDefaultExtensionDocument());

type StoredDesktopSettingsExtensions = z.output<typeof ExtensionSettingsSchema>;
type PersistedExtensionDocument = z.output<typeof PersistedExtensionDocumentSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function buildDefaultExtensions(): StoredDesktopSettingsExtensions {
  return {
    notifications: { ...DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.notifications },
    attention: { ...DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.attention },
    island: { ...DEFAULT_DESKTOP_SETTINGS_EXTENSIONS.island },
  };
}

function buildDefaultExtensionDocument(): PersistedExtensionDocument {
  return { version: 1, settings: buildDefaultExtensions() };
}

function parseExtensionPatch(input: unknown): DesktopSettingsExtensionsPatch {
  if (!isRecord(input)) return {};
  const patch: DesktopSettingsExtensionsPatch = {};

  if (isRecord(input.notifications) && typeof input.notifications.enabled === "boolean") {
    patch.notifications = { enabled: input.notifications.enabled };
  }
  if (
    isRecord(input.attention) &&
    typeof input.attention.soundVolume === "number" &&
    Number.isFinite(input.attention.soundVolume)
  ) {
    patch.attention = {
      soundVolume: Math.min(1, Math.max(0, input.attention.soundVolume)),
    };
  }
  if (isRecord(input.island)) {
    const islandPatch: DesktopSettingsExtensionsPatch["island"] = {};
    if (typeof input.island.enabled === "boolean") islandPatch.enabled = input.island.enabled;
    if (typeof input.island.showWhenFocused === "boolean") {
      islandPatch.showWhenFocused = input.island.showWhenFocused;
    }
    if (Object.keys(islandPatch).length > 0) patch.island = islandPatch;
  }
  return patch;
}

function mergeExtensions(
  current: StoredDesktopSettingsExtensions,
  patch: DesktopSettingsExtensionsPatch,
): StoredDesktopSettingsExtensions {
  return {
    ...current,
    notifications: { ...current.notifications, ...patch.notifications },
    attention: { ...current.attention, ...patch.attention },
    island: { ...current.island, ...patch.island },
  };
}

async function readLegacyExtensions(userDataPath: string) {
  try {
    const raw = JSON.parse(
      await readFile(path.join(userDataPath, LEGACY_SETTINGS_FILENAME), "utf8"),
    ) as unknown;
    return ExtensionSettingsSchema.parse(
      isRecord(raw) && isRecord(raw.settings) ? raw.settings : {},
    );
  } catch {
    return buildDefaultExtensions();
  }
}

function createDesktopSettingsExtensionStore({ userDataPath }: { userDataPath: string }) {
  const filePath = path.join(userDataPath, EXTENSION_SETTINGS_FILENAME);
  let cachedDocument: PersistedExtensionDocument | null = null;
  let persistQueue: Promise<void> = Promise.resolve();

  async function persist(document: PersistedExtensionDocument): Promise<void> {
    const write = async () => {
      await mkdir(userDataPath, { recursive: true });
      const tempFilePath = `${filePath}.tmp.${process.pid}.${randomUUID()}`;
      await writeFile(tempFilePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      await rename(tempFilePath, filePath);
      cachedDocument = document;
    };
    const queued = persistQueue.then(write, write);
    persistQueue = queued.catch(() => undefined);
    await queued;
  }

  async function load(): Promise<PersistedExtensionDocument> {
    if (cachedDocument) return cachedDocument;
    try {
      cachedDocument = PersistedExtensionDocumentSchema.parse(
        JSON.parse(await readFile(filePath, "utf8")),
      );
      return cachedDocument;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
      const document = { version: 1 as const, settings: await readLegacyExtensions(userDataPath) };
      await persist(document);
      return document;
    }
  }

  return {
    async get() {
      return (await load()).settings;
    },
    async patch(input: unknown) {
      const current = await load();
      const next = mergeExtensions(current.settings, parseExtensionPatch(input));
      await persist({ ...current, settings: next });
      return next;
    },
  };
}

function mergeDesktopSettings(
  base: DesktopSettings,
  extensions: DesktopSettingsExtensions,
): ExtendedDesktopSettings {
  return {
    ...base,
    notifications: { ...base.notifications, enabled: extensions.notifications.enabled },
    attention: extensions.attention,
    island: extensions.island,
  };
}

export function createExtendedDesktopSettingsStore({
  userDataPath,
}: {
  userDataPath: string;
}): ExtendedDesktopSettingsStore {
  const baseStore: DesktopSettingsStore = createDesktopSettingsStore({ userDataPath });
  const extensionStore = createDesktopSettingsExtensionStore({ userDataPath });
  return {
    async get() {
      const [base, extensions] = await Promise.all([baseStore.get(), extensionStore.get()]);
      return mergeDesktopSettings(base, extensions);
    },
    async patch(patch) {
      const [base, extensions] = await Promise.all([
        baseStore.patch(patch),
        extensionStore.patch(patch),
      ]);
      return mergeDesktopSettings(base, extensions);
    },
    async migrateLegacyRendererSettings(legacySettings) {
      const [base, extensions] = await Promise.all([
        baseStore.migrateLegacyRendererSettings(legacySettings),
        extensionStore.get(),
      ]);
      return mergeDesktopSettings(base, extensions);
    },
  };
}
