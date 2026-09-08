import type { LarkBotApplicationRequirements } from "@getpaseo/protocol/channel/lark/rpc-schemas";

export const PASEO_LARK_ALERT_TROUBLESHOOTER_TENANT_SCOPES = [
  // Create the daily Base node below the configured Wiki root.
  "wiki:node:create",
  // Inspect the default table created with the daily Base.
  "base:table:read",
  // Replace generated Base surfaces with the canonical attribution table.
  "base:table:create",
  "base:table:delete",
  "base:table:update",
  "base:dashboard:read",
  "base:dashboard:delete",
  "base:workflow:read",
  "base:workflow:update",
  // Inspect and create the fields used by the troubleshooting queue.
  "base:field:read",
  "base:field:create",
  // Persist, claim, update, and resume troubleshooting records.
  "base:record:create",
  "base:record:read",
  "base:record:update",
] as const;

export const PASEO_LARK_ALERT_TROUBLESHOOTER_USER_SCOPES = [
  // Resolve and enumerate the configured Wiki root with the authorized user's
  // resource visibility. Daily node creation and Base writes use bot identity.
  "wiki:wiki:readonly",
] as const;

/**
 * Keep the one-click application request aligned with the OpenAPI calls made by
 * the Lark channel. The registration page silently ignores unknown names, so
 * every item here must map to a capability used by Paseo.
 */
export const PASEO_LARK_TENANT_SCOPES = [
  ...PASEO_LARK_ALERT_TROUBLESHOOTER_TENANT_SCOPES,
  // Resolve users by email/open_id and display their complete identity.
  "contact:user.base:readonly",
  "contact:user.email:readonly",
  "contact:user.id:readonly",
  // Read chat metadata and discover the bots already present in a group.
  "im:chat.members:bot_access",
  "im:chat.members:read",
  "im:chat:read",
  // Receive private/group messages, including messages sent by peer bots.
  "im:message.group_at_msg.include_bot:readonly",
  "im:message.group_msg",
  "im:message.group_msg.include_bot:read",
  "im:message.p2p_msg",
  // Load message/thread history and reply as the application bot.
  "im:message:readonly",
  "im:message:send_as_bot",
] as const;

export const PASEO_LARK_USER_SCOPES = [
  ...PASEO_LARK_ALERT_TROUBLESHOOTER_USER_SCOPES,
  // Keep user authorization renewable without asking for an environment token.
  "offline_access",
  // Create the three-party relay group used by substitute-mode private-message handling.
  "im:chat:create_by_user",
  // Read relay chats and add the application bot with the user's identity.
  "im:chat.members:write_only",
  "im:chat:read",
  // Read group context and scan the authorized user's private messages.
  "im:message.group_msg:get_as_user",
  "im:message.p2p_msg:get_as_user",
  // The search API returns message IDs; reading each message body with a user token
  // additionally requires this user-identity permission.
  "im:message:readonly",
  "search:message",
] as const;

export const PASEO_LARK_CHAT_LOOKUP_USER_SCOPES = [
  // Keep the lookup grant renewable without forcing unrelated substitute-mode scopes.
  "offline_access",
  // Search and inspect groups visible to the authorized user.
  "im:chat:read",
] as const;

export const PASEO_LARK_USER_LOOKUP_USER_SCOPES = [
  "offline_access",
  // Search visible users by name when configuring an open_id audience rule.
  "search:user",
] as const;

export const PASEO_LARK_PRIVATE_MESSAGE_SCAN_USER_SCOPES = [
  "offline_access",
  "im:message.p2p_msg:get_as_user",
  "im:message:readonly",
  "search:message",
] as const;

export const PASEO_LARK_EVENT_SUBSCRIPTIONS = ["im.message.receive_v1"] as const;

/**
 * Interactive card callbacks share the same WebSocket subscription as message
 * events. Pre-authorizing the callback prevents a later manual developer-console
 * step when a Paseo workflow or plugin adds actions to a Lark card.
 */
export const PASEO_LARK_CALLBACK_ALLOWLIST = ["card.action.trigger"] as const;

function uniqueSorted(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

export function buildLarkBotApplicationRequirements(): LarkBotApplicationRequirements {
  return {
    tenantScopes: uniqueSorted(PASEO_LARK_TENANT_SCOPES),
    userScopes: uniqueSorted([...PASEO_LARK_USER_SCOPES, ...PASEO_LARK_USER_LOOKUP_USER_SCOPES]),
    events: uniqueSorted(PASEO_LARK_EVENT_SUBSCRIPTIONS),
    callbacks: uniqueSorted(PASEO_LARK_CALLBACK_ALLOWLIST),
  };
}

export function buildLarkBotApplicationAddons(
  requirements: LarkBotApplicationRequirements = buildLarkBotApplicationRequirements(),
): {
  scopes: { tenant: string[]; user: string[] };
  events: { items: { tenant: string[] } };
  callbacks: { items: string[] };
} {
  return {
    scopes: {
      tenant: [...requirements.tenantScopes],
      user: [...requirements.userScopes],
    },
    events: { items: { tenant: [...requirements.events] } },
    callbacks: { items: [...requirements.callbacks] },
  };
}
