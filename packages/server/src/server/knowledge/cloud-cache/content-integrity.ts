import { createHash } from "node:crypto";

export function hashCloudDocumentContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function isCloudDocumentContentValid(content: string, expectedHash: string): boolean {
  return hashCloudDocumentContent(content) === expectedHash;
}
