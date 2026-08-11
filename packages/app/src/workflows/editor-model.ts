import {
  DEFAULT_CONTROL_AGENT_SYSTEM_PROMPT,
  WorkflowScriptSchema,
  type WorkflowAgentStep,
  type WorkflowBashStep,
  type WorkflowForStep,
  type WorkflowNestedStep,
  type WorkflowScript,
  type WorkflowStep,
  type WorkflowSwitchStep,
} from "@getpaseo/protocol/workflow/types";
import type { PaseoInstructionTemplate } from "@getpaseo/protocol/messages";

export type WorkflowStepType = WorkflowStep["type"];

export interface WorkflowDefaultNames {
  workflow: string;
  bash: string;
  agent: string;
  workflowNode: string;
  switch: string;
  for: string;
}

const DEFAULT_NAMES: WorkflowDefaultNames = {
  workflow: "Untitled workflow",
  bash: "Bash command",
  agent: "Agent",
  workflowNode: "Workflow",
  switch: "Switch",
  for: "For each",
};

export const DEFAULT_AGENT_INITIAL_PROMPT = "[User] // 用户的提示词，替换该行";

export function createEmptyWorkflowScript(
  names: WorkflowDefaultNames = DEFAULT_NAMES,
): WorkflowScript {
  return {
    version: 1,
    name: names.workflow,
    description: "",
    timeoutMs: 24 * 60 * 60 * 1000,
    taskDefaults: {
      timeoutMs: 30 * 60 * 1000,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        backoffMultiplier: 2,
        jitter: true,
      },
    },
    steps: [createWorkflowStep("bash", [], names)],
  };
}

export function collectWorkflowStepIds(steps: WorkflowStep[]): string[] {
  const ids: string[] = [];
  const visit = (items: WorkflowStep[]) => {
    for (const step of items) {
      ids.push(step.id);
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
  return ids;
}

export function createWorkflowStep(
  type: WorkflowStepType,
  existingSteps: WorkflowStep[],
  names: WorkflowDefaultNames = DEFAULT_NAMES,
): WorkflowStep {
  const id = nextWorkflowStepId(type, existingSteps);
  if (type === "bash") {
    return {
      id,
      name: names.bash,
      type,
      initialCommand: "printf '%s\\n' \"$PASEO_WORKFLOW_INPUT_JSON\"",
    } satisfies WorkflowBashStep;
  }
  if (type === "agent") {
    return {
      id,
      name: names.agent,
      type,
      outputType: "answer",
      initialPrompt: DEFAULT_AGENT_INITIAL_PROMPT,
      config: {
        provider: "codex",
        isolation: "local",
        archiveOnFinish: true,
      },
    } satisfies WorkflowAgentStep;
  }
  if (type === "workflow") {
    return {
      id,
      name: names.workflowNode,
      type,
      workflowPath: "",
    } satisfies WorkflowNestedStep;
  }
  if (type === "switch") {
    return {
      id,
      name: names.switch,
      type,
      cases: [{ equals: "success", steps: [] }],
      defaultSteps: [],
    } satisfies WorkflowSwitchStep;
  }
  return {
    id,
    name: names.for,
    type,
    maxIterations: 100,
    steps: [createWorkflowStep("bash", existingSteps, names)],
  } satisfies WorkflowForStep;
}

export function nextWorkflowStepId(type: WorkflowStepType, existingSteps: WorkflowStep[]): string {
  const used = new Set(collectWorkflowStepIds(existingSteps));
  const base = type === "for" ? "for-each" : type;
  if (!used.has(base)) {
    return base;
  }
  for (let index = 2; index < 100_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

export function moveWorkflowStep(
  steps: WorkflowStep[],
  index: number,
  direction: -1 | 1,
): WorkflowStep[] {
  const destination = index + direction;
  if (index < 0 || index >= steps.length || destination < 0 || destination >= steps.length) {
    return steps;
  }
  const next = [...steps];
  const [step] = next.splice(index, 1);
  if (!step) {
    return steps;
  }
  next.splice(destination, 0, step);
  return next;
}

export function applyInstructionTemplateToAgentStep(
  step: WorkflowAgentStep,
  template: Pick<PaseoInstructionTemplate, "content">,
): WorkflowAgentStep {
  return {
    ...step,
    initialPrompt: template.content,
  };
}

export function applyInstructionTemplateToAgentSystemPrompt(
  step: WorkflowAgentStep,
  template: Pick<PaseoInstructionTemplate, "content">,
): WorkflowAgentStep {
  return {
    ...step,
    config: {
      ...step.config,
      systemPrompt: template.content,
    },
  };
}

export function updateAgentOutputType(
  step: WorkflowAgentStep,
  outputType: "answer" | "control",
): WorkflowAgentStep {
  return {
    ...step,
    outputType,
    config: {
      ...step.config,
      systemPrompt: outputType === "control" ? DEFAULT_CONTROL_AGENT_SYSTEM_PROMPT : undefined,
    },
  };
}

export function countWorkflowSteps(steps: WorkflowStep[]): number {
  return steps.reduce((count, step) => {
    if (step.type === "switch") {
      return (
        count +
        1 +
        step.cases.reduce((total, candidate) => total + countWorkflowSteps(candidate.steps), 0) +
        countWorkflowSteps(step.defaultSteps ?? [])
      );
    }
    if (step.type === "for") {
      return count + 1 + countWorkflowSteps(step.steps);
    }
    return count + 1;
  }, 0);
}

export function validateWorkflowDraft(
  script: WorkflowScript,
  currentWorkflowPath?: string | null,
): string | null {
  const parsed = WorkflowScriptSchema.safeParse(script);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Workflow is invalid";
  }
  const ids = collectWorkflowStepIds(script.steps);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    return `Duplicate workflow step id: ${duplicate}`;
  }
  const defaultRetryError = validateRetryPolicy(script.taskDefaults?.retry, "Workflow default");
  if (defaultRetryError) {
    return defaultRetryError;
  }
  // oxlint-disable-next-line complexity -- Recursive validation keeps branch, loop, retry, and self-reference errors in one deterministic traversal.
  const validateSteps = (steps: WorkflowStep[]): string | null => {
    for (const step of steps) {
      if (step.type === "bash" || step.type === "agent") {
        const retryError = validateRetryPolicy(
          script.taskDefaults?.retry || step.retry
            ? { ...script.taskDefaults?.retry, ...step.retry }
            : undefined,
          `Workflow step ${step.id}`,
        );
        if (retryError) {
          return retryError;
        }
      }
      if (
        step.type === "workflow" &&
        currentWorkflowPath &&
        step.workflowPath.trim() === currentWorkflowPath.trim()
      ) {
        return `Workflow step ${step.id} cannot reference its own workflow`;
      }
      if (step.type === "switch") {
        const cases = new Set<string>();
        for (const candidate of step.cases) {
          const normalized = step.caseSensitive ? candidate.equals : candidate.equals.toLowerCase();
          if (cases.has(normalized)) {
            return `Switch step ${step.id} has duplicate case: ${candidate.equals}`;
          }
          cases.add(normalized);
          const branchError = validateSteps(candidate.steps);
          if (branchError) {
            return branchError;
          }
        }
        const defaultError = validateSteps(step.defaultSteps ?? []);
        if (defaultError) {
          return defaultError;
        }
      } else if (step.type === "for") {
        const loopError = validateSteps(step.steps);
        if (loopError) {
          return loopError;
        }
      }
    }
    return null;
  };
  return validateSteps(script.steps);
}

function validateRetryPolicy(
  retry: { initialDelayMs?: number; maxDelayMs?: number } | undefined,
  label: string,
): string | null {
  if (
    retry?.initialDelayMs !== undefined &&
    retry.maxDelayMs !== undefined &&
    retry.maxDelayMs < retry.initialDelayMs
  ) {
    return `${label} retry maxDelayMs cannot be less than initialDelayMs`;
  }
  return null;
}
