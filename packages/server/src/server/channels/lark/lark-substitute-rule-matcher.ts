import type {
  LarkDirectory,
  LarkSubstituteMode,
  LarkSubstituteRule,
} from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

export interface MatchedLarkSubstituteMode {
  mode: LarkSubstituteMode;
  questionAllowRules: string[];
  questionDenyRules: string[];
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
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
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
    const previousWeekday = (local.weekday + 6) % 7;
    return (
      (range.weekdays.includes(local.weekday) && local.minutes >= start) ||
      (range.weekdays.includes(previousWeekday) && local.minutes < end)
    );
  });
}

function matchesUserRule(
  rule: Extract<LarkSubstituteRule, { type: "user" }>,
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
  rule: Exclude<LarkSubstituteRule, { type: "user" | "question_type" }>,
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
  rule: LarkSubstituteRule,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
  if (rule.type === "question_type") return false;
  if (rule.type === "user") return matchesUserRule(rule, event, directory, appId);
  return matchesGroupRule(rule, event, directory, appId);
}

function isGroup(event: NormalizedLarkMessageEvent): boolean {
  return event.chatType?.toLowerCase() !== "p2p";
}

function modeIsTriggered(mode: LarkSubstituteMode, event: NormalizedLarkMessageEvent): boolean {
  if (!isGroup(event)) return true;
  return (event.mentions ?? []).some((mention) => mention.openId === mode.substituteUser.openId);
}

function passesIdentityRules(
  mode: LarkSubstituteMode,
  event: NormalizedLarkMessageEvent,
  directory: LarkDirectory | null,
  appId: string | null,
): boolean {
  const denyIdentityRules = mode.denylist.filter((rule) => rule.type !== "question_type");
  if (denyIdentityRules.some((rule) => matchesIdentityRule(rule, event, directory, appId))) {
    return false;
  }
  const allowIdentityRules = mode.allowlist.filter((rule) => rule.type !== "question_type");
  return (
    allowIdentityRules.length === 0 ||
    allowIdentityRules.some((rule) => matchesIdentityRule(rule, event, directory, appId))
  );
}

export function matchLarkSubstituteMode(input: {
  modes: readonly LarkSubstituteMode[];
  botId: string;
  appId: string | null;
  event: NormalizedLarkMessageEvent;
  directory: LarkDirectory | null;
  now?: Date;
}): MatchedLarkSubstituteMode | null {
  const now = input.now ?? new Date();
  for (const mode of input.modes) {
    if (
      !mode.enabled ||
      mode.botId !== input.botId ||
      !modeIsTriggered(mode, input.event) ||
      !isLarkSubstituteModeActive(mode, now) ||
      !passesIdentityRules(mode, input.event, input.directory, input.appId)
    ) {
      continue;
    }
    return {
      mode,
      questionAllowRules: mode.allowlist.flatMap((rule) =>
        rule.type === "question_type" ? [rule.description] : [],
      ),
      questionDenyRules: mode.denylist.flatMap((rule) =>
        rule.type === "question_type" ? [rule.description] : [],
      ),
    };
  }
  return null;
}
