import type { LarkDirectoryChat, LarkSubstituteMode } from "@getpaseo/protocol/messages";
import { hasGroupSubstituteAudienceAllowlist } from "./lark-substitute-audience-policy.js";
import {
  getLarkSubstituteConversationRules,
  getLarkSubstituteRuleLists,
} from "./lark-substitute-rule-lists.js";

export interface LarkSubstituteGroupScanChat {
  chatId: string;
  name: string | null;
}

function matchesRegex(name: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, "u").test(name);
  } catch {
    return false;
  }
}

export function selectLarkSubstituteGroupScanChats(
  mode: LarkSubstituteMode,
  appId: string | null | undefined,
  directoryChats: readonly LarkDirectoryChat[],
): LarkSubstituteGroupScanChat[] {
  if (!hasGroupSubstituteAudienceAllowlist(mode)) return [];
  const selected = new Map<string, LarkSubstituteGroupScanChat>();
  const groups = getLarkSubstituteRuleLists(mode).audienceAllowRuleGroups;
  const rules = getLarkSubstituteConversationRules(groups);
  for (const rule of rules) {
    if (rule.type === "group") {
      selected.set(rule.chatId, { chatId: rule.chatId, name: rule.name });
    }
  }
  if (!appId) return [...selected.values()];

  const includeEveryKnownChat = rules.some(
    (rule) =>
      rule.type === "all_groups" ||
      rule.type === "group_ai_category" ||
      rule.type === "bot" ||
      rule.type === "all",
  );
  const regexRules = rules.filter((rule) => rule.type === "group_name_regex");
  for (const chat of directoryChats) {
    if (chat.appId !== appId) continue;
    if (includeEveryKnownChat || regexRules.some((rule) => matchesRegex(chat.name, rule.pattern))) {
      selected.set(chat.chatId, { chatId: chat.chatId, name: chat.name });
    }
  }
  return [...selected.values()];
}
