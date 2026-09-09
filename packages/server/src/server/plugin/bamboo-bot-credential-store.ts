import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../private-files.js";

const BambooBotCredentialSchema = z.object({
  credentialId: z.string().min(1),
  appId: z.string().min(1),
  appSecret: z.string().min(1),
});

const BambooBotCredentialStoreSchema = z.object({
  version: z.literal(1),
  credentials: z.array(BambooBotCredentialSchema),
});

export type BambooBotCredential = z.infer<typeof BambooBotCredentialSchema>;

export class BambooBotCredentialStore {
  private readonly filePath: string;
  private loaded = false;
  private credentials = new Map<string, BambooBotCredential>();

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "plugins", "bamboo-troubleshooter-credentials.json");
  }

  get(credentialId: string): BambooBotCredential | null {
    this.ensureLoaded();
    const credential = this.credentials.get(credentialId);
    return credential ? { ...credential } : null;
  }

  configure(input: {
    credentialId: string;
    appId: string;
    appSecret?: string;
  }): BambooBotCredential {
    this.ensureLoaded();
    const credentialId = input.credentialId.trim();
    const appId = input.appId.trim();
    const previous = this.credentials.get(credentialId);
    const appSecret =
      input.appSecret?.trim() || (previous?.appId === appId ? previous.appSecret : "");
    if (!credentialId || !appId || !appSecret) {
      throw new Error("自定义 Bamboo 飞书机器人需要填写 App ID 和 App Secret");
    }
    const credential = BambooBotCredentialSchema.parse({ credentialId, appId, appSecret });
    this.credentials.set(credentialId, credential);
    this.persist();
    return { ...credential };
  }

  delete(credentialId: string): boolean {
    this.ensureLoaded();
    const deleted = this.credentials.delete(credentialId);
    if (deleted) this.persist();
    return deleted;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(this.filePath)) return;
    ensurePrivateFile(this.filePath);
    const parsed = BambooBotCredentialStoreSchema.parse(
      JSON.parse(readFileSync(this.filePath, "utf8")),
    );
    this.credentials = new Map(
      parsed.credentials.map((credential) => [credential.credentialId, credential]),
    );
  }

  private persist(): void {
    const payload = BambooBotCredentialStoreSchema.parse({
      version: 1,
      credentials: [...this.credentials.values()],
    });
    writePrivateFileAtomicSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
}
