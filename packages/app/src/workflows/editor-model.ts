import {
  WorkflowScriptSchema,
  type WorkflowAgentStep,
  type WorkflowBashStep,
  type WorkflowForStep,
  type WorkflowPythonStep,
  type WorkflowScript,
  type WorkflowStep,
  type WorkflowSwitchStep,
} from "@getpaseo/protocol/workflow/types";
import type { PaseoInstructionTemplate } from "@getpaseo/protocol/messages";
import {
  DEFAULT_AGENT_INITIAL_PROMPT,
  DEFAULT_BASH_INITIAL_COMMAND,
  DEFAULT_PYTHON_CODE,
  DEFAULT_SWITCH_CONTROL,
} from "@/workflows/step-examples";
import { validateWorkflowSequenceLinks } from "@/workflows/sequence-links";

export { DEFAULT_AGENT_INITIAL_PROMPT } from "@/workflows/step-examples";

export type WorkflowStepType = WorkflowStep["type"];

const WORKFLOW_STEP_TYPES: readonly WorkflowStepType[] = [
  "bash",
  "python",
  "agent",
  "switch",
  "for",
];

export function getAvailableWorkflowStepTypes(allowPython: boolean): readonly WorkflowStepType[] {
  return allowPython
    ? WORKFLOW_STEP_TYPES
    : WORKFLOW_STEP_TYPES.filter((type) => type !== "python");
}

export interface WorkflowDefaultNames {
  workflow: string;
  bash: string;
  python: string;
  agent: string;
  switch: string;
  for: string;
}

const DEFAULT_NAMES: WorkflowDefaultNames = {
  workflow: "Untitled workflow",
  bash: "Bash command",
  python: "Python code",
  agent: "Agent",
  switch: "Switch",
  for: "For each",
};

export function createEmptyWorkflowScript(
  names: WorkflowDefaultNames = DEFAULT_NAMES,
): WorkflowScript {
  return {
    apiVersion: "paseo.sh/workflow/v1",
    kind: "Workflow",
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
      initialCommand: DEFAULT_BASH_INITIAL_COMMAND,
    } satisfies WorkflowBashStep;
  }
  if (type === "python") {
    return {
      id,
      name: names.python,
      type,
      code: DEFAULT_PYTHON_CODE,
    } satisfies WorkflowPythonStep;
  }
  if (type === "agent") {
    return {
      id,
      name: names.agent,
      type,
      lifecycle: "single",
      subsequentPromptMode: "reuse_initial",
      outputMode: "normal",
      initialPrompt: DEFAULT_AGENT_INITIAL_PROMPT,
      config: {
        provider: "codex",
        isolation: "local",
        archiveOnFinish: true,
      },
    } satisfies WorkflowAgentStep;
  }
  if (type === "switch") {
    return {
      id,
      name: names.switch,
      type,
      switchVar: "{{data.control}}",
      cases: [{ equals: DEFAULT_SWITCH_CONTROL, steps: [] }],
      defaultSteps: [],
    } satisfies WorkflowSwitchStep;
  }
  return {
    id,
    name: names.for,
    type,
    mode: "array",
    executionMode: "serial",
    items: "{{data.items}}",
    forControl: "{{data.control}}",
    maxIterations: 100,
    concurrency: 1,
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

export function updateAgentOutputMode(
  step: WorkflowAgentStep,
  outputMode: "normal" | "custom",
): WorkflowAgentStep {
  return {
    ...step,
    outputMode,
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

export function validateWorkflowDraft(script: WorkflowScript): string | null {
  const parsed = WorkflowScriptSchema.safeParse(script);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Workflow is invalid";
  }
  const ids = collectWorkflowStepIds(script.steps);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    return `Duplicate workflow step id: ${duplicate}`;
  }
  if (script.apiVersion !== "paseo.sh/workflow/v1" || script.kind !== "Workflow") {
    return "Workflow version 1 requires apiVersion paseo.sh/workflow/v1 and kind Workflow";
  }
  const defaultRetryError = validateRetryPolicy(script.taskDefaults?.retry, "Workflow default");
  if (defaultRetryError) {
    return defaultRetryError;
  }
  // oxlint-disable-next-line complexity -- Recursive validation keeps branch, loop, retry, and self-reference errors in one deterministic traversal.
  const validateSteps = (steps: WorkflowStep[], insideFor = false): string | null => {
    const sequenceError = validateWorkflowSequenceLinks(steps);
    if (sequenceError) {
      return sequenceError;
    }
    for (const step of steps) {
      if (step.type === "bash" || step.type === "python" || step.type === "agent") {
        const retryError = validateRetryPolicy(
          script.taskDefaults?.retry || step.retry
            ? { ...script.taskDefaults?.retry, ...step.retry }
            : undefined,
          `Workflow step ${step.id}`,
        );
        if (retryError) {
          return retryError;
        }
        if (step.type === "agent" && (step.lifecycle ?? "single") === "for" && !insideFor) {
          return `Agent step ${step.id} with For lifecycle must be inside a For loop`;
        }
      }
      if (step.type === "switch") {
        const cases = new Set<string>();
        for (const candidate of step.cases) {
          const normalized =
            typeof candidate.equals === "string" && !step.caseSensitive
              ? candidate.equals.toLowerCase()
              : JSON.stringify(candidate.equals);
          if (cases.has(normalized)) {
            return `Switch step ${step.id} has duplicate case: ${candidate.equals}`;
          }
          cases.add(normalized);
          const branchError = validateSteps(candidate.steps, insideFor);
          if (branchError) {
            return branchError;
          }
        }
        const defaultError = validateSteps(step.defaultSteps ?? [], insideFor);
        if (defaultError) {
          return defaultError;
        }
        if (!step.switchVar) {
          return `Switch step ${step.id} requires a value expression`;
        }
      } else if (step.type === "for") {
        const loopError = validateSteps(step.steps, true);
        if (loopError) {
          return loopError;
        }
        const mode = step.mode ?? "array";
        if (mode !== "true" && !step.items) {
          return `For step ${step.id} in ${mode} mode requires an items expression`;
        }
        const executionMode = step.executionMode ?? "serial";
        if (executionMode === "serial" && (step.concurrency ?? 1) !== 1) {
          return `For step ${step.id} in serial mode requires concurrency 1`;
        }
        if (executionMode === "parallel" && mode === "true" && (step.maxIterations ?? 100) === 0) {
          return `For step ${step.id} cannot run an unlimited True loop in parallel`;
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
