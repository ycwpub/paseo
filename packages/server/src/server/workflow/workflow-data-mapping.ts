import type { WorkflowData, WorkflowInputMapping } from "@getpaseo/protocol/workflow/data-contract";

const WHOLE_EXPRESSION_PATTERN = /^\s*{{\s*([^{}]+?)\s*}}\s*$/;
const INLINE_EXPRESSION_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

export interface WorkflowDataMappingContext {
  workflowInputs: WorkflowData;
  currentInput: WorkflowData;
  nodeOutputs: Record<string, WorkflowData>;
}

export function resolveWorkflowNodeInput(
  mapping: WorkflowInputMapping | undefined,
  context: WorkflowDataMappingContext,
): WorkflowData {
  if (!mapping) {
    return { ...context.currentInput };
  }
  return resolveMappingValue(mapping, createExpressionRoot(context)) as WorkflowData;
}

export function resolveWorkflowExpression(
  expression: string,
  context: WorkflowDataMappingContext,
): unknown {
  return resolveTemplateValue(expression, createExpressionRoot(context));
}

function createExpressionRoot(context: WorkflowDataMappingContext): Record<string, unknown> {
  const nodes = Object.fromEntries(
    Object.entries(context.nodeOutputs).map(([nodeId, outputs]) => [nodeId, { outputs }]),
  );
  return {
    workflow: { inputs: context.workflowInputs },
    nodes,
    input: context.currentInput,
    payload: context.currentInput,
    ...context.currentInput,
  };
}

function resolveMappingValue(value: unknown, root: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return resolveTemplateValue(value, root);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveMappingValue(item, root));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveMappingValue(item, root)]),
    );
  }
  return value;
}

function resolveTemplateValue(template: string, root: Record<string, unknown>): unknown {
  const wholeExpression = WHOLE_EXPRESSION_PATTERN.exec(template);
  if (wholeExpression?.[1]) {
    return resolveRequiredPath(root, wholeExpression[1].trim());
  }
  return template.replace(INLINE_EXPRESSION_PATTERN, (_match, path: string) =>
    stringifyExpressionValue(resolveRequiredPath(root, path.trim())),
  );
}

function resolveRequiredPath(root: Record<string, unknown>, path: string): unknown {
  if (!path) {
    throw new Error("Workflow expression path cannot be empty");
  }
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      const index = Number(segment);
      if (index >= current.length) {
        throw new Error(`Workflow expression path not found: ${path}`);
      }
      current = current[index];
      continue;
    }
    if (
      typeof current !== "object" ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      throw new Error(`Workflow expression path not found: ${path}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringifyExpressionValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value) ?? "";
}
