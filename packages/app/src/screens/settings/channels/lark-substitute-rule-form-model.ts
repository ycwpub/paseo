import type {
  LarkSubstituteAudienceConversationRule,
  LarkSubstituteAudienceRule,
  LarkSubstituteAudienceRuleGroup,
  LarkSubstituteAudienceUserRule,
  LarkSubstituteMode,
  LarkSubstituteQuestionRule,
} from "@getpaseo/protocol/messages";

export type LarkSubstituteConversationRuleType = LarkSubstituteAudienceConversationRule["type"];
export type LarkSubstituteUserRuleType = LarkSubstituteAudienceUserRule["type"];

export interface LarkSubstituteRuleFormLists {
  audienceAllowRuleGroups: LarkSubstituteAudienceRuleGroup[];
  audienceDenyRuleGroups: LarkSubstituteAudienceRuleGroup[];
  questionAllowlist: LarkSubstituteQuestionRule[];
  questionDenylist: LarkSubstituteQuestionRule[];
}

let nextRuleSequence = 0;

function createRuleId(prefix: string): string {
  nextRuleSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextRuleSequence.toString(36)}`;
}

function legacyAudienceRules(rules: LarkSubstituteMode["allowlist"]): LarkSubstituteAudienceRule[] {
  return rules.filter((rule): rule is LarkSubstituteAudienceRule => rule.type !== "question_type");
}

function legacyQuestionRules(rules: LarkSubstituteMode["allowlist"]): LarkSubstituteQuestionRule[] {
  return rules.flatMap((rule) =>
    rule.type === "question_type" ? [{ id: rule.id, description: rule.description }] : [],
  );
}

function convertLegacyAudienceRule(
  rule: LarkSubstituteAudienceRule,
  listKind: "allow" | "deny",
): LarkSubstituteAudienceRuleGroup {
  if (rule.type === "user") {
    const userRule: LarkSubstituteAudienceUserRule = rule.email
      ? {
          id: `${rule.id}-email`,
          type: "user_email",
          email: rule.email,
          openId: rule.openId,
          name: rule.name,
        }
      : {
          id: `${rule.id}-name`,
          type: "user_name",
          name: rule.name || rule.openId || "未知用户",
          openId: rule.openId,
          email: rule.email,
        };
    return {
      id: `legacy-${rule.id}`,
      conversationRules:
        listKind === "allow"
          ? [{ id: `${rule.id}-private`, type: "private" }]
          : [
              { id: `${rule.id}-private`, type: "private" },
              { id: `${rule.id}-all-groups`, type: "all_groups" },
            ],
      userRules: [userRule],
    };
  }
  if (rule.type === "all") {
    return {
      id: `legacy-${rule.id}`,
      conversationRules: [
        { id: `${rule.id}-private`, type: "private" },
        { id: `${rule.id}-all-groups`, type: "all_groups" },
      ],
      userRules: [{ id: `${rule.id}-all-senders`, type: "all" }],
    };
  }
  return {
    id: `legacy-${rule.id}`,
    conversationRules: [{ ...rule }],
    userRules: [{ id: `${rule.id}-all-senders`, type: "all" }],
  };
}

function convertLegacyAudienceRules(
  rules: LarkSubstituteAudienceRule[],
  listKind: "allow" | "deny",
): LarkSubstituteAudienceRuleGroup[] {
  return rules.map((rule) => convertLegacyAudienceRule(rule, listKind));
}

export function createSubstituteRuleFormLists(
  mode: LarkSubstituteMode | null | undefined,
): LarkSubstituteRuleFormLists {
  if (!mode) {
    return {
      audienceAllowRuleGroups: [],
      audienceDenyRuleGroups: [],
      questionAllowlist: [],
      questionDenylist: [],
    };
  }
  const legacyAllowlist = mode.audienceAllowlist ?? legacyAudienceRules(mode.allowlist);
  const legacyDenylist = mode.audienceDenylist ?? legacyAudienceRules(mode.denylist);
  return {
    // COMPAT(larkSubstituteAudienceRuleGroups): added in v0.7.0, remove after 2027-03-07.
    audienceAllowRuleGroups: [
      ...(mode.audienceAllowRuleGroups ?? convertLegacyAudienceRules(legacyAllowlist, "allow")),
    ],
    // COMPAT(larkSubstituteAudienceRuleGroups): added in v0.7.0, remove after 2027-03-07.
    audienceDenyRuleGroups: [
      ...(mode.audienceDenyRuleGroups ?? convertLegacyAudienceRules(legacyDenylist, "deny")),
    ],
    questionAllowlist: [...(mode.questionAllowlist ?? legacyQuestionRules(mode.allowlist))],
    questionDenylist: [...(mode.questionDenylist ?? legacyQuestionRules(mode.denylist))],
  };
}

export function createConversationRule(
  type: LarkSubstituteConversationRuleType = "group",
): LarkSubstituteAudienceConversationRule {
  const id = createRuleId("conversation");
  switch (type) {
    case "group":
      return { id, type, chatId: "", groupId: null, name: null };
    case "group_name_regex":
      return { id, type, pattern: "" };
    case "group_ai_category":
      return { id, type, description: "" };
    case "private":
    case "bot":
    case "all":
      return { id, type };
    case "all_groups":
      return { id, type };
  }
}

export function createUserRule(
  type: LarkSubstituteUserRuleType = "all_users",
): LarkSubstituteAudienceUserRule {
  const id = createRuleId("user");
  switch (type) {
    case "all_users":
    case "all_bots":
    case "all":
      return { id, type };
    case "bot_app_id":
      return { id, type, appId: "" };
    case "user_name":
      return { id, type, name: "", openId: null, email: null };
    case "user_email":
      return { id, type, email: "", openId: null, name: null };
  }
}

export function createAudienceRuleGroup(): LarkSubstituteAudienceRuleGroup {
  return {
    id: createRuleId("audience-group"),
    conversationRules: [createConversationRule()],
    userRules: [createUserRule()],
  };
}

export function createQuestionRule(): LarkSubstituteQuestionRule {
  return { id: createRuleId("question"), description: "" };
}

function validateConversationRule(
  rule: LarkSubstituteAudienceConversationRule,
  listLabel: string,
  groupIndex: number,
  ruleIndex: number,
): LarkSubstituteAudienceConversationRule {
  const location = `${listLabel}第 ${groupIndex + 1} 个名单的第一层第 ${ruleIndex + 1} 行`;
  switch (rule.type) {
    case "group":
      if (!rule.chatId.trim()) throw new Error(`${location}请选择群`);
      return {
        ...rule,
        chatId: rule.chatId.trim(),
        groupId: rule.groupId?.trim() || null,
        name: rule.name?.trim() || null,
      };
    case "group_name_regex": {
      const pattern = rule.pattern.trim();
      if (!pattern) throw new Error(`${location}请输入群名称正则表达式`);
      try {
        RegExp(pattern, "u");
      } catch {
        throw new Error(`${location}的群名称正则表达式无效`);
      }
      return { ...rule, pattern };
    }
    case "group_ai_category": {
      const description = rule.description.trim();
      if (!description) throw new Error(`${location}请输入群 AI 分类描述`);
      return { ...rule, description };
    }
    case "private":
    case "bot":
    case "all":
    case "all_groups":
      return rule;
  }
}

function validateUserRule(
  rule: LarkSubstituteAudienceUserRule,
  listLabel: string,
  groupIndex: number,
  ruleIndex: number,
): LarkSubstituteAudienceUserRule {
  const location = `${listLabel}第 ${groupIndex + 1} 个名单的第二层第 ${ruleIndex + 1} 行`;
  switch (rule.type) {
    case "all_users":
    case "all_bots":
    case "all":
      return rule;
    case "bot_app_id": {
      const appId = rule.appId.trim();
      if (!appId) throw new Error(`${location}请输入机器人 app_id`);
      return { ...rule, appId };
    }
    case "user_name": {
      const name = rule.name.trim();
      if (!name) throw new Error(`${location}请输入用户名称`);
      return {
        ...rule,
        name,
        openId: rule.openId?.trim() || null,
        email: rule.email?.trim() || null,
      };
    }
    case "user_email": {
      const email = rule.email.trim().toLocaleLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
        throw new Error(`${location}请输入有效的用户邮箱`);
      }
      return {
        ...rule,
        email,
        openId: rule.openId?.trim() || null,
        name: rule.name?.trim() || null,
      };
    }
  }
}

function validateAudienceRuleGroups(
  groups: readonly LarkSubstituteAudienceRuleGroup[],
  listLabel: string,
): LarkSubstituteAudienceRuleGroup[] {
  return groups.map((group, groupIndex) => {
    if (group.conversationRules.length === 0) {
      throw new Error(`${listLabel}第 ${groupIndex + 1} 个名单至少需要一条第一层规则`);
    }
    if (group.userRules.length === 0) {
      throw new Error(`${listLabel}第 ${groupIndex + 1} 个名单至少需要一条第二层规则`);
    }
    return {
      ...group,
      conversationRules: group.conversationRules.map((rule, ruleIndex) =>
        validateConversationRule(rule, listLabel, groupIndex, ruleIndex),
      ),
      userRules: group.userRules.map((rule, ruleIndex) =>
        validateUserRule(rule, listLabel, groupIndex, ruleIndex),
      ),
    };
  });
}

function validateQuestionRules(
  rules: readonly LarkSubstituteQuestionRule[],
  listLabel: string,
): LarkSubstituteQuestionRule[] {
  return rules.map((rule, index) => {
    const description = rule.description.trim();
    if (!description) {
      throw new Error(`${listLabel}第 ${index + 1} 行请输入问题类型`);
    }
    return { ...rule, description };
  });
}

export function validateSubstituteRuleFormLists(
  lists: LarkSubstituteRuleFormLists,
): LarkSubstituteRuleFormLists {
  return {
    audienceAllowRuleGroups: validateAudienceRuleGroups(
      lists.audienceAllowRuleGroups,
      "用户/群白名单",
    ),
    audienceDenyRuleGroups: validateAudienceRuleGroups(
      lists.audienceDenyRuleGroups,
      "用户/群黑名单",
    ),
    questionAllowlist: validateQuestionRules(lists.questionAllowlist, "问题白名单"),
    questionDenylist: validateQuestionRules(lists.questionDenylist, "问题黑名单"),
  };
}
