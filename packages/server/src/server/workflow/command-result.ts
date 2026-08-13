import {
  WorkflowNodeResultSchema,
  type WorkflowNodeResult,
} from "@getpaseo/protocol/workflow/types";
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

export function parseCommandNodeResult(input: ParseCommandNodeResultInput): WorkflowNodeResult {
  if (input.resultExceededLimit) {
    return frameworkError(
      `${input.commandType} workflow node result exceeded ${MAX_WORKFLOW_RESULT_CHARS} characters`,
    );
  }
  if (!input.resultJson.trim()) {
    return frameworkError(
      `${input.commandType} workflow node did not write a result to file descriptor ${WORKFLOW_RESULT_FILE_DESCRIPTOR}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.resultJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return frameworkError(`Workflow node result is not valid JSON: ${message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return frameworkError("Workflow node result must be a JSON object");
  }

  const payload = parsed as Record<string, unknown>;
  if (Object.hasOwn(payload, "error")) {
    return frameworkError(
      'Workflow node result must not contain reserved field "error"; use a non-zero exit code and stderr to report failure',
    );
  }
  if (payload.control !== undefined && typeof payload.control !== "string") {
    return frameworkError('Workflow node result field "control" must be a string');
  }

  return WorkflowNodeResultSchema.parse({
    ...payload,
    control: payload.control ?? "",
    error: "",
  });
}

export function parseCommandNodeResultEnvelope(
  input: ParseCommandNodeResultInput,
): WorkflowNodeResultEnvelope {
  const parsed = parseResultJson(input);
  const result = WorkflowNodeResultEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Workflow node result must use the v2 envelope {"outputs":{},"artifacts":[],"flow":{"action":"next"}}: ${result.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }
  return result.data;
}

function frameworkError(message: string): WorkflowNodeResult {
  return {
    control: "",
    error: message,
  };
}

function parseResultJson(input: ParseCommandNodeResultInput): unknown {
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
  try {
    return JSON.parse(input.resultJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Workflow node result is not valid JSON: ${message}`, { cause: error });
  }
}
