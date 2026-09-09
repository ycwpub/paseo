const MERGED_FORWARD_MESSAGE_ID = /^(om_[^:]+):(om_[^:]+)$/u;

/**
 * Merged-forward child messages use a synthetic `parent:child` identity for
 * deduplication. Lark reply APIs only accept the visible parent message ID.
 */
export function resolveBambooMessageReplyTarget(
  messageId: string | null | undefined,
): string | null {
  const normalized = messageId?.trim();
  if (!normalized) return null;
  return MERGED_FORWARD_MESSAGE_ID.exec(normalized)?.[1] ?? normalized;
}
