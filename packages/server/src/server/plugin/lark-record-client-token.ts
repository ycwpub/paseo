import { createHash } from "node:crypto";

export interface LarkRecordClientTokenInput {
  pluginId: string;
  projectId: string;
  uniqueId: string;
}

/**
 * Lark Base requires client_token to be a standard UUID v4.
 * Derive the random-looking UUID bytes from the logical record identity so retries remain idempotent.
 */
export function createLarkRecordClientToken(input: LarkRecordClientTokenInput): string {
  const digest = createHash("sha256")
    .update(input.pluginId)
    .update("\0")
    .update(input.projectId)
    .update("\0")
    .update(input.uniqueId)
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
