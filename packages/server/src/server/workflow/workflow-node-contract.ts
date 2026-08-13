import Ajv, { type ErrorObject, type Options as AjvOptions, type ValidateFunction } from "ajv";
import type { WorkflowData, WorkflowJsonSchema } from "@getpaseo/protocol/workflow/data-contract";

const AjvConstructor = Ajv as unknown as {
  new (options?: AjvOptions): {
    compile: (schema: WorkflowJsonSchema) => ValidateFunction;
  };
};
const ajv = new AjvConstructor({
  allErrors: true,
  strict: false,
});
const validatorCache = new WeakMap<WorkflowJsonSchema, ValidateFunction>();

export function validateWorkflowNodeData(
  schema: WorkflowJsonSchema | undefined,
  data: WorkflowData,
  label: string,
): void {
  if (!schema) {
    return;
  }
  const validate = getValidator(schema);
  if (validate(data)) {
    return;
  }
  throw new Error(`${label} failed schema validation: ${formatErrors(validate.errors)}`);
}

export function validateWorkflowNodeSchema(
  schema: WorkflowJsonSchema | undefined,
  label: string,
): void {
  if (!schema) {
    return;
  }
  try {
    getValidator(schema);
  } catch (error) {
    throw new Error(
      `${label} is not a valid JSON Schema: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function getValidator(schema: WorkflowJsonSchema): ValidateFunction {
  const cached = validatorCache.get(schema);
  if (cached) {
    return cached;
  }
  const validate = ajv.compile({
    ...schema,
    additionalProperties: false,
  });
  validatorCache.set(schema, validate);
  return validate;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) {
    return "unknown validation error";
  }
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`)
    .join("; ");
}
