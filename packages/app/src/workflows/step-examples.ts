import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export const DEFAULT_BASH_INITIAL_COMMAND = `input="$(cat)"
node - "$input" <<'NODE'
const fs = require("node:fs");
const input = JSON.parse(process.argv[2]);

fs.writeSync(3, JSON.stringify({
  outputs: {
    ...input,
    status: "done"
  },
  flow: { action: "next" }
}));
NODE`;

export const BASH_CHILD_WORKFLOW_EXAMPLE = `input="$(cat)"
run_json="$(paseo workflow run /absolute/path/child.json "$input" \\
  --host "\${PASEO_LISTEN:-127.0.0.1:6767}" --json)"

node - "$run_json" <<'NODE'
const fs = require("node:fs");
const run = JSON.parse(process.argv[2]);

if (run.status !== "succeeded" || !run.outputPayload) {
  console.error(run.error ?? "Child workflow failed");
  process.exit(1);
}

const output = JSON.parse(run.outputPayload);
fs.writeSync(3, JSON.stringify({
  outputs: output,
  flow: { action: "next" }
}));
NODE`;

export const DEFAULT_PYTHON_CODE = `import json
import os
import sys

payload = json.load(sys.stdin)
with os.fdopen(3, "w") as result:
    json.dump({
        "outputs": {**payload, "status": "done"},
        "flow": {"action": "next"},
    }, result, ensure_ascii=False)`;

export const DEFAULT_AGENT_INITIAL_PROMPT = `[User]
请处理以下工作流输入：
{{payload}}`;

export const DEFAULT_SWITCH_CONTROL = "done";

const STANDARD_INPUT_EXAMPLE = JSON.stringify(
  {
    customer: { name: "Alice" },
    items: [{ id: 7 }],
  },
  null,
  2,
);

const COMMAND_OUTPUT_EXAMPLE = JSON.stringify(
  {
    outputs: {
      customer: { name: "Alice" },
      items: [{ id: 7 }],
    },
    flow: { action: "next" },
  },
  null,
  2,
);

export interface WorkflowStepExamples {
  input: string;
  output: string;
  initialValue?: string;
  composition?: string;
}

export function getWorkflowStepExamples(step: WorkflowStep): WorkflowStepExamples {
  if (step.type === "bash") {
    return {
      input: STANDARD_INPUT_EXAMPLE,
      output: COMMAND_OUTPUT_EXAMPLE,
      initialValue: DEFAULT_BASH_INITIAL_COMMAND,
      composition: BASH_CHILD_WORKFLOW_EXAMPLE,
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
      output: JSON.stringify(
        {
          outputs: { [outputField]: "Agent reply" },
          flow:
            outputField === "control"
              ? { action: "branch", value: "Agent reply" }
              : { action: "next" },
        },
        null,
        2,
      ),
      initialValue: DEFAULT_AGENT_INITIAL_PROMPT,
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
        items: ["alpha", "beta"],
      },
      null,
      2,
    ),
    output: JSON.stringify(
      {
        outputs: {
          item: "beta",
        },
        flow: {
          action: "break",
        },
      },
      null,
      2,
    ),
  };
}
