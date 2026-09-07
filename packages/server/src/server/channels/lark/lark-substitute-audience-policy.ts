import type { LarkSubstituteAudienceRule, LarkSubstituteMode } from "@getpaseo/protocol/messages";
import { getLarkSubstituteRuleLists } from "./lark-substitute-rule-lists.js";

export function isPrivateSubstituteAudienceRule(rule: LarkSubstituteAudienceRule): boolean {
  return rule.type === "user" || rule.type === "all";
}

export function isGroupSubstituteAudienceRule(rule: LarkSubstituteAudienceRule): boolean {
  return (
    rule.type === "group" ||
    rule.type === "group_name_regex" ||
    rule.type === "group_ai_category" ||
    rule.type === "all"
  );
}

export function hasPrivateSubstituteAudienceAllowlist(mode: LarkSubstituteMode): boolean {
  return getLarkSubstituteRuleLists(mode).audienceAllowlist.some(isPrivateSubstituteAudienceRule);
}

export function hasGroupSubstituteAudienceAllowlist(mode: LarkSubstituteMode): boolean {
  return getLarkSubstituteRuleLists(mode).audienceAllowlist.some(isGroupSubstituteAudienceRule);
}
