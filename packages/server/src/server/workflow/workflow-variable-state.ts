import type {
  WorkflowData,
  WorkflowLoopInput,
  WorkflowLoopVariableDefinitions,
  WorkflowNodeInputEnvelope,
  WorkflowVariableDefinitions,
  WorkflowVariableModification,
  WorkflowVariableValues,
} from "@getpaseo/protocol/workflow/data-contract";
import { isWorkflowInt64 } from "@getpaseo/protocol/workflow/data-contract";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export interface WorkflowLoopContext {
  scope: WorkflowLoopVariableScope;
  item: unknown;
  index: number;
  count: number;
  modificationAllowed: boolean;
}

export class WorkflowLoopVariableScope {
  private readonly definitions: WorkflowLoopVariableDefinitions;
  private readonly values: WorkflowVariableValues;

  constructor(definitions: WorkflowLoopVariableDefinitions | undefined) {
    this.definitions = definitions ?? {};
    this.values = createInitialValues(this.definitions);
  }

  createInput(context: Pick<WorkflowLoopContext, "item" | "index" | "count">): WorkflowLoopInput {
    return {
      var: {
        item: structuredClone(context.item),
        index: context.index,
        count: context.count,
        ...this.values,
      },
    };
  }

  validate(values: WorkflowVariableValues): void {
    validateVariableUpdate("loop", this.definitions, values);
  }

  assign(values: WorkflowVariableValues): void {
    Object.assign(this.values, values);
  }

  snapshot(): WorkflowVariableValues {
    return { ...this.values };
  }
}

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

  createLoopScope(
    definitions: WorkflowLoopVariableDefinitions | undefined,
  ): WorkflowLoopVariableScope {
    return new WorkflowLoopVariableScope(definitions);
  }

  createNodeInput(
    stepId: string,
    data: WorkflowData,
    originInput: WorkflowData,
    loopContext: WorkflowLoopContext | null = null,
  ): WorkflowNodeInputEnvelope {
    const input: WorkflowNodeInputEnvelope = {
      data: structuredClone(data),
      origin_input: structuredClone(originInput),
      workflow: {
        var: { ...this.workflowValues },
      },
      node: {
        var: { ...this.nodeValues.get(stepId) },
      },
    };
    if (loopContext) {
      input.loop = loopContext.scope.createInput(loopContext);
    }
    return input;
  }

  async apply(
    modification: WorkflowVariableModification,
    loopContext: WorkflowLoopContext | null = null,
  ): Promise<void> {
    await this.withLock(async () => {
      validateVariableUpdate("workflow", this.workflowDefinitions, modification.workflow.var);
      const loopValues = modification.loop.var;
      if (Object.keys(loopValues).length > 0) {
        if (!loopContext) {
          throw new Error("Cannot modify loop variables outside a For loop");
        }
        if (!loopContext.modificationAllowed) {
          throw new Error("Cannot modify loop variables in parallel For execution");
        }
        loopContext.scope.validate(loopValues);
      }
      Object.assign(this.workflowValues, modification.workflow.var);
      loopContext?.scope.assign(loopValues);
    });
  }

  snapshotWorkflow(): WorkflowVariableValues {
    return { ...this.workflowValues };
  }

  snapshotNode(stepId: string): WorkflowVariableValues {
    return { ...this.nodeValues.get(stepId) };
  }

  snapshotLoop(loopContext: WorkflowLoopContext | null): WorkflowLoopInput | undefined {
    return loopContext?.scope.createInput(loopContext);
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
  scope: "workflow" | "loop",
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
