import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export const DEFAULT_BASH_INITIAL_COMMAND = `input="$(cat)"
node - "$input" <<'NODE'
const fs = require("node:fs");
const input = JSON.parse(process.argv[2]);

fs.writeSync(3, JSON.stringify({
  ...input,
  control: "done"
}));
NODE`;

export const DEFAULT_PYTHON_CODE = `import json
import os
import sys

payload = json.load(sys.stdin)
payload["control"] = "done"

with os.fdopen(3, "w") as result:
    json.dump(payload, result, ensure_ascii=False)`;

export const DEFAULT_AGENT_INITIAL_PROMPT = `[User]
请处理以下工作流输入：
{{payload}}`;

export const DEFAULT_SWITCH_CONTROL = "done";

const STANDARD_INPUT_EXAMPLE = JSON.stringify(
  {
    control: "",
    customer: { name: "Alice" },
    items: [{ id: 7 }],
  },
  null,
  2,
);

const COMMAND_OUTPUT_EXAMPLE = JSON.stringify(
  {
    control: "done",
    customer: { name: "Alice" },
    items: [{ id: 7 }],
  },
  null,
  2,
);

export interface WorkflowStepExamples {
  input: string;
  output: string;
  initialValue?: string;
}

export function getWorkflowStepExamples(step: WorkflowStep): WorkflowStepExamples {
  if (step.type === "bash") {
    return {
      input: STANDARD_INPUT_EXAMPLE,
      output: COMMAND_OUTPUT_EXAMPLE,
      initialValue: DEFAULT_BASH_INITIAL_COMMAND,
    };
  }
  if (step.type === "python") {
    return {
      input: STANDARD_INPUT_EXAMPLE,
      output: COMMAND_OUTPUT_EXAMPLE,
      initialValue: DEFAULT_PYTHON_CODE,
    };
  }
  if (step.type === "agent") {
    const outputField = (step.outputType ?? "answer") === "control" ? "control" : "answer";
    return {
      input: STANDARD_INPUT_EXAMPLE,
      output: JSON.stringify({ [outputField]: "Agent reply" }, null, 2),
      initialValue: DEFAULT_AGENT_INITIAL_PROMPT,
    };
  }
  if (step.type === "workflow") {
    return {
      input: STANDARD_INPUT_EXAMPLE,
      output: JSON.stringify(
        {
          control: "done",
          childResult: "The child workflow output",
        },
        null,
        2,
      ),
    };
  }
  if (step.type === "switch") {
    return {
      input: JSON.stringify(
        {
          control: DEFAULT_SWITCH_CONTROL,
          customer: { name: "Alice" },
        },
        null,
        2,
      ),
      output: JSON.stringify(
        {
          control: "done",
          reviewed: true,
        },
        null,
        2,
      ),
    };
  }
  return {
    input: JSON.stringify(
      {
        control: "",
        batchId: "batch-001",
      },
      null,
      2,
    ),
    output: JSON.stringify(
      {
        control: "break",
        batchId: "batch-001",
        loop: {
          item: null,
          index: 0,
          count: 100,
        },
      },
      null,
      2,
    ),
  };
}
