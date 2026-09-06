import type {
  LarkSubstituteAudienceRule,
  LarkDirectory,
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

function matchesUserRule(
  rule: Extract<LarkSubstituteAudienceRule, { type: "user" }>,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
  const user = directory?.users.find(
    (entry) => entry.appId === appId && entry.openId === event.openId,
  );
  const normalizedName = event.displayName.trim().toLocaleLowerCase();
  if (rule.openId) return rule.openId === event.openId;
  if (rule.email && user?.email) {
    return rule.email.trim().toLocaleLowerCase() === user.email.trim().toLocaleLowerCase();
  }
  return Boolean(rule.name && rule.name.trim().toLocaleLowerCase() === normalizedName);
}

function matchesGroupRule(
  rule: Extract<LarkSubstituteAudienceRule, { type: "group" | "group_name_regex" }>,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
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

function matchesIdentityRule(
  rule: LarkSubstituteAudienceRule,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
  if (rule.type === "all") return true;
  if (rule.type === "group_ai_category") return false;
  if (rule.type === "user") return matchesUserRule(rule, event, directory, appId);
  return matchesGroupRule(rule, event, directory, appId);
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
  if (!isGroup(event)) return true;
  return (event.mentions ?? []).some((mention) => mention.openId === authorizedUserOpenId);
}

function evaluateAudienceRules(
  rules: ReturnType<typeof getLarkSubstituteRuleLists>,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): { passes: boolean; groupAllowRules: string[]; groupDenyRules: string[] } {
  const staticDenyRules = rules.audienceDenylist.filter(
    (rule) => rule.type !== "group_ai_category",
  );
  if (staticDenyRules.some((rule) => matchesIdentityRule(rule, event, directory, appId))) {
    return { passes: false, groupAllowRules: [], groupDenyRules: [] };
  }
  const staticAllowRules = rules.audienceAllowlist.filter(
    (rule) => rule.type !== "group_ai_category",
  );
  const hasStaticAllowMatch = staticAllowRules.some((rule) =>
    matchesIdentityRule(rule, event, directory, appId),
  );
  const groupAllowRules = rules.audienceAllowlist.flatMap((rule) =>
    rule.type === "group_ai_category" ? [rule.description] : [],
  );
  const groupDenyRules = rules.audienceDenylist.flatMap((rule) =>
    rule.type === "group_ai_category" ? [rule.description] : [],
  );
  const hasAllowRules = rules.audienceAllowlist.length > 0;
  if (hasAllowRules && !hasStaticAllowMatch && (!isGroup(event) || groupAllowRules.length === 0)) {
    return { passes: false, groupAllowRules: [], groupDenyRules: [] };
  }
  return {
    passes: true,
    groupAllowRules: hasStaticAllowMatch ? [] : groupAllowRules,
    groupDenyRules: isGroup(event) ? groupDenyRules : [],
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
