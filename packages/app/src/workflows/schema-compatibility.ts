import type {
  WorkflowInputMapping,
  WorkflowJsonSchema,
} from "@getpaseo/protocol/workflow/data-contract";
import type { WorkflowScript, WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { buildWorkflowGraphModel } from "@/workflows/graph-model";

const WHOLE_EXPRESSION_PATTERN = /^\s*{{\s*([^{}]+?)\s*}}\s*$/;

type WorkflowSchemaCompatibilityIssue =
  | {
      kind: "required_not_guaranteed";
      path: string;
    }
  | {
      kind: "field_not_accepted";
      path: string;
    }
  | {
      kind: "type_mismatch";
      path: string;
      outputTypes: string;
      inputTypes: string;
    };

export interface WorkflowSchemaCompatibilityWarning {
  sourceStepId: string;
  targetStepId: string | null;
  issue: WorkflowSchemaCompatibilityIssue;
}

export function findWorkflowSchemaCompatibilityWarnings(
  script: WorkflowScript,
): WorkflowSchemaCompatibilityWarning[] {
  const stepsById = collectStepsById(script.steps);
  const outputSchemas = collectOutputSchemas(stepsById);
  const graph = buildWorkflowGraphModel(script.steps);
  const warnings: WorkflowSchemaCompatibilityWarning[] = [];

  for (const edge of graph.edges) {
    if (edge.kind === "loop_back") {
      continue;
    }
    const source = stepsById.get(edge.from);
    const target = stepsById.get(edge.to);
    if (!source || !target || !target.inputSchema) {
      continue;
    }
    const effectiveOutputSchema = resolveEffectiveOutputSchema(
      target,
      getStepOutputSchema(source),
      outputSchemas,
    );
    if (!effectiveOutputSchema) {
      continue;
    }
    appendCompatibilityWarnings(
      warnings,
      source.id,
      target.id,
      effectiveOutputSchema,
      target.inputSchema,
    );
  }

  if (script.outputSchema) {
    for (const terminal of graph.terminals) {
      const source = stepsById.get(terminal.stepId);
      const outputSchema = source ? getStepOutputSchema(source) : undefined;
      if (!source || !outputSchema) {
        continue;
      }
      appendCompatibilityWarnings(warnings, source.id, null, outputSchema, script.outputSchema);
    }
  }

  return deduplicateWarnings(warnings);
}

function collectStepsById(steps: readonly WorkflowStep[]): Map<string, WorkflowStep> {
  const collected = new Map<string, WorkflowStep>();
  const visit = (sequence: readonly WorkflowStep[]): void => {
    for (const step of sequence) {
      collected.set(step.id, step);
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
  return collected;
}

function collectOutputSchemas(
  stepsById: ReadonlyMap<string, WorkflowStep>,
): ReadonlyMap<string, WorkflowJsonSchema> {
  const schemas = new Map<string, WorkflowJsonSchema>();
  for (const [stepId, step] of stepsById) {
    const schema = getStepOutputSchema(step);
    if (schema) {
      schemas.set(stepId, schema);
    }
  }
  return schemas;
}

function getStepOutputSchema(step: WorkflowStep): WorkflowJsonSchema | undefined {
  if (step.type === "bash" || step.type === "python" || step.type === "agent") {
    return step.outputSchema;
  }
  return undefined;
}

function getStepInputMapping(step: WorkflowStep): WorkflowInputMapping | undefined {
  if (step.type === "bash" || step.type === "python" || step.type === "agent") {
    return step.inputs;
  }
  return undefined;
}

function resolveEffectiveOutputSchema(
  target: WorkflowStep,
  directOutputSchema: WorkflowJsonSchema | undefined,
  outputSchemas: ReadonlyMap<string, WorkflowJsonSchema>,
): WorkflowJsonSchema | undefined {
  const mapping = getStepInputMapping(target);
  if (!mapping) {
    return directOutputSchema;
  }
  return inferMappingSchema(mapping, directOutputSchema, outputSchemas);
}

function inferMappingSchema(
  mapping: WorkflowInputMapping,
  directOutputSchema: WorkflowJsonSchema | undefined,
  outputSchemas: ReadonlyMap<string, WorkflowJsonSchema>,
): WorkflowJsonSchema {
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(mapping).map(([key, value]) => [
        key,
        inferMappingValueSchema(value, directOutputSchema, outputSchemas),
      ]),
    ),
    required: Object.keys(mapping),
    additionalProperties: false,
  };
}

function inferMappingValueSchema(
  value: unknown,
  directOutputSchema: WorkflowJsonSchema | undefined,
  outputSchemas: ReadonlyMap<string, WorkflowJsonSchema>,
): WorkflowJsonSchema {
  if (value === null) {
    return { type: "null" };
  }
  if (typeof value === "boolean") {
    return { type: "boolean" };
  }
  if (typeof value === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }
  if (typeof value === "string") {
    const wholeExpression = WHOLE_EXPRESSION_PATTERN.exec(value);
    if (wholeExpression?.[1]) {
      return (
        resolveExpressionSchema(wholeExpression[1].trim(), directOutputSchema, outputSchemas) ?? {}
      );
    }
    return { type: "string" };
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      ...(value.length > 0
        ? { items: inferMappingValueSchema(value[0], directOutputSchema, outputSchemas) }
        : {}),
    };
  }
  if (isRecord(value)) {
    return inferMappingSchema(value, directOutputSchema, outputSchemas);
  }
  return {};
}

function resolveExpressionSchema(
  expression: string,
  directOutputSchema: WorkflowJsonSchema | undefined,
  outputSchemas: ReadonlyMap<string, WorkflowJsonSchema>,
): WorkflowJsonSchema | undefined {
  const segments = expression.split(".");
  const root = segments[0];
  if (root === "data" || root === "input" || root === "payload") {
    return resolveSchemaPath(directOutputSchema, segments.slice(1));
  }
  if (root === "nodes" && segments[2] === "outputs") {
    return resolveSchemaPath(outputSchemas.get(segments[1] ?? ""), segments.slice(3));
  }
  if (root === "workflow" || root === "node") {
    return expression.includes(".var.") ? { type: "string" } : undefined;
  }
  return resolveSchemaPath(directOutputSchema, segments);
}

function resolveSchemaPath(
  schema: WorkflowJsonSchema | undefined,
  segments: readonly string[],
): WorkflowJsonSchema | undefined {
  let current = schema;
  for (const segment of segments) {
    const properties = readSchemaProperties(current);
    current = properties?.[segment];
    if (!current) {
      return undefined;
    }
  }
  return current;
}

function appendCompatibilityWarnings(
  warnings: WorkflowSchemaCompatibilityWarning[],
  sourceStepId: string,
  targetStepId: string | null,
  outputSchema: WorkflowJsonSchema,
  inputSchema: WorkflowJsonSchema,
): void {
  const issues = compareSchemas(outputSchema, inputSchema, "", true);
  for (const issue of issues) {
    warnings.push({ sourceStepId, targetStepId, issue });
  }
}

function compareSchemas(
  outputSchema: WorkflowJsonSchema,
  inputSchema: WorkflowJsonSchema,
  path: string,
  inputIsClosed: boolean,
): WorkflowSchemaCompatibilityIssue[] {
  const issues: WorkflowSchemaCompatibilityIssue[] = [];
  const outputTypes = readSchemaTypes(outputSchema);
  const inputTypes = readSchemaTypes(inputSchema);
  if (
    outputTypes &&
    inputTypes &&
    !outputTypes.every((outputType) =>
      inputTypes.some((inputType) => acceptsSchemaType(inputType, outputType)),
    )
  ) {
    issues.push({
      kind: "type_mismatch",
      path: path || "data",
      outputTypes: outputTypes.join(" | "),
      inputTypes: inputTypes.join(" | "),
    });
    return issues;
  }

  if (schemaCanBeObject(outputSchema) && schemaCanBeObject(inputSchema)) {
    issues.push(...compareObjectSchemas(outputSchema, inputSchema, path, inputIsClosed));
  }

  if (schemaCanBeArray(outputSchema) && schemaCanBeArray(inputSchema)) {
    issues.push(...compareArraySchemas(outputSchema, inputSchema, path));
  }
  return issues;
}

function compareObjectSchemas(
  outputSchema: WorkflowJsonSchema,
  inputSchema: WorkflowJsonSchema,
  path: string,
  inputIsClosed: boolean,
): WorkflowSchemaCompatibilityIssue[] {
  const issues: WorkflowSchemaCompatibilityIssue[] = [];
  const outputProperties = readSchemaProperties(outputSchema) ?? {};
  const inputProperties = readSchemaProperties(inputSchema) ?? {};
  const outputRequired = readRequiredProperties(outputSchema);
  const inputRequired = readRequiredProperties(inputSchema);

  for (const field of inputRequired) {
    if (!outputRequired.has(field)) {
      issues.push({
        kind: "required_not_guaranteed",
        path: joinPath(path, field),
      });
    }
  }

  const rejectsAdditionalFields = inputIsClosed || inputSchema.additionalProperties === false;
  if (rejectsAdditionalFields) {
    for (const field of Object.keys(outputProperties)) {
      if (!(field in inputProperties)) {
        issues.push({
          kind: "field_not_accepted",
          path: joinPath(path, field),
        });
      }
    }
  }

  for (const [field, outputPropertySchema] of Object.entries(outputProperties)) {
    const inputPropertySchema = inputProperties[field];
    if (!inputPropertySchema) {
      continue;
    }
    issues.push(
      ...compareSchemas(
        outputPropertySchema,
        inputPropertySchema,
        joinPath(path, field),
        inputPropertySchema.additionalProperties === false,
      ),
    );
  }
  return issues;
}

function compareArraySchemas(
  outputSchema: WorkflowJsonSchema,
  inputSchema: WorkflowJsonSchema,
  path: string,
): WorkflowSchemaCompatibilityIssue[] {
  const outputItems = readSchemaRecord(outputSchema.items);
  const inputItems = readSchemaRecord(inputSchema.items);
  return outputItems && inputItems
    ? compareSchemas(outputItems, inputItems, `${path || "data"}[]`, false)
    : [];
}

function readSchemaTypes(schema: WorkflowJsonSchema): string[] | null {
  if (typeof schema.type === "string") {
    return [schema.type];
  }
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((value): value is string => typeof value === "string");
    return types.length > 0 ? types : null;
  }
  if (schema.properties !== undefined || schema.required !== undefined) {
    return ["object"];
  }
  return null;
}

function schemaCanBeObject(schema: WorkflowJsonSchema): boolean {
  const types = readSchemaTypes(schema);
  return types === null || types.includes("object");
}

function schemaCanBeArray(schema: WorkflowJsonSchema): boolean {
  const types = readSchemaTypes(schema);
  return types === null || types.includes("array");
}

function acceptsSchemaType(inputType: string, outputType: string): boolean {
  return inputType === outputType || (inputType === "number" && outputType === "integer");
}

function readSchemaProperties(
  schema: WorkflowJsonSchema | undefined,
): Record<string, WorkflowJsonSchema> | null {
  if (!schema || !isRecord(schema.properties)) {
    return null;
  }
  const properties: Record<string, WorkflowJsonSchema> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    const property = readSchemaRecord(value);
    if (property) {
      properties[key] = property;
    }
  }
  return properties;
}

function readRequiredProperties(schema: WorkflowJsonSchema): ReadonlySet<string> {
  if (!Array.isArray(schema.required)) {
    return new Set();
  }
  return new Set(schema.required.filter((value): value is string => typeof value === "string"));
}

function readSchemaRecord(value: unknown): WorkflowJsonSchema | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(parent: string, field: string): string {
  return parent ? `${parent}.${field}` : field;
}

function deduplicateWarnings(
  warnings: readonly WorkflowSchemaCompatibilityWarning[],
): WorkflowSchemaCompatibilityWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = JSON.stringify(warning);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
