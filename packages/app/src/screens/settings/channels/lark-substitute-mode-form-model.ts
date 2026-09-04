import type {
  LarkChannelBotStatus,
  LarkChannelTarget,
  LarkDirectoryUser,
  LarkSubstituteMode,
  LarkSubstituteModeCreateInput,
  LarkSubstituteRule,
  LarkSubstituteTimeRange,
} from "@getpaseo/protocol/messages";

export const TARGET_WORKSPACE = "workspace";
export const TARGET_ASSISTANT_PREFIX = "assistant:";
export const TARGET_TEAM_PREFIX = "team:";

export interface LarkSubstituteModeFormState {
  name: string;
  enabled: boolean;
  botId: string | null;
  openId: string;
  groupReplyIdentity: "user" | "bot";
  disclosureEnabled: boolean;
  disclosurePrompt: string;
  customPrompt: string;
  delaySeconds: string;
  weekdays: string;
  startTime: string;
  endTime: string;
  timezone: string;
  allowlist: string;
  denylist: string;
  targetSelection: string;
  provider: string | null;
  model: string | null;
  cwd: string;
}

export function getLarkBotLabel(bot: LarkChannelBotStatus): string {
  return bot.bot?.name || bot.name || bot.appId || bot.id;
}

export function getTargetSelection(target: LarkChannelTarget): string {
  if (target.kind === "assistant" && target.assistantId) {
    return `${TARGET_ASSISTANT_PREFIX}${target.assistantId}`;
  }
  if (target.kind === "team" && target.teamId) {
    return `${TARGET_TEAM_PREFIX}${target.teamId}`;
  }
  return TARGET_WORKSPACE;
}

function formatRule(rule: LarkSubstituteRule): string {
  switch (rule.type) {
    case "user":
      return ["用户", rule.name ?? "", rule.email ?? "", rule.openId ?? ""].join("|");
    case "group":
      return ["群", rule.name ?? "", rule.groupId ?? "", rule.chatId].join("|");
    case "group_name_regex":
      return `群正则|${rule.pattern}`;
    case "question_type":
      return `问题类型|${rule.description}`;
  }
}

export function formatSubstituteRules(rules: readonly LarkSubstituteRule[]): string {
  return rules.map(formatRule).join("\n");
}

function parseUserRule(id: string, parts: string[], lineNumber: number): LarkSubstituteRule {
  const [name = "", email = "", openId = ""] = parts;
  if (!name && !email && !openId) {
    throw new Error(`第 ${lineNumber} 条用户规则为空`);
  }
  return {
    id,
    type: "user",
    name: name || null,
    email: email || null,
    openId: openId || null,
  };
}

function parseGroupRule(id: string, parts: string[], lineNumber: number): LarkSubstituteRule {
  const [name = "", groupId = "", chatId = ""] = parts;
  if (!chatId) {
    throw new Error(`第 ${lineNumber} 条群规则缺少 oc_xxx`);
  }
  return {
    id,
    type: "group",
    name: name || null,
    groupId: groupId || null,
    chatId,
  };
}

function parseGroupNameRegexRule(
  id: string,
  parts: string[],
  lineNumber: number,
): LarkSubstituteRule {
  const pattern = parts.join("|");
  if (!pattern) {
    throw new Error(`第 ${lineNumber} 条群正则为空`);
  }
  try {
    RegExp(pattern, "u");
  } catch {
    throw new Error(`第 ${lineNumber} 条群名称正则表达式无效`);
  }
  return { id, type: "group_name_regex", pattern };
}

function parseQuestionTypeRule(
  id: string,
  parts: string[],
  lineNumber: number,
): LarkSubstituteRule {
  const description = parts.join("|");
  if (!description) {
    throw new Error(`第 ${lineNumber} 条问题类型为空`);
  }
  return { id, type: "question_type", description };
}

function parseRule(line: string, index: number, listName: string): LarkSubstituteRule {
  const [rawType = "", ...parts] = line.split("|").map((part) => part.trim());
  const id = `${listName}-${index}`;
  const lineNumber = index + 1;
  switch (rawType) {
    case "用户":
    case "user":
      return parseUserRule(id, parts, lineNumber);
    case "群":
    case "group":
      return parseGroupRule(id, parts, lineNumber);
    case "群正则":
    case "group_regex":
      return parseGroupNameRegexRule(id, parts, lineNumber);
    case "问题类型":
    case "question":
      return parseQuestionTypeRule(id, parts, lineNumber);
    default:
      throw new Error(`第 ${lineNumber} 条规则类型无效，请使用“用户、群、群正则、问题类型”`);
  }
}

export function parseSubstituteRules(value: string, listName: string): LarkSubstituteRule[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseRule(line, index, listName));
}

function getInitialTarget(
  mode: LarkSubstituteMode | null | undefined,
  initialBot: LarkChannelBotStatus | null,
): LarkChannelTarget {
  return (
    mode?.target ??
    initialBot?.target ?? {
      kind: "workspace",
      provider: null,
      model: null,
      cwd: null,
      workspaceId: null,
    }
  );
}

export function createSubstituteModeFormState(
  mode: LarkSubstituteMode | null | undefined,
  bots: LarkChannelBotStatus[],
): LarkSubstituteModeFormState {
  const initialBot = bots.find((bot) => bot.id === mode?.botId) ?? bots[0] ?? null;
  const initialTarget = getInitialTarget(mode, initialBot);
  if (!mode) {
    return createDefaultFormState(initialBot, initialTarget);
  }
  return {
    ...createModeIdentityFields(mode, initialBot),
    ...createModeBehaviorFields(mode),
    ...createTimeFields(mode.activeTimeRanges[0]),
    ...createTargetFields(initialTarget),
  };
}

function createDefaultFormState(
  initialBot: LarkChannelBotStatus | null,
  initialTarget: LarkChannelTarget,
): LarkSubstituteModeFormState {
  return {
    name: "",
    enabled: true,
    botId: initialBot?.id ?? null,
    openId: "",
    groupReplyIdentity: "bot",
    disclosureEnabled: true,
    disclosurePrompt: "【机器人代答】",
    customPrompt: "",
    delaySeconds: "10",
    weekdays: "1,2,3,4,5,6,0",
    startTime: "",
    endTime: "",
    timezone: "Asia/Shanghai",
    allowlist: "",
    denylist: "",
    targetSelection: getTargetSelection(initialTarget),
    provider: initialTarget.provider ?? null,
    model: initialTarget.model ?? null,
    cwd: initialTarget.cwd ?? "",
  };
}

function createModeIdentityFields(
  mode: LarkSubstituteMode,
  initialBot: LarkChannelBotStatus | null,
): Pick<LarkSubstituteModeFormState, "name" | "enabled" | "botId" | "openId"> {
  return {
    name: mode.name,
    enabled: mode.enabled,
    botId: initialBot?.id ?? null,
    openId: mode.substituteUser.openId,
  };
}

function createModeBehaviorFields(
  mode: LarkSubstituteMode,
): Pick<
  LarkSubstituteModeFormState,
  | "groupReplyIdentity"
  | "disclosureEnabled"
  | "disclosurePrompt"
  | "customPrompt"
  | "delaySeconds"
  | "allowlist"
  | "denylist"
> {
  return {
    groupReplyIdentity: mode.groupReplyIdentity,
    disclosureEnabled: mode.disclosure.enabled,
    disclosurePrompt: mode.disclosure.prompt,
    customPrompt: mode.customPrompt,
    delaySeconds: String(mode.delaySeconds),
    allowlist: formatSubstituteRules(mode.allowlist),
    denylist: formatSubstituteRules(mode.denylist),
  };
}

function createTimeFields(
  firstRange: LarkSubstituteTimeRange | undefined,
): Pick<LarkSubstituteModeFormState, "weekdays" | "startTime" | "endTime" | "timezone"> {
  if (!firstRange) {
    return {
      weekdays: "1,2,3,4,5,6,0",
      startTime: "",
      endTime: "",
      timezone: "Asia/Shanghai",
    };
  }
  return {
    weekdays: firstRange.weekdays.join(","),
    startTime: firstRange.startTime,
    endTime: firstRange.endTime,
    timezone: firstRange.timezone,
  };
}

function createTargetFields(
  target: LarkChannelTarget,
): Pick<LarkSubstituteModeFormState, "targetSelection" | "provider" | "model" | "cwd"> {
  return {
    targetSelection: getTargetSelection(target),
    provider: target.provider ?? null,
    model: target.model ?? null,
    cwd: target.cwd ?? "",
  };
}

function parseDelaySeconds(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3_600) {
    throw new Error("延迟时间必须是 0 到 3600 的整数秒");
  }
  return parsed;
}

function parseWeekdays(value: string): number[] {
  const weekdays = Array.from(
    new Set(
      value
        .split(/[,，\s]+/u)
        .filter(Boolean)
        .map(Number),
    ),
  );
  if (
    weekdays.length === 0 ||
    weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)
  ) {
    throw new Error("星期必须使用 0 到 6 的数字，0 表示周日");
  }
  return weekdays;
}

function buildActiveTimeRanges(
  form: LarkSubstituteModeFormState,
  mode: LarkSubstituteMode | null | undefined,
): LarkSubstituteTimeRange[] {
  if (!form.startTime.trim() && !form.endTime.trim()) {
    return [];
  }
  if (!form.startTime.trim() || !form.endTime.trim()) {
    throw new Error("开始时间和结束时间必须同时填写");
  }
  return [
    {
      id: mode?.activeTimeRanges[0]?.id ?? "default",
      weekdays: parseWeekdays(form.weekdays),
      startTime: form.startTime.trim(),
      endTime: form.endTime.trim(),
      timezone: form.timezone.trim() || "Asia/Shanghai",
    },
  ];
}

function buildTarget(form: LarkSubstituteModeFormState): LarkChannelTarget {
  const common = {
    provider: form.provider,
    model: form.model,
    cwd: form.cwd.trim(),
    workspaceId: null,
  };
  if (form.targetSelection.startsWith(TARGET_ASSISTANT_PREFIX)) {
    return {
      kind: "assistant",
      assistantId: form.targetSelection.slice(TARGET_ASSISTANT_PREFIX.length),
      ...common,
    };
  }
  if (form.targetSelection.startsWith(TARGET_TEAM_PREFIX)) {
    return {
      kind: "team",
      teamId: form.targetSelection.slice(TARGET_TEAM_PREFIX.length),
      ...common,
    };
  }
  return { kind: "workspace", ...common };
}

function validateRequiredFields(
  form: LarkSubstituteModeFormState,
  selectedBot: LarkChannelBotStatus | null,
): void {
  if (!form.name.trim()) throw new Error("请输入替身模式名称");
  if (!form.botId || !selectedBot) throw new Error("请选择飞书机器人");
  if (!form.openId.trim()) throw new Error("请选择被替身用户");
  if (!form.provider) throw new Error("请选择模型提供方");
  if (!form.model) throw new Error("请选择模型");
  if (!form.cwd.trim()) throw new Error("请选择项目");
}

export function buildSubstituteModeInput(input: {
  form: LarkSubstituteModeFormState;
  selectedBot: LarkChannelBotStatus | null;
  directoryUsers: LarkDirectoryUser[];
  mode?: LarkSubstituteMode | null;
}): LarkSubstituteModeCreateInput {
  const { form, selectedBot, mode } = input;
  validateRequiredFields(form, selectedBot);
  const selectedUser = input.directoryUsers.find(
    (user) => user.appId === selectedBot?.appId && user.openId === form.openId,
  );
  return {
    name: form.name.trim(),
    enabled: form.enabled,
    botId: form.botId as string,
    substituteUser: {
      openId: form.openId.trim(),
      name: selectedUser?.displayName ?? mode?.substituteUser.name ?? null,
      email: selectedUser?.email ?? mode?.substituteUser.email ?? null,
    },
    privateReplyIdentity: "user",
    groupReplyIdentity: form.groupReplyIdentity,
    disclosure: {
      enabled: form.disclosureEnabled,
      prompt: form.disclosurePrompt.trim() || "【机器人代答】",
    },
    customPrompt: form.customPrompt.trim(),
    delaySeconds: parseDelaySeconds(form.delaySeconds),
    activeTimeRanges: buildActiveTimeRanges(form, mode),
    allowlist: parseSubstituteRules(form.allowlist, "allow"),
    denylist: parseSubstituteRules(form.denylist, "deny"),
    target: buildTarget(form),
  };
}
