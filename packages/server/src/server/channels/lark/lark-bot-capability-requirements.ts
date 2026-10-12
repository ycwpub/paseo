import type { LarkBotApplicationRequirements } from "@getpaseo/protocol/channel/lark/rpc-schemas";

interface LarkBotCapabilityRequirements {
  tenantScopes: readonly string[];
  userScopes: readonly string[];
  events: readonly string[];
  callbacks: readonly string[];
}

function uniqueSorted(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

export const PASEO_LARK_CHANNEL_TENANT_SCOPES = [
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

export const PASEO_LARK_REMINDER_TENANT_SCOPES = [
  // Send reminders and inspect later replies without user-identity sending.
  "im:message:readonly",
  "im:message:send_as_bot",
] as const;

export const PASEO_LARK_SUBSTITUTE_TENANT_SCOPES = [
  // Inspect group membership before adding or using the substitute bot.
  "im:chat.members:bot_access",
  "im:chat.members:read",
  "im:chat:read",
  // Receive the target user's private/group messages and reply as the bot.
  "im:message.group_at_msg.include_bot:readonly",
  "im:message.group_msg",
  "im:message.group_msg.include_bot:read",
  "im:message.p2p_msg",
  "im:message:readonly",
  "im:message:send_as_bot",
] as const;

export const PASEO_LARK_SUBSTITUTE_USER_SCOPES = [
  "offline_access",
  // Create the three-party relay group used by substitute-mode private-message handling.
  "im:chat:create_by_user",
  // Read relay chats and add the application bot with the user's identity.
  "im:chat.members:write_only",
  "im:chat:read",
  // Read group context and scan the authorized user's private messages.
  "im:message.group_msg:get_as_user",
  "im:message.p2p_msg:get_as_user",
  // Search returns message IDs; loading message bodies requires this separately.
  "im:message:readonly",
  "search:message",
] as const;

export const PASEO_LARK_DIRECTORY_TENANT_SCOPES = [
  // Resolve users by email/open_id and display their complete identity.
  "contact:user.base:readonly",
  "contact:user.email:readonly",
  "contact:user.id:readonly",
] as const;

export const PASEO_LARK_DIRECTORY_USER_SCOPES = [
  "offline_access",
  // Search groups, users, and recent private-message contacts.
  "im:chat:read",
  "im:message.p2p_msg:get_as_user",
  "im:message:readonly",
  "search:message",
  "contact:user:search",
] as const;

export const PASEO_LARK_ALERT_TROUBLESHOOTER_TENANT_SCOPES = [
  // Resolve the configured Wiki root with the selected bot identity.
  "wiki:wiki:readonly",
  // Create, copy, and archive generated Base/Docx resources below the Wiki root.
  "wiki:node:create",
  "wiki:node:copy",
  "wiki:node:move",
  // Create the daily Base in Drive without Wiki-generated sample tables.
  "base:app:create",
  // Inspect the one blank table created with the daily Base.
  "base:table:read",
  // Replace the blank or legacy generated tables with the canonical attribution table.
  "base:table:create",
  "base:table:delete",
  "base:table:update",
  // Keep the canonical table view restricted to the fields used by the workflow.
  "base:view:read",
  "base:view:write_only",
  // Inspect and maintain the fields used by the troubleshooting queue.
  "base:field:read",
  "base:field:create",
  "base:field:delete",
  "base:field:update",
  // Persist, claim, update, and resume troubleshooting records.
  "base:record:create",
  "base:record:delete",
  "base:record:read",
  "base:record:update",
  // Publish, verify, and revise the final troubleshooting and SOP documents.
  "docx:document:create",
  "docx:document:readonly",
  "docx:document:write_only",
  // Read alert messages and write the final thread notification.
  "im:message:readonly",
  "im:message:send_as_bot",
] as const;

export const PASEO_LARK_ALERT_TROUBLESHOOTER_USER_SCOPES = [
  // Resolve and enumerate the configured Wiki root with the authorized user's
  // resource visibility. Daily node creation and Base writes use bot identity.
  "wiki:wiki:readonly",
] as const;

export const PASEO_LARK_EVENT_SUBSCRIPTIONS = ["im.message.receive_v1"] as const;

/**
 * Interactive card callbacks share the same WebSocket subscription as message
 * events. Pre-authorizing the callback prevents a later manual developer-console
 * step when a Paseo workflow or plugin adds actions to a Lark card.
 */
export const PASEO_LARK_CALLBACK_ALLOWLIST = ["card.action.trigger"] as const;

/**
 * This registry is the source of truth for every capability bundled with a
 * Paseo-created Lark bot. New capabilities must declare their permissions here
 * so both new-app creation and existing-app updates remain complete.
 */
export const PASEO_LARK_BOT_CAPABILITIES = {
  channel: {
    tenantScopes: PASEO_LARK_CHANNEL_TENANT_SCOPES,
    userScopes: [],
    events: PASEO_LARK_EVENT_SUBSCRIPTIONS,
    callbacks: PASEO_LARK_CALLBACK_ALLOWLIST,
  },
  reminder: {
    tenantScopes: PASEO_LARK_REMINDER_TENANT_SCOPES,
    userScopes: [],
    events: PASEO_LARK_EVENT_SUBSCRIPTIONS,
    callbacks: [],
  },
  substitute: {
    tenantScopes: PASEO_LARK_SUBSTITUTE_TENANT_SCOPES,
    userScopes: PASEO_LARK_SUBSTITUTE_USER_SCOPES,
    events: PASEO_LARK_EVENT_SUBSCRIPTIONS,
    callbacks: [],
  },
  groupMessageProcessor: {
    tenantScopes: PASEO_LARK_CHANNEL_TENANT_SCOPES,
    userScopes: [],
    events: PASEO_LARK_EVENT_SUBSCRIPTIONS,
    callbacks: [],
  },
  directory: {
    tenantScopes: PASEO_LARK_DIRECTORY_TENANT_SCOPES,
    userScopes: PASEO_LARK_DIRECTORY_USER_SCOPES,
    events: [],
    callbacks: [],
  },
  alertTroubleshooter: {
    tenantScopes: PASEO_LARK_ALERT_TROUBLESHOOTER_TENANT_SCOPES,
    userScopes: PASEO_LARK_ALERT_TROUBLESHOOTER_USER_SCOPES,
    events: PASEO_LARK_EVENT_SUBSCRIPTIONS,
    callbacks: [],
  },
} as const satisfies Record<string, LarkBotCapabilityRequirements>;

/**
 * Keep the one-click application request aligned with the OpenAPI calls made by
 * the Lark channel. The registration page silently ignores unknown names, so
 * every item here must map to a capability used by Paseo.
 */
export const PASEO_LARK_TENANT_SCOPES = uniqueSorted(
  Object.values(PASEO_LARK_BOT_CAPABILITIES).flatMap((capability) => capability.tenantScopes),
);

export const PASEO_LARK_USER_SCOPES = uniqueSorted(
  Object.values(PASEO_LARK_BOT_CAPABILITIES).flatMap((capability) => capability.userScopes),
);

export const PASEO_LARK_CHAT_LOOKUP_USER_SCOPES = [
  // Keep the lookup grant renewable without forcing unrelated substitute-mode scopes.
  "offline_access",
  // Search and inspect groups visible to the authorized user.
  "im:chat:read",
] as const;

export const PASEO_LARK_USER_LOOKUP_USER_SCOPES = [
  "offline_access",
  // Search visible users by name when configuring an open_id audience rule.
  "contact:user:search",
] as const;

export const PASEO_LARK_PRIVATE_MESSAGE_SCAN_USER_SCOPES = [
  "offline_access",
  "im:message.p2p_msg:get_as_user",
  "im:message:readonly",
  "search:message",
] as const;

export function buildLarkBotApplicationRequirements(): LarkBotApplicationRequirements {
  return {
    tenantScopes: uniqueSorted(PASEO_LARK_TENANT_SCOPES),
    userScopes: uniqueSorted(PASEO_LARK_USER_SCOPES),
    events: uniqueSorted(
      Object.values(PASEO_LARK_BOT_CAPABILITIES).flatMap((capability) => capability.events),
    ),
    callbacks: uniqueSorted(
      Object.values(PASEO_LARK_BOT_CAPABILITIES).flatMap((capability) => capability.callbacks),
    ),
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
