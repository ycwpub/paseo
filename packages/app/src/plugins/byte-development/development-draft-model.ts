import {
  EMPTY_DEVELOPMENT_PRD_SOURCE,
  serializeDevelopmentPrdSource,
  type DevelopmentPrdSourceValue,
} from "./development-prd-source-model";
import { sanitizeByteDevelopmentWorkflowInput } from "./workflow-input-model";
import {
  copyDevelopmentStageCollaborations,
  DEVELOPMENT_STAGE_COLLABORATION_KEY,
} from "./development-stage-collaboration-model";

export function buildDevelopmentDraftInput(input: {
  flowTitle: string;
  projectId: string;
  defaultAgent: {
    provider: string;
    model: string;
  };
}): Record<string, unknown> {
  const flowTitle = input.flowTitle.trim();
  const projectId = input.projectId.trim();
  if (!flowTitle) throw new Error("开发流程名称不能为空");
  if (!projectId) throw new Error("请选择用于承载开发流程的已有 Project");
  const provider = input.defaultAgent.provider.trim();
  const model = input.defaultAgent.model.trim();
  if (!provider || !model) throw new Error("请选择默认 Provider 和模型");
  return sanitizeByteDevelopmentWorkflowInput({
    flow_title: flowTitle,
    projectId,
    agent_provider: provider,
    agent_model: model,
    ...serializeDevelopmentPrdSource(EMPTY_DEVELOPMENT_PRD_SOURCE),
  });
}

export function buildDevelopmentCopyTitle(
  sourceTitle: string,
  existingTitles: readonly string[],
): string {
  const normalizedSource = sourceTitle.trim();
  if (!normalizedSource) throw new Error("源开发流程名称不能为空");
  const baseTitle = normalizedSource.replace(/ 副本(?: \d+)?$/u, "");
  const existing = new Set(existingTitles.map((title) => title.trim()));
  const firstCopy = `${baseTitle} 副本`;
  if (!existing.has(firstCopy)) return firstCopy;
  let copyIndex = 2;
  while (existing.has(`${baseTitle} 副本 ${copyIndex}`)) copyIndex += 1;
  return `${baseTitle} 副本 ${copyIndex}`;
}

export function buildDevelopmentCopyInput(input: {
  currentInput: Record<string, unknown>;
  sourceTitle: string;
  existingTitles: readonly string[];
  projectId: string;
}): Record<string, unknown> {
  const projectId = input.projectId.trim();
  if (!projectId) throw new Error("源开发流程没有关联 Project");
  return sanitizeByteDevelopmentWorkflowInput({
    ...input.currentInput,
    flow_title: buildDevelopmentCopyTitle(input.sourceTitle, input.existingTitles),
    projectId,
    [DEVELOPMENT_STAGE_COLLABORATION_KEY]: copyDevelopmentStageCollaborations(input.currentInput),
  });
}

export function buildDevelopmentPrdInput(input: {
  currentInput: Record<string, unknown>;
  projectId: string | null;
  prdSource: DevelopmentPrdSourceValue;
  fixedFormValues?: Record<string, unknown>;
}): Record<string, unknown> {
  return sanitizeByteDevelopmentWorkflowInput({
    ...input.currentInput,
    ...serializeDevelopmentPrdSource(input.prdSource),
    ...input.fixedFormValues,
    projectId: input.projectId,
  });
}

export function validateDevelopmentDraftStart(input: {
  prdSource: DevelopmentPrdSourceValue;
  repositoryPath: string | null;
  projectLoading: boolean;
  projectError: string | null;
}): void {
  if (!input.prdSource.prd.trim()) {
    throw new Error("请先填写 PRD / 需求说明");
  }
  if (!input.repositoryPath) {
    throw new Error("流程 Project 没有关联代码目录，请先点击 Project 设置添加代码目录");
  }
  if (input.projectLoading) {
    throw new Error("正在读取 Project 配置，请稍后重试");
  }
  if (input.projectError) {
    throw new Error(input.projectError);
  }
}
