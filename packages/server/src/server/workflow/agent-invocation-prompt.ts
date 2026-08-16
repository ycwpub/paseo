import type { WorkflowAgentStep } from "@getpaseo/protocol/workflow/types";

export function resolveWorkflowAgentInvocationPrompt(input: {
  step: WorkflowAgentStep;
  isFirstInvocation: boolean;
  initialPrompt: string;
  subsequentPrompt?: string;
}): string {
  if (
    input.isFirstInvocation ||
    (input.step.lifecycle ?? "single") === "single" ||
    (input.step.subsequentPromptMode ?? "reuse_initial") === "reuse_initial"
  ) {
    return input.initialPrompt;
  }
  if (!input.subsequentPrompt) {
    throw new Error(
      `Agent step ${input.step.id} requires a custom prompt for non-first executions`,
    );
  }
  return input.subsequentPrompt;
}
