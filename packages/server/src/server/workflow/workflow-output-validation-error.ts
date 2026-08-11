export class WorkflowOutputValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkflowOutputValidationError";
  }
}

export function appendWorkflowOutputRepairPrompt(prompt: string, validationError: string): string {
  return [
    prompt,
    "",
    "Your previous final answer was rejected by the Workflow output validator.",
    `Validator error: ${validationError}`,
    "Return a corrected final answer that satisfies the configured output contract. Do not explain the correction outside the required output.",
  ].join("\n");
}
