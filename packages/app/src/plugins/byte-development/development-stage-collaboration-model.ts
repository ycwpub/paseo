import type { DevelopmentStageId } from "./flow-model";

export const DEVELOPMENT_STAGE_COLLABORATION_KEY = "stage_collaboration";

export type DevelopmentStageCollaborationStatus = "pending" | "in_progress" | "completed";

export interface DevelopmentStageCollaboration {
  status: DevelopmentStageCollaborationStatus;
  knowledge: string;
  agentId: string | null;
  workspaceId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export type DevelopmentStageCollaborations = Partial<
  Record<DevelopmentStageId, DevelopmentStageCollaboration>
>;

const STAGE_DEFAULT_KNOWLEDGE: Record<DevelopmentStageId, string> = {
  prd: [
    "目标：与用户一起澄清需求，形成可执行的 PRD。",
    "重点：用户价值、范围、非目标、依赖、风险、验收标准和待确认项。",
    "约束：不得记录 Token、Cookie、JWT 或其他密钥。",
  ].join("\n"),
  technical_design: [
    "目标：基于 PRD 和 Project 上下文形成可落地的技术方案。",
    "重点：架构、数据模型、接口、兼容性、灰度、监控、回滚、安全和测试。",
    "约束：先阅读现有代码与规范知识；未经用户确认不要修改代码。",
  ].join("\n"),
  agent_instruction: [
    "目标：把需求和技术方案整理为开发 Agent 可直接执行的任务说明。",
    "重点：修改范围、实施步骤、禁止事项、验证命令、完成标准和交付清单。",
    "约束：保留用户已有改动，新增能力优先放到新增文件，降低 rebase 冲突。",
  ].join("\n"),
  development: [
    "目标：与用户协作完成代码实现和必要验证。",
    "重点：先检查工作区，保留已有改动，运行相关类型检查和测试。",
    "约束：未经用户明确要求，不提交、不推送、不部署、不发布。",
  ].join("\n"),
  review: [
    "目标：独立审查与本次需求相关的实现。",
    "重点：正确性、兼容性、安全、并发、错误处理、测试和可维护性。",
    "约束：先给出按严重度排序的问题；未经用户要求不修改代码或提交外部评论。",
  ].join("\n"),
  deploy: [
    "目标：与用户确认部署目标并通过 BITS 完成部署。",
    "重点：Dev Task、PSM、环境、分支、控制面、门禁和回滚方案。",
    "约束：BITS 写操作先 dry-run，只有用户明确确认后才能执行真实部署。",
  ].join("\n"),
  test: [
    "目标：制定并执行测试计划，记录结果和失败原因。",
    "重点：测试范围、环境、用例、回归、监控和验收结论。",
    "约束：未获得用户明确确认时，不触发 quick-run 或其他有副作用的测试动作。",
  ].join("\n"),
  release: [
    "目标：与用户完成发布前检查、发布和结果确认。",
    "重点：Release Ticket、门禁、灰度、监控、回滚和发布结论。",
    "约束：先 dry-run；不得跳过 Gatekeeper、QCSS 或其他发布门禁。",
  ].join("\n"),
};

const STAGE_OBJECTIVES: Record<DevelopmentStageId, string> = {
  prd: "澄清并完善 PRD，输出明确、可验证的需求结论。",
  technical_design: "结合 PRD、代码和 Project 知识完成技术方案。",
  agent_instruction: "把已有结论转化为清晰、可执行的 Agent 开发指令。",
  development: "在 Project 代码目录中协作完成实现与验证。",
  review: "审查实现并给出问题、结论和修复建议。",
  deploy: "在用户确认下完成 BITS 部署准备或执行。",
  test: "在用户确认下完成测试、回归和结果记录。",
  release: "在用户确认下完成发布准备或执行，并记录最终结论。",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStatus(value: unknown): DevelopmentStageCollaborationStatus {
  return value === "in_progress" || value === "completed" ? value : "pending";
}

export function defaultDevelopmentStageKnowledge(stageId: DevelopmentStageId): string {
  return STAGE_DEFAULT_KNOWLEDGE[stageId];
}

export function developmentStageCollaborationFromInput(
  input: unknown,
  stageId: DevelopmentStageId,
): DevelopmentStageCollaboration {
  const inputRecord = asRecord(input);
  const allStages = asRecord(inputRecord?.[DEVELOPMENT_STAGE_COLLABORATION_KEY]);
  const stage = asRecord(allStages?.[stageId]);
  return {
    status: readStatus(stage?.status),
    knowledge:
      typeof stage?.knowledge === "string"
        ? stage.knowledge
        : defaultDevelopmentStageKnowledge(stageId),
    agentId: readOptionalText(stage?.agentId),
    workspaceId: readOptionalText(stage?.workspaceId),
    startedAt: readOptionalText(stage?.startedAt),
    completedAt: readOptionalText(stage?.completedAt),
    updatedAt: readOptionalText(stage?.updatedAt),
  };
}

export function developmentStageCollaborationsFromInput(
  input: unknown,
): DevelopmentStageCollaborations {
  const result: DevelopmentStageCollaborations = {};
  const stages = asRecord(asRecord(input)?.[DEVELOPMENT_STAGE_COLLABORATION_KEY]);
  if (!stages) return result;
  for (const [stageId, value] of Object.entries(stages)) {
    if (!(stageId in STAGE_DEFAULT_KNOWLEDGE)) continue;
    result[stageId as DevelopmentStageId] = developmentStageCollaborationFromInput(
      { [DEVELOPMENT_STAGE_COLLABORATION_KEY]: { [stageId]: value } },
      stageId as DevelopmentStageId,
    );
  }
  return result;
}

export function updateDevelopmentStageCollaborationInput(input: {
  currentInput: Record<string, unknown>;
  stageId: DevelopmentStageId;
  patch: Partial<DevelopmentStageCollaboration>;
  now?: string;
}): Record<string, unknown> {
  const allStages = developmentStageCollaborationsFromInput(input.currentInput);
  const current = developmentStageCollaborationFromInput(input.currentInput, input.stageId);
  const now = input.now ?? new Date().toISOString();
  return {
    ...input.currentInput,
    [DEVELOPMENT_STAGE_COLLABORATION_KEY]: {
      ...allStages,
      [input.stageId]: {
        ...current,
        ...input.patch,
        updatedAt: now,
      },
    },
  };
}

export function copyDevelopmentStageCollaborations(input: unknown): DevelopmentStageCollaborations {
  const current = developmentStageCollaborationsFromInput(input);
  return Object.fromEntries(
    Object.entries(current).map(([stageId, stage]) => [
      stageId,
      {
        ...stage,
        status: "pending",
        agentId: null,
        workspaceId: null,
        startedAt: null,
        completedAt: null,
        updatedAt: null,
      },
    ]),
  ) as DevelopmentStageCollaborations;
}

export function buildDevelopmentStageAgentPrompt(input: {
  stageId: DevelopmentStageId;
  stageLabel: string;
  flowTitle: string;
  projectId: string;
  flowInput: Record<string, unknown>;
  knowledge: string;
}): string {
  const {
    stage_collaboration: _stageCollaboration,
    agent_provider: _agentProvider,
    agent_model: _agentModel,
    ...taskConfiguration
  } = input.flowInput;
  return [
    "# 字节开发协作节点",
    "",
    `开发流程：${input.flowTitle}`,
    `Project ID：${input.projectId}`,
    `当前节点：${input.stageLabel}`,
    `节点目标：${STAGE_OBJECTIVES[input.stageId]}`,
    "",
    "请在当前 Project 会话中与用户一起完成这个节点。先确认已有上下文和用户意图，再逐步工作；不要自动执行后续节点。",
    "",
    "## 节点专有知识",
    input.knowledge.trim() || "暂无额外配置。",
    "",
    "## 流程配置",
    JSON.stringify(taskConfiguration, null, 2),
    "",
    "完成当前节点后，请给出：本节点结论、产物或改动、验证结果、风险与下一节点需要继承的信息。是否进入下一节点由用户在插件页面明确决定。",
  ].join("\n");
}

export function buildDevelopmentStageSystemPrompt(input: {
  stageLabel: string;
  knowledge: string;
}): string {
  return [
    `你正在 Paseo Project 中与用户协作完成“${input.stageLabel}”节点。`,
    "Project 的规范知识必须遵守，Project 专有知识按任务需要采纳。",
    "节点专有知识仅作用于当前节点，优先级低于系统安全规则和 Project 规范知识。",
    "不要自行推进或执行其他流程节点，也不要声称已经更新插件状态。",
    "",
    "节点专有知识：",
    input.knowledge.trim() || "暂无额外配置。",
  ].join("\n");
}
