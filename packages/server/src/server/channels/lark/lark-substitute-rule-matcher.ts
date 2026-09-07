import type {
  LarkDirectory,
  LarkSubstituteAudienceConversationRule,
  LarkSubstituteAudienceRuleGroup,
  LarkSubstituteAudienceUserRule,
  LarkSubstituteMode,
} from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { getLarkSubstituteRuleLists } from "./lark-substitute-rule-lists.js";

export interface MatchedLarkSubstituteMode {
  mode: LarkSubstituteMode;
  substituteUser: {
    openId: string;
    name: string | null;
    email: string | null;
  };
  questionAllowRules: string[];
  questionDenyRules: string[];
  groupAllowRules: string[];
  groupDenyRules: string[];
  groupContext: {
    chatId: string;
    name: string | null;
  } | null;
}

function getLocalTimeParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  const weekday = weekdayIndex === 0 ? 7 : Math.max(weekdayIndex, 1);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { weekday: Math.max(weekday, 0), minutes: hour * 60 + minute };
}

function parseMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function isLarkSubstituteModeActive(mode: LarkSubstituteMode, now: Date): boolean {
  if (mode.activeTimeRanges.length === 0) return true;
  return mode.activeTimeRanges.some((range) => {
    const local = getLocalTimeParts(now, range.timezone);
    const start = parseMinutes(range.startTime);
    const end = parseMinutes(range.endTime);
    if (start === end) return range.weekdays.includes(local.weekday);
    if (start < end) {
      return (
        range.weekdays.includes(local.weekday) && local.minutes >= start && local.minutes < end
      );
    }
    const previousWeekday = local.weekday === 1 ? 7 : local.weekday - 1;
    return (
      (range.weekdays.includes(local.weekday) && local.minutes >= start) ||
      (range.weekdays.includes(previousWeekday) && local.minutes < end)
    );
  });
}

function findDirectoryUser(
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): LarkDirectory["users"][number] | undefined {
  return directory?.users.find((entry) => entry.appId === appId && entry.openId === event.openId);
}

function normalizeIdentity(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function isBotSender(event: NormalizedLarkMessageEvent): boolean {
  const senderType = event.senderType?.trim().toLocaleLowerCase();
  return senderType === "app" || senderType === "bot";
}

function matchesUserRule(
  rule: LarkSubstituteAudienceUserRule,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
  const botSender = isBotSender(event);
  if (rule.type === "all") return true;
  if (rule.type === "all_bots") return botSender;
  if (rule.type === "bot_app_id") {
    return botSender && normalizeIdentity(rule.appId) === normalizeIdentity(event.senderAppId);
  }
  if (rule.type === "bot_name") {
    return botSender && normalizeIdentity(rule.name) === normalizeIdentity(event.displayName);
  }
  if (botSender) return false;
  if (rule.type === "all_users") return true;
  if (rule.type === "user_open_id") return rule.openId === event.openId;
  if (rule.openId && rule.openId === event.openId) return true;
  const user = findDirectoryUser(event, directory, appId);
  if (rule.type === "user_email") {
    return normalizeIdentity(rule.email) === normalizeIdentity(user?.email);
  }
  return [event.displayName, user?.displayName].some(
    (name) => normalizeIdentity(rule.name) === normalizeIdentity(name),
  );
}

function matchesConversationRule(
  rule: Exclude<LarkSubstituteAudienceConversationRule, { type: "group_ai_category" }>,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
  const group = isGroup(event);
  if (rule.type === "all") return true;
  if (rule.type === "bot") return isBotSender(event);
  if (rule.type === "private") return !group && !isBotSender(event);
  if (!group) return false;
  if (rule.type === "all_groups") return true;
  const chat = directory?.chats.find(
    (entry) => entry.appId === appId && entry.chatId === event.chatId,
  );
  if (rule.type === "group") {
    return (
      rule.chatId === event.chatId ||
      Boolean(rule.groupId && (rule.groupId === chat?.groupId || rule.groupId === event.chatId))
    );
  }
  try {
    return Boolean(chat?.name && new RegExp(rule.pattern, "u").test(chat.name));
  } catch {
    return false;
  }
}

function matchesRuleGroupUser(
  group: LarkSubstituteAudienceRuleGroup,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
  return group.userRules.some((rule) => matchesUserRule(rule, event, directory, appId));
}

function isGroup(event: NormalizedLarkMessageEvent): boolean {
  return event.chatType?.toLowerCase() !== "p2p";
}

function getGroupContext(
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): MatchedLarkSubstituteMode["groupContext"] {
  if (!isGroup(event)) return null;
  const chat = directory?.chats.find(
    (entry) => entry.appId === appId && entry.chatId === event.chatId,
  );
  return {
    chatId: event.chatId,
    name: chat?.name?.trim() || null,
  };
}

function modeIsTriggered(authorizedUserOpenId: string, event: NormalizedLarkMessageEvent): boolean {
  if (!isGroup(event) && !isBotSender(event)) return true;
  return (event.mentions ?? []).some((mention) => mention.openId === authorizedUserOpenId);
}

interface AudienceGroupEvaluation {
  staticMatch: boolean;
  aiRules: string[];
}

function evaluateRuleGroupConversation(
  group: LarkSubstituteAudienceRuleGroup,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): AudienceGroupEvaluation {
  const staticMatch = group.conversationRules
    .filter(
      (
        rule,
      ): rule is Exclude<LarkSubstituteAudienceConversationRule, { type: "group_ai_category" }> =>
        rule.type !== "group_ai_category",
    )
    .some((rule) => matchesConversationRule(rule, event, directory, appId));
  const aiRules = isGroup(event)
    ? group.conversationRules.flatMap((rule) =>
        rule.type === "group_ai_category" ? [rule.description] : [],
      )
    : [];
  return { staticMatch, aiRules };
}

function evaluateRuleGroups(
  groups: readonly LarkSubstituteAudienceRuleGroup[],
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): { hasStaticMatch: boolean; aiRules: string[] } {
  let hasStaticMatch = false;
  const aiRules: string[] = [];
  for (const group of groups) {
    if (!matchesRuleGroupUser(group, event, directory, appId)) continue;
    const conversation = evaluateRuleGroupConversation(group, event, directory, appId);
    hasStaticMatch ||= conversation.staticMatch;
    aiRules.push(...conversation.aiRules);
  }
  return { hasStaticMatch, aiRules };
}

function evaluateAudienceRules(
  rules: ReturnType<typeof getLarkSubstituteRuleLists>,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): { passes: boolean; groupAllowRules: string[]; groupDenyRules: string[] } {
  const deny = evaluateRuleGroups(rules.audienceDenyRuleGroups, event, directory, appId);
  if (deny.hasStaticMatch) {
    return { passes: false, groupAllowRules: [], groupDenyRules: [] };
  }
  const allow = evaluateRuleGroups(rules.audienceAllowRuleGroups, event, directory, appId);
  if (!allow.hasStaticMatch && allow.aiRules.length === 0) {
    return { passes: false, groupAllowRules: [], groupDenyRules: [] };
  }
  return {
    passes: true,
    groupAllowRules: allow.hasStaticMatch ? [] : Array.from(new Set(allow.aiRules)),
    groupDenyRules: Array.from(new Set(deny.aiRules)),
  };
}

export function matchLarkSubstituteMode(input: {
  modes: readonly LarkSubstituteMode[];
  botId: string;
  appId: string | null;
  event: NormalizedLarkMessageEvent;
  directory: LarkDirectory | null;
  authorizedUser: {
    openId: string;
    name: string | null;
    email: string | null;
  } | null;
  now?: Date;
}): MatchedLarkSubstituteMode | null {
  if (!input.authorizedUser?.openId) return null;
  const now = input.now ?? new Date();
  for (const mode of input.modes) {
    const ruleLists = getLarkSubstituteRuleLists(mode);
    const audience = evaluateAudienceRules(ruleLists, input.event, input.directory, input.appId);
    if (
      !mode.enabled ||
      mode.botId !== input.botId ||
      !modeIsTriggered(input.authorizedUser.openId, input.event) ||
      !isLarkSubstituteModeActive(mode, now) ||
      !audience.passes
    ) {
      continue;
    }
    return {
      mode,
      substituteUser: input.authorizedUser,
      questionAllowRules: ruleLists.questionAllowlist.map((rule) => rule.description),
      questionDenyRules: ruleLists.questionDenylist.map((rule) => rule.description),
      groupAllowRules: audience.groupAllowRules,
      groupDenyRules: audience.groupDenyRules,
      groupContext: getGroupContext(input.event, input.directory, input.appId),
    };
  }
  return null;
}
