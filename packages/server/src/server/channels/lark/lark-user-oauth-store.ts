import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";

const LARK_USER_OAUTH_STORE_VERSION = 1;

const StoredLarkUserOAuthCredentialSchema = z.object({
  appId: z.string().min(1),
  userAccessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string(),
  refreshTokenExpiresAt: z.string().nullable(),
  scope: z.string().nullable(),
  openId: z.string().nullable(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  authorizedAt: z.string(),
  updatedAt: z.string(),
});

const LarkUserOAuthStorePayloadSchema = z.object({
  version: z.literal(LARK_USER_OAUTH_STORE_VERSION),
  credentials: z.array(StoredLarkUserOAuthCredentialSchema),
});

export type StoredLarkUserOAuthCredential = z.infer<typeof StoredLarkUserOAuthCredentialSchema>;

export class LarkUserOAuthStore {
  private readonly filePath: string;
  private credentials = new Map<string, StoredLarkUserOAuthCredential>();

  constructor(options: { paseoHome: string }) {
    this.filePath = path.join(options.paseoHome, "channels", "lark-user-oauth.json");
    this.load();
  }

  get(appId: string): StoredLarkUserOAuthCredential | null {
    return this.credentials.get(appId.trim()) ?? null;
  }

  set(credential: StoredLarkUserOAuthCredential): void {
    const parsed = StoredLarkUserOAuthCredentialSchema.parse(credential);
    this.credentials.set(parsed.appId, parsed);
    this.persist();
  }

  delete(appId: string): void {
    if (!this.credentials.delete(appId.trim())) return;
    this.persist();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    ensurePrivateFile(this.filePath);
    try {
      const parsed = LarkUserOAuthStorePayloadSchema.parse(
        JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
      );
      this.credentials = new Map(parsed.credentials.map((entry) => [entry.appId, entry]));
    } catch {
      this.credentials.clear();
    }
  }

  private persist(): void {
    const payload = LarkUserOAuthStorePayloadSchema.parse({
      version: LARK_USER_OAUTH_STORE_VERSION,
      credentials: [...this.credentials.values()],
    });
    writePrivateFileAtomicSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
}
