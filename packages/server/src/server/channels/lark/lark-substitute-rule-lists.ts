import type {
  LarkSubstituteAudienceConversationRule,
  LarkSubstituteAudienceRule,
  LarkSubstituteAudienceRuleGroup,
  LarkSubstituteAudienceUserRule,
  LarkSubstituteMode,
  LarkSubstituteQuestionRule,
} from "@getpaseo/protocol/messages";

export interface LarkSubstituteRuleLists {
  audienceAllowRuleGroups: LarkSubstituteAudienceRuleGroup[];
  audienceDenyRuleGroups: LarkSubstituteAudienceRuleGroup[];
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

function createLegacyConversationRules(
  rule: LarkSubstituteAudienceRule,
  listKind: "allow" | "deny",
): LarkSubstituteAudienceConversationRule[] {
  switch (rule.type) {
    case "user":
      return listKind === "allow"
        ? [{ id: `${rule.id}-private`, type: "private" }]
        : [
            { id: `${rule.id}-private`, type: "private" },
            { id: `${rule.id}-all-groups`, type: "all_groups" },
          ];
    case "group":
      return [{ ...rule }];
    case "group_name_regex":
      return [{ ...rule }];
    case "group_ai_category":
      return [{ ...rule }];
    case "all":
      return [
        { id: `${rule.id}-private`, type: "private" },
        { id: `${rule.id}-all-groups`, type: "all_groups" },
      ];
  }
}

function createLegacyUserRules(rule: LarkSubstituteAudienceRule): LarkSubstituteAudienceUserRule[] {
  if (rule.type !== "user") {
    return [{ id: `${rule.id}-all-senders`, type: "all" }];
  }
  if (rule.openId) {
    return [
      {
        id: `${rule.id}-open-id`,
        type: "user_open_id",
        openId: rule.openId,
        name: rule.name,
        email: rule.email,
      },
    ];
  }
  if (rule.email) {
    return [
      {
        id: `${rule.id}-email`,
        type: "user_email",
        email: rule.email,
        openId: rule.openId,
        name: rule.name,
      },
    ];
  }
  return [
    {
      id: `${rule.id}-name`,
      type: "user_name",
      name: rule.name || rule.openId || "未知用户",
      openId: rule.openId,
      email: rule.email,
    },
  ];
}

function legacyAudienceRuleGroups(
  rules: LarkSubstituteAudienceRule[],
  listKind: "allow" | "deny",
): LarkSubstituteAudienceRuleGroup[] {
  return rules.map((rule) => ({
    id: `legacy-${rule.id}`,
    conversationRules: createLegacyConversationRules(rule, listKind),
    userRules: createLegacyUserRules(rule),
  }));
}

export function getLarkSubstituteRuleLists(mode: LarkSubstituteMode): LarkSubstituteRuleLists {
  const audienceAllowlist = mode.audienceAllowlist ?? legacyAudienceRules(mode.allowlist);
  const audienceDenylist = mode.audienceDenylist ?? legacyAudienceRules(mode.denylist);
  return {
    // COMPAT(larkSubstituteAudienceRuleGroups): added in v0.7.0, remove after 2027-03-07.
    audienceAllowRuleGroups:
      mode.audienceAllowRuleGroups ?? legacyAudienceRuleGroups(audienceAllowlist, "allow"),
    // COMPAT(larkSubstituteAudienceRuleGroups): added in v0.7.0, remove after 2027-03-07.
    audienceDenyRuleGroups:
      mode.audienceDenyRuleGroups ?? legacyAudienceRuleGroups(audienceDenylist, "deny"),
    questionAllowlist: mode.questionAllowlist ?? legacyQuestionRules(mode.allowlist),
    questionDenylist: mode.questionDenylist ?? legacyQuestionRules(mode.denylist),
  };
}

export function getLarkSubstituteConversationRules(
  groups: readonly LarkSubstituteAudienceRuleGroup[],
): LarkSubstituteAudienceConversationRule[] {
  return groups.flatMap((group) => group.conversationRules);
}
