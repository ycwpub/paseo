import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../private-files.js";

const ENCRYPTED_PREFIX = "PASEO_MEMORY_ENCRYPTED_V1\n";

interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

export class MemoryContentCipher {
  private readonly keyPath: string;
  private key: Buffer | null = null;

  constructor(memoryRoot: string) {
    this.keyPath = path.join(memoryRoot, "content.key");
  }

  encode(value: string, encrypted: boolean): string {
    if (!encrypted) {
      return value;
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const payload: EncryptedPayload = {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    return `${ENCRYPTED_PREFIX}${JSON.stringify(payload)}`;
  }

  decode(value: string): string {
    if (!value.startsWith(ENCRYPTED_PREFIX)) {
      return value;
    }
    const payload = JSON.parse(value.slice(ENCRYPTED_PREFIX.length)) as EncryptedPayload;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.getKey(),
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
  }

  private getKey(): Buffer {
    if (this.key) {
      return this.key;
    }
    if (existsSync(this.keyPath)) {
      ensurePrivateFile(this.keyPath);
      this.key = Buffer.from(readFileSync(this.keyPath, "utf8").trim(), "base64");
    } else {
      this.key = randomBytes(32);
      writePrivateFileAtomicSync(this.keyPath, this.key.toString("base64"));
    }
    if (this.key.length !== 32) {
      throw new Error(`Invalid Paseo memory encryption key: ${this.keyPath}`);
    }
    return this.key;
  }
}
