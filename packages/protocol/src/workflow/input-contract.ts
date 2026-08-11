import { z } from "zod";

export const WorkflowInputValueTypeSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
]);
export type WorkflowInputValueType = z.infer<typeof WorkflowInputValueTypeSchema>;

export const WorkflowInputPropertySchema = z.object({
  type: WorkflowInputValueTypeSchema,
  title: z.string().trim().min(1).max(256).optional(),
  description: z.string().max(1_000).optional(),
  default: z.unknown().optional(),
  enum: z.array(z.unknown()).min(1).max(100).optional(),
});
export type WorkflowInputProperty = z.infer<typeof WorkflowInputPropertySchema>;

export const WorkflowInputContractSchema = z.object({
  properties: z.record(z.string().trim().min(1).max(128), WorkflowInputPropertySchema),
  required: z.array(z.string().trim().min(1).max(128)).max(100).optional(),
  additionalProperties: z.boolean().optional(),
});
export type WorkflowInputContract = z.infer<typeof WorkflowInputContractSchema>;

export const WorkflowInputPresetSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(256),
  description: z.string().max(1_000).optional(),
  payload: z.record(z.string(), z.unknown()),
});
export type WorkflowInputPreset = z.infer<typeof WorkflowInputPresetSchema>;

export interface WorkflowInputIssue {
  path: string;
  code: "required" | "type" | "enum" | "additional_property";
  message: string;
}

export interface WorkflowInputValidation {
  payload: Record<string, unknown>;
  issues: WorkflowInputIssue[];
}

const RESERVED_INPUT_FIELDS = new Set(["control"]);

export function applyWorkflowInputContract(
  contract: WorkflowInputContract | undefined,
  input: Record<string, unknown>,
): WorkflowInputValidation {
  if (!contract) {
    return { payload: input, issues: [] };
  }
  const payload = { ...input };
  for (const [name, property] of Object.entries(contract.properties)) {
    if (!Object.hasOwn(payload, name) && Object.hasOwn(property, "default")) {
      payload[name] = property.default;
    }
  }

  const issues: WorkflowInputIssue[] = [];
  for (const name of contract.required ?? []) {
    if (!Object.hasOwn(payload, name)) {
      issues.push({
        path: name,
        code: "required",
        message: `Workflow input field "${name}" is required`,
      });
    }
  }
  for (const [name, value] of Object.entries(payload)) {
    const property = contract.properties[name];
    if (!property) {
      if (contract.additionalProperties === false && !RESERVED_INPUT_FIELDS.has(name)) {
        issues.push({
          path: name,
          code: "additional_property",
          message: `Workflow input field "${name}" is not allowed`,
        });
      }
      continue;
    }
    if (!matchesWorkflowInputType(value, property.type)) {
      issues.push({
        path: name,
        code: "type",
        message: `Workflow input field "${name}" must be ${formatType(property.type)}`,
      });
      continue;
    }
    if (property.enum && !property.enum.some((candidate) => valuesEqual(candidate, value))) {
      issues.push({
        path: name,
        code: "enum",
        message: `Workflow input field "${name}" must match one of its allowed values`,
      });
    }
  }
  return { payload, issues };
}

export function validateWorkflowInputContractDefinition(
  contract: WorkflowInputContract | undefined,
): WorkflowInputIssue[] {
  if (!contract) {
    return [];
  }
  const issues: WorkflowInputIssue[] = [];
  for (const name of contract.required ?? []) {
    if (!contract.properties[name]) {
      issues.push({
        path: name,
        code: "required",
        message: `Required workflow input field "${name}" has no property definition`,
      });
    }
  }
  for (const [name, property] of Object.entries(contract.properties)) {
    if (Object.hasOwn(property, "default")) {
      const validation = applyWorkflowInputContract(
        {
          properties: { [name]: property },
          required: [name],
          additionalProperties: true,
        },
        {},
      );
      issues.push(...validation.issues);
    }
    for (const value of property.enum ?? []) {
      if (!matchesWorkflowInputType(value, property.type)) {
        issues.push({
          path: name,
          code: "type",
          message: `Allowed value for workflow input field "${name}" must be ${formatType(property.type)}`,
        });
      }
    }
  }
  return issues;
}

function matchesWorkflowInputType(value: unknown, type: WorkflowInputValueType): boolean {
  if (type === "string") {
    return typeof value === "string";
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  if (type === "boolean") {
    return typeof value === "boolean";
  }
  if (type === "array") {
    return Array.isArray(value);
  }
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatType(type: WorkflowInputValueType): string {
  return type === "integer" ? "an integer" : `a${type === "array" ? "n" : ""} ${type}`;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
