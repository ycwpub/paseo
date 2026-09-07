import type {
  LarkSubstituteAudienceConversationRule,
  LarkSubstituteMode,
} from "@getpaseo/protocol/messages";
import { getLarkSubstituteRuleLists } from "./lark-substitute-rule-lists.js";

export function isPrivateSubstituteAudienceRule(
  rule: LarkSubstituteAudienceConversationRule,
): boolean {
  return rule.type === "private" || rule.type === "all";
}

export function isGroupSubstituteAudienceRule(
  rule: LarkSubstituteAudienceConversationRule,
): boolean {
  return (
    rule.type === "group" ||
    rule.type === "group_name_regex" ||
    rule.type === "group_ai_category" ||
    rule.type === "all_groups" ||
    rule.type === "bot" ||
    rule.type === "all"
  );
}

export function hasPrivateSubstituteAudienceAllowlist(mode: LarkSubstituteMode): boolean {
  return getLarkSubstituteRuleLists(mode).audienceAllowRuleGroups.some((group) =>
    group.conversationRules.some(isPrivateSubstituteAudienceRule),
  );
}

export function hasGroupSubstituteAudienceAllowlist(mode: LarkSubstituteMode): boolean {
  return getLarkSubstituteRuleLists(mode).audienceAllowRuleGroups.some((group) =>
    group.conversationRules.some(isGroupSubstituteAudienceRule),
  );
}
