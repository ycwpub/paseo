import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PluginManifestSchema, type PluginManifest } from "@getpaseo/protocol/messages";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../private-files.js";

const PLUGIN_STORE_VERSION = 1;

const MarketplaceRecordSchema = z.object({
  id: z.string(),
  path: z.string(),
  addedAt: z.number(),
});

const InstalledPluginRecordSchema = z.object({
  id: z.string(),
  marketplaceId: z.string().optional(),
  sourcePath: z.string(),
  cachePath: z.string(),
  manifest: PluginManifestSchema,
  enabled: z.boolean(),
  skillIds: z.array(z.string()),
  mcpServerIds: z.array(z.string()),
  skillEnabled: z.record(z.string(), z.boolean()),
  mcpEnabled: z.record(z.string(), z.boolean()),
  installedAt: z.number(),
  updatedAt: z.number(),
});

const PluginStorePayloadSchema = z.object({
  version: z.literal(PLUGIN_STORE_VERSION),
  marketplaces: z.array(MarketplaceRecordSchema),
  installed: z.array(InstalledPluginRecordSchema),
});

export type MarketplaceRecord = z.infer<typeof MarketplaceRecordSchema>;
export type InstalledPluginRecord = z.infer<typeof InstalledPluginRecordSchema>;
type PluginStorePayload = z.infer<typeof PluginStorePayloadSchema>;

function createDefaultPayload(): PluginStorePayload {
  return { version: PLUGIN_STORE_VERSION, marketplaces: [], installed: [] };
}

function clonePayload(payload: PluginStorePayload): PluginStorePayload {
  return PluginStorePayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
}

export class PluginStore {
  private readonly filePath: string;
  private loaded = false;
  private payload: PluginStorePayload = createDefaultPayload();

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "plugins", "catalog.json");
  }

  listMarketplaces(): MarketplaceRecord[] {
    this.ensureLoaded();
    return clonePayload(this.payload).marketplaces;
  }

  upsertMarketplace(record: MarketplaceRecord): MarketplaceRecord {
    this.ensureLoaded();
    const parsed = MarketplaceRecordSchema.parse(record);
    const marketplaces = this.payload.marketplaces.filter((entry) => entry.id !== parsed.id);
    marketplaces.push(parsed);
    this.persist({ ...this.payload, marketplaces });
    return parsed;
  }

  removeMarketplace(id: string): boolean {
    this.ensureLoaded();
    const marketplaces = this.payload.marketplaces.filter((entry) => entry.id !== id);
    if (marketplaces.length === this.payload.marketplaces.length) return false;
    this.persist({ ...this.payload, marketplaces });
    return true;
  }

  listInstalled(): InstalledPluginRecord[] {
    this.ensureLoaded();
    return clonePayload(this.payload).installed;
  }

  getInstalled(id: string): InstalledPluginRecord | null {
    this.ensureLoaded();
    return this.payload.installed.find((entry) => entry.id === id) ?? null;
  }

  upsertInstalled(record: InstalledPluginRecord): InstalledPluginRecord {
    this.ensureLoaded();
    const parsed = InstalledPluginRecordSchema.parse(record);
    const installed = this.payload.installed.filter((entry) => entry.id !== parsed.id);
    installed.push(parsed);
    this.persist({ ...this.payload, installed });
    return parsed;
  }

  removeInstalled(id: string): boolean {
    this.ensureLoaded();
    const installed = this.payload.installed.filter((entry) => entry.id !== id);
    if (installed.length === this.payload.installed.length) return false;
    this.persist({ ...this.payload, installed });
    return true;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (!existsSync(this.filePath)) {
      this.loaded = true;
      return;
    }
    ensurePrivateFile(this.filePath);
    this.payload = PluginStorePayloadSchema.parse(
      JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
    );
    this.loaded = true;
  }

  private persist(payload: PluginStorePayload): void {
    const parsed = PluginStorePayloadSchema.parse(payload);
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(parsed, null, 2));
    this.payload = parsed;
    this.loaded = true;
  }
}

export function pluginAuthorName(manifest: PluginManifest): string | undefined {
  if (typeof manifest.author === "string") return manifest.author;
  return manifest.author?.name;
}
