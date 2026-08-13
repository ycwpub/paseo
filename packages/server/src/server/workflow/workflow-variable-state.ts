import type {
  WorkflowData,
  WorkflowNodeInputEnvelope,
  WorkflowVariableDefinitions,
  WorkflowVariableModification,
  WorkflowVariableValues,
} from "@getpaseo/protocol/workflow/data-contract";
import { isWorkflowInt64 } from "@getpaseo/protocol/workflow/data-contract";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export class WorkflowVariableState {
  private readonly workflowDefinitions: WorkflowVariableDefinitions;
  private readonly nodeDefinitions: Map<string, WorkflowVariableDefinitions>;
  private readonly workflowValues: WorkflowVariableValues;
  private readonly nodeValues: Map<string, WorkflowVariableValues>;
  private lockTail: Promise<void> = Promise.resolve();

  constructor(workflowDefinitions: WorkflowVariableDefinitions | undefined, steps: WorkflowStep[]) {
    this.workflowDefinitions = workflowDefinitions ?? {};
    this.nodeDefinitions = collectNodeVariableDefinitions(steps);
    this.workflowValues = createInitialValues(this.workflowDefinitions);
    this.nodeValues = new Map(
      [...this.nodeDefinitions].map(([stepId, definitions]) => [
        stepId,
        createInitialValues(definitions),
      ]),
    );
  }

  createNodeInput(stepId: string, data: WorkflowData): WorkflowNodeInputEnvelope {
    return {
      data: structuredClone(data),
      workflow: {
        var: { ...this.workflowValues },
      },
      node: {
        var: { ...this.nodeValues.get(stepId) },
      },
    };
  }

  async apply(stepId: string, modification: WorkflowVariableModification): Promise<void> {
    await this.withLock(async () => {
      const nodeDefinitions = this.nodeDefinitions.get(stepId) ?? {};
      validateVariableUpdate("workflow", this.workflowDefinitions, modification.workflow.var);
      validateVariableUpdate("node", nodeDefinitions, modification.node.var);
      Object.assign(this.workflowValues, modification.workflow.var);
      const nodeValues = this.nodeValues.get(stepId) ?? {};
      Object.assign(nodeValues, modification.node.var);
      this.nodeValues.set(stepId, nodeValues);
    });
  }

  snapshotWorkflow(): WorkflowVariableValues {
    return { ...this.workflowValues };
  }

  snapshotNode(stepId: string): WorkflowVariableValues {
    return { ...this.nodeValues.get(stepId) };
  }

  private async withLock<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.lockTail;
    let release: () => void = () => undefined;
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function collectNodeVariableDefinitions(
  steps: WorkflowStep[],
): Map<string, WorkflowVariableDefinitions> {
  const definitions = new Map<string, WorkflowVariableDefinitions>();
  const visit = (items: WorkflowStep[]) => {
    for (const step of items) {
      definitions.set(step.id, step.variables ?? {});
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
  return definitions;
}

function createInitialValues(definitions: WorkflowVariableDefinitions): WorkflowVariableValues {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      definition.default ?? (definition.type === "int64" ? "0" : ""),
    ]),
  );
}

function validateVariableUpdate(
  scope: "workflow" | "node",
  definitions: WorkflowVariableDefinitions,
  values: WorkflowVariableValues,
): void {
  for (const [name, value] of Object.entries(values)) {
    const definition = definitions[name];
    if (!definition) {
      throw new Error(`Cannot modify undeclared ${scope} variable "${name}"`);
    }
    if (definition.type === "int64" && !isWorkflowInt64(value)) {
      throw new Error(
        `${scope} variable "${name}" must be a decimal string in the signed 64-bit range`,
      );
    }
  }
}
