import {
  WorkflowNodeResultEnvelopeSchema,
  type WorkflowNodeResultEnvelope,
} from "@getpaseo/protocol/workflow/data-contract";

export const WORKFLOW_RESULT_FILE_DESCRIPTOR = 3;
export const MAX_WORKFLOW_RESULT_CHARS = 200_000;

interface ParseCommandNodeResultInput {
  resultJson: string;
  resultExceededLimit: boolean;
  commandType: "Bash" | "Python";
}

export class WorkflowNodeBusinessError extends Error {
  constructor(
    message: string,
    readonly forbidRetry: boolean,
  ) {
    super(message);
    this.name = "WorkflowNodeBusinessError";
  }
}

export function parseCommandNodeResult(
  input: ParseCommandNodeResultInput,
): WorkflowNodeResultEnvelope {
  if (input.resultExceededLimit) {
    throw new Error(
      `${input.commandType} workflow node result exceeded ${MAX_WORKFLOW_RESULT_CHARS} characters`,
    );
  }
  if (!input.resultJson.trim()) {
    throw new Error(
      `${input.commandType} workflow node did not write a result to file descriptor ${WORKFLOW_RESULT_FILE_DESCRIPTOR}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.resultJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Workflow node result is not valid JSON: ${message}`, { cause: error });
  }

  const result = WorkflowNodeResultEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Workflow node result must use the envelope {"data":{},"modify":{"workflow":{"var":{}}},"base_resp":{"status_code":0,"status_msg":"","forbid_retry":0}}. data is required; modify and base_resp are optional: ${result.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }
  if (result.data.base_resp.status_code !== 0) {
    throw new WorkflowNodeBusinessError(
      result.data.base_resp.status_msg ||
        `Workflow node returned status_code ${result.data.base_resp.status_code}`,
      result.data.base_resp.forbid_retry !== 0,
    );
  }
  return result.data;
}
