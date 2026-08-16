import type { TFunction } from "i18next";
import {
  WorkflowScriptSchema,
  type WorkflowScript,
  type WorkflowStep,
} from "@getpaseo/protocol/workflow/types";
import { validateWorkflowDraft } from "@/workflows/editor-model";

type ValidationPathSegment = PropertyKey;

interface ValidationIssue {
  code?: string;
  message: string;
  minimum?: number | bigint;
  path: ValidationPathSegment[];
}

export interface WorkflowDraftValidationPresentation {
  message: string;
  stepId: string | null;
}

interface LocatedIssue {
  step: WorkflowStep | null;
  fieldPath: ValidationPathSegment[];
}

const STEP_FIELD_LABEL_KEYS = new Map<string, string>([
  ["id", "workflows.nodes.id"],
  ["name", "workflows.nodes.displayName"],
  ["nextStepId", "workflows.nodes.downstream.label"],
  ["initialCommand", "workflows.nodes.bash.initialCommand"],
  ["code", "workflows.nodes.python.code"],
  ["inputVariable", "workflows.nodes.common.inputVariable"],
  ["outputVariable", "workflows.nodes.common.outputVariable"],
  ["cwd", "workflows.nodes.common.workingDirectory"],
  ["shell", "workflows.nodes.bash.shell"],
  ["pythonPath", "workflows.nodes.python.interpreter"],
  ["timeoutMs", "workflows.nodes.common.timeout"],
  ["retry", "workflows.nodes.retry.title"],
  ["retry.maxAttempts", "workflows.nodes.retry.attempts"],
  ["retry.initialDelayMs", "workflows.nodes.retry.initialDelay"],
  ["retry.maxDelayMs", "workflows.nodes.retry.maxDelay"],
  ["retry.backoffMultiplier", "workflows.nodes.retry.backoff"],
  ["retry.jitter", "workflows.nodes.retry.jitter"],
  ["inputs", "workflows.nodes.contract.inputs"],
  ["inputSchema", "workflows.nodes.contract.inputSchema"],
  ["outputSchema", "workflows.nodes.contract.outputSchema"],
  ["variables", "workflows.inputContract.nodeVariables"],
  ["initialPrompt", "workflows.nodes.agent.initialPrompt"],
  ["subsequentPrompt", "workflows.nodes.agent.subsequentPrompt"],
  ["subsequentPromptMode", "workflows.nodes.agent.subsequentPromptMode"],
  ["lifecycle", "workflows.nodes.agent.lifecycle"],
  ["outputMode", "workflows.nodes.agent.outputType"],
  ["config.provider", "workflows.nodes.agent.provider"],
  ["config.model", "workflows.nodes.agent.model"],
  ["config.mode", "workflows.nodes.agent.mode"],
  ["config.thinking", "workflows.nodes.agent.thinking"],
  ["config.isolation", "workflows.nodes.agent.isolation"],
  ["config.approvalPolicy", "workflows.nodes.agent.approvalPolicy"],
  ["config.sandboxMode", "workflows.nodes.agent.sandboxMode"],
  ["config.assistantId", "workflows.nodes.agent.assistantOrTeam"],
  ["config.teamId", "workflows.nodes.agent.assistantOrTeam"],
  ["config.systemPrompt", "workflows.nodes.agent.systemPrompt"],
  ["config.archiveOnFinish", "workflows.nodes.agent.archiveAtLifecycleEnd"],
  ["config.cwd", "workflows.nodes.common.workingDirectory"],
  ["switchVar", "workflows.nodes.switch.switchOn"],
  ["caseSensitive", "workflows.nodes.switch.caseSensitive"],
  ["cases", "workflows.nodes.switch.valueEquals"],
  ["defaultSteps", "workflows.nodes.switch.defaultBranch"],
  ["mode", "workflows.nodes.for.mode"],
  ["executionMode", "workflows.nodes.for.executionMode"],
  ["items", "workflows.nodes.for.items"],
  ["forControl", "workflows.nodes.for.control"],
  ["loopVariables", "workflows.nodes.for.loopVariables"],
  ["maxIterations", "workflows.nodes.for.maximumIterations"],
  ["concurrency", "workflows.nodes.for.concurrency"],
]);

const WORKFLOW_FIELD_LABEL_KEYS = new Map<string, string>([
  ["name", "workflows.editor.name"],
  ["description", "workflows.editor.description"],
  ["timeoutMs", "workflows.editor.workflowTimeout"],
  ["taskDefaults.timeoutMs", "workflows.editor.taskTimeout"],
  ["taskDefaults.retry.maxAttempts", "workflows.editor.defaultAttempts"],
  ["variables", "workflows.inputContract.contract"],
  ["outputSchema", "workflows.inputContract.outputSchema"],
  ["inputPresets", "workflows.inputContract.presets"],
  ["environment", "workflows.environment.title"],
  ["steps", "workflows.editor.nodes"],
]);

export function getWorkflowDraftValidationPresentation(
  script: WorkflowScript,
  t: TFunction,
): WorkflowDraftValidationPresentation | null {
  const parsed = WorkflowScriptSchema.safeParse(script);
  if (!parsed.success) {
    const issue = parsed.error.issues[0] as ValidationIssue | undefined;
    if (!issue) {
      return {
        message: t("workflows.messages.saveFailed"),
        stepId: null,
      };
    }
    const located = locateIssue(script, issue.path);
    return {
      message: formatSchemaIssue(located, issue, t),
      stepId: located.step?.id ?? null,
    };
  }

  const message = validateWorkflowDraft(script);
  if (!message) {
    return null;
  }
  const step = findStepMentionedInMessage(script.steps, message);
  if (!step) {
    return { message, stepId: null };
  }
  return {
    message: `${formatStepIdentity(step, t)} → ${t("workflows.graph.configuration")}: ${message}`,
    stepId: step.id,
  };
}

function formatSchemaIssue(located: LocatedIssue, issue: ValidationIssue, t: TFunction): string {
  const fieldLabel = formatFieldLabel(
    located.fieldPath,
    located.step ? STEP_FIELD_LABEL_KEYS : WORKFLOW_FIELD_LABEL_KEYS,
    t,
  );
  if (located.step) {
    return `${formatStepIdentity(located.step, t)} → ${formatStepModule(
      located.step,
      located.fieldPath,
      t,
    )} → ${fieldLabel}: ${formatIssueMessage(issue, t)}`;
  }
  return `${t("workflows.title")} → ${formatWorkflowModule(
    located.fieldPath,
    t,
  )} → ${fieldLabel}: ${formatIssueMessage(issue, t)}`;
}

function formatIssueMessage(issue: ValidationIssue, t: TFunction): string {
  if (issue.code === "too_small" && issue.minimum === 1) {
    return t("workflows.messages.fieldRequired");
  }
  return issue.message;
}

function locateIssue(script: WorkflowScript, path: ValidationPathSegment[]): LocatedIssue {
  let current: unknown = script;
  let step: WorkflowStep | null = null;
  let fieldPath: ValidationPathSegment[] = [];

  for (const segment of path) {
    if (isWorkflowStep(current)) {
      step = current;
      fieldPath = [];
    }
    fieldPath.push(segment);
    current = readPathSegment(current, segment);
  }
  if (isWorkflowStep(current)) {
    step = current;
    fieldPath = [];
  }
  return { step, fieldPath };
}

function readPathSegment(value: unknown, segment: ValidationPathSegment): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }
  return (value as Record<PropertyKey, unknown>)[segment];
}

function isWorkflowStep(value: unknown): value is WorkflowStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { id?: unknown; type?: unknown };
  return (
    typeof candidate.id === "string" &&
    (candidate.type === "bash" ||
      candidate.type === "python" ||
      candidate.type === "agent" ||
      candidate.type === "switch" ||
      candidate.type === "for")
  );
}

function formatStepIdentity(step: WorkflowStep, t: TFunction): string {
  const name = step.name?.trim() || formatStepType(step, t);
  return `${t("workflows.graph.nodeName")} “${name}” · ${t("workflows.graph.nodeId")} ${step.id}`;
}

function formatStepModule(
  step: WorkflowStep,
  fieldPath: ValidationPathSegment[],
  t: TFunction,
): string {
  const first = String(fieldPath[0] ?? "");
  if (first === "inputs" || first === "inputSchema" || first === "outputSchema") {
    return t("workflows.nodes.contract.title");
  }
  if (first === "variables" || first === "templateVariables") {
    if (step.type === "bash") return t("workflows.nodes.variables.bashTitle");
    if (step.type === "python") return t("workflows.nodes.variables.pythonTitle");
    if (step.type === "agent") return t("workflows.nodes.variables.agentTitle");
    return t("workflows.inputContract.nodeVariables");
  }
  if (first === "retry" || first === "timeoutMs") {
    return t("workflows.nodes.retry.title");
  }
  if (
    step.type === "agent" &&
    (first === "config" ||
      first === "initialPrompt" ||
      first === "subsequentPrompt" ||
      first === "subsequentPromptMode" ||
      first === "lifecycle" ||
      first === "outputMode")
  ) {
    return t("workflows.nodes.agent.executionPolicy");
  }
  return formatStepType(step, t);
}

function formatWorkflowModule(fieldPath: ValidationPathSegment[], t: TFunction): string {
  const first = String(fieldPath[0] ?? "");
  if (first === "variables" || first === "outputSchema" || first === "inputPresets") {
    return t("workflows.inputContract.title");
  }
  if (first === "environment") {
    return t("workflows.environment.title");
  }
  if (first === "taskDefaults" || first === "timeoutMs") {
    return t("workflows.nodes.agent.executionPolicy");
  }
  return t("workflows.title");
}

function formatFieldLabel(
  fieldPath: ValidationPathSegment[],
  labels: Map<string, string>,
  t: TFunction,
): string {
  const normalized = fieldPath.map(String);
  for (let length = normalized.length; length > 0; length -= 1) {
    const prefix = normalized.slice(0, length).join(".");
    const key = labels.get(prefix);
    if (!key) {
      continue;
    }
    const suffix = normalized.slice(length).filter((segment) => !/^\d+$/.test(segment));
    return suffix.length > 0 ? `${t(key)} · ${suffix.join(".")}` : t(key);
  }
  return normalized.filter((segment) => !/^\d+$/.test(segment)).join(".") || "configuration";
}

function formatStepType(step: WorkflowStep, t: TFunction): string {
  if (step.type === "bash") return t("workflows.nodes.types.bash");
  if (step.type === "python") return t("workflows.nodes.types.python");
  if (step.type === "agent") return t("workflows.nodes.types.agent");
  if (step.type === "switch") return t("workflows.nodes.types.switch");
  return t("workflows.nodes.types.for");
}

function findStepMentionedInMessage(steps: WorkflowStep[], message: string): WorkflowStep | null {
  const flattened: WorkflowStep[] = [];
  const visit = (items: WorkflowStep[]) => {
    for (const step of items) {
      flattened.push(step);
      if (step.type === "switch") {
        for (const candidate of step.cases) {
          visit(candidate.steps);
        }
        visit(step.defaultSteps ?? []);
      } else if (step.type === "for") {
        visit(step.steps);
      }
    }
  };
  visit(steps);
  return (
    flattened
      .sort((left, right) => right.id.length - left.id.length)
      .find((step) => message.includes(step.id)) ?? null
  );
}
