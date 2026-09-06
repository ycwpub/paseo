import type {
  LarkChannelBotStatus,
  LarkChannelTarget,
  LarkDirectoryUser,
  LarkSubstituteAudienceRule,
  LarkSubstituteMode,
  LarkSubstituteModeCreateInput,
  LarkSubstituteQuestionRule,
  LarkSubstituteTimeRange,
} from "@getpaseo/protocol/messages";
import {
  DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT,
  DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS,
} from "@getpaseo/protocol/messages";
import {
  createSubstituteRuleFormLists,
  validateSubstituteRuleFormLists,
} from "./lark-substitute-rule-form-model";

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
  weekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  audienceAllowlist: LarkSubstituteAudienceRule[];
  audienceDenylist: LarkSubstituteAudienceRule[];
  questionAllowlist: LarkSubstituteQuestionRule[];
  questionDenylist: LarkSubstituteQuestionRule[];
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
    customPrompt: DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT,
    delaySeconds: String(DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS),
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startTime: "",
    endTime: "",
    timezone: "Asia/Shanghai",
    ...createSubstituteRuleFormLists(null),
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
  | "audienceAllowlist"
  | "audienceDenylist"
  | "questionAllowlist"
  | "questionDenylist"
> {
  return {
    groupReplyIdentity: mode.groupReplyIdentity,
    disclosureEnabled: mode.disclosure.enabled,
    disclosurePrompt: mode.disclosure.prompt,
    customPrompt: mode.customPrompt,
    delaySeconds: String(mode.delaySeconds),
    ...createSubstituteRuleFormLists(mode),
  };
}

function createTimeFields(
  firstRange: LarkSubstituteTimeRange | undefined,
): Pick<LarkSubstituteModeFormState, "weekdays" | "startTime" | "endTime" | "timezone"> {
  if (!firstRange) {
    return {
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startTime: "",
      endTime: "",
      timezone: "Asia/Shanghai",
    };
  }
  return {
    weekdays: [...firstRange.weekdays],
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

function validateWeekdays(value: readonly number[]): number[] {
  const weekdays = Array.from(new Set(value)).sort((left, right) => left - right);
  if (
    weekdays.length === 0 ||
    weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)
  ) {
    throw new Error("请至少选择一个星期，星期范围为 1 到 7");
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
      weekdays: validateWeekdays(form.weekdays),
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
  const ruleLists = validateSubstituteRuleFormLists({
    audienceAllowlist: form.audienceAllowlist,
    audienceDenylist: form.audienceDenylist,
    questionAllowlist: form.questionAllowlist,
    questionDenylist: form.questionDenylist,
  });
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
    ...ruleLists,
    allowlist: [],
    denylist: [],
    target: buildTarget(form),
  };
}
