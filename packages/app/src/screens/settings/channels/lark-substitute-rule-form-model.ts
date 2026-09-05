import type {
  LarkSubstituteAudienceRule,
  LarkSubstituteMode,
  LarkSubstituteQuestionRule,
} from "@getpaseo/protocol/messages";

export type LarkSubstituteAudienceRuleType = LarkSubstituteAudienceRule["type"];

export interface LarkSubstituteRuleFormLists {
  audienceAllowlist: LarkSubstituteAudienceRule[];
  audienceDenylist: LarkSubstituteAudienceRule[];
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

export function createSubstituteRuleFormLists(
  mode: LarkSubstituteMode | null | undefined,
): LarkSubstituteRuleFormLists {
  if (!mode) {
    return {
      audienceAllowlist: [],
      audienceDenylist: [],
      questionAllowlist: [],
      questionDenylist: [],
    };
  }
  return {
    audienceAllowlist: [...(mode.audienceAllowlist ?? legacyAudienceRules(mode.allowlist))],
    audienceDenylist: [...(mode.audienceDenylist ?? legacyAudienceRules(mode.denylist))],
    questionAllowlist: [...(mode.questionAllowlist ?? legacyQuestionRules(mode.allowlist))],
    questionDenylist: [...(mode.questionDenylist ?? legacyQuestionRules(mode.denylist))],
  };
}

export function createAudienceRule(
  type: LarkSubstituteAudienceRuleType = "user",
): LarkSubstituteAudienceRule {
  const id = createRuleId("audience");
  switch (type) {
    case "user":
      return { id, type, openId: null, name: null, email: null };
    case "group":
      return { id, type, chatId: "", groupId: null, name: null };
    case "group_name_regex":
      return { id, type, pattern: "" };
    case "group_ai_category":
      return { id, type, description: "" };
    case "all":
      return { id, type };
  }
}

export function createQuestionRule(): LarkSubstituteQuestionRule {
  return { id: createRuleId("question"), description: "" };
}

function validateAudienceRule(
  rule: LarkSubstituteAudienceRule,
  listLabel: string,
  index: number,
): LarkSubstituteAudienceRule {
  const row = index + 1;
  switch (rule.type) {
    case "user":
      if (!rule.openId?.trim()) {
        throw new Error(`${listLabel}第 ${row} 行请选择用户`);
      }
      return {
        ...rule,
        openId: rule.openId.trim(),
        name: rule.name?.trim() || null,
        email: rule.email?.trim() || null,
      };
    case "group":
      if (!rule.chatId.trim()) {
        throw new Error(`${listLabel}第 ${row} 行请选择群`);
      }
      return {
        ...rule,
        chatId: rule.chatId.trim(),
        groupId: rule.groupId?.trim() || null,
        name: rule.name?.trim() || null,
      };
    case "group_name_regex": {
      const pattern = rule.pattern.trim();
      if (!pattern) {
        throw new Error(`${listLabel}第 ${row} 行请输入群名称正则表达式`);
      }
      try {
        RegExp(pattern, "u");
      } catch {
        throw new Error(`${listLabel}第 ${row} 行的群名称正则表达式无效`);
      }
      return { ...rule, pattern };
    }
    case "group_ai_category": {
      const description = rule.description.trim();
      if (!description) {
        throw new Error(`${listLabel}第 ${row} 行请输入群 AI 分类描述`);
      }
      return { ...rule, description };
    }
    case "all":
      return rule;
  }
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
    audienceAllowlist: lists.audienceAllowlist.map((rule, index) =>
      validateAudienceRule(rule, "用户/群白名单", index),
    ),
    audienceDenylist: lists.audienceDenylist.map((rule, index) =>
      validateAudienceRule(rule, "用户/群黑名单", index),
    ),
    questionAllowlist: validateQuestionRules(lists.questionAllowlist, "问题白名单"),
    questionDenylist: validateQuestionRules(lists.questionDenylist, "问题黑名单"),
  };
}
