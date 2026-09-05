import type {
  LarkSubstituteAudienceRule,
  LarkSubstituteMode,
  LarkSubstituteQuestionRule,
} from "@getpaseo/protocol/messages";

export interface LarkSubstituteRuleLists {
  audienceAllowlist: LarkSubstituteAudienceRule[];
  audienceDenylist: LarkSubstituteAudienceRule[];
  questionAllowlist: LarkSubstituteQuestionRule[];
  questionDenylist: LarkSubstituteQuestionRule[];
}

function legacyAudienceRules(rules: LarkSubstituteMode["allowlist"]): LarkSubstituteAudienceRule[] {
  return rules.filter((rule): rule is LarkSubstituteAudienceRule => rule.type !== "question_type");
}

function legacyQuestionRules(rules: LarkSubstituteMode["allowlist"]): LarkSubstituteQuestionRule[] {
  return rules.flatMap((rule) =>
    rule.type === "question_type" ? [{ id: rule.id, description: rule.description }] : [],
  );
}

export function getLarkSubstituteRuleLists(mode: LarkSubstituteMode): LarkSubstituteRuleLists {
  return {
    audienceAllowlist: mode.audienceAllowlist ?? legacyAudienceRules(mode.allowlist),
    audienceDenylist: mode.audienceDenylist ?? legacyAudienceRules(mode.denylist),
    questionAllowlist: mode.questionAllowlist ?? legacyQuestionRules(mode.allowlist),
    questionDenylist: mode.questionDenylist ?? legacyQuestionRules(mode.denylist),
  };
}
