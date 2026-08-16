import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

export const DEFAULT_BASH_INITIAL_COMMAND = `output="$(jq -c '
{
  data: ((.data // {}) + {status: "done"})
}
' <<< "$input")"`;

export const BASH_CHILD_WORKFLOW_EXAMPLE = `child_run="$(paseo workflow run /absolute/path/child.json "$input" \\
  --host "\${PASEO_LISTEN:-127.0.0.1:6767}" --json)"
output="$(jq -ce '
if .status == "succeeded" and ((.outputPayload | type) == "string") then
  {data: (.outputPayload | fromjson)}
else
  error(.error // "Child workflow failed")
end
' <<< "$child_run")"`;

export const DEFAULT_PYTHON_CODE = `output = {
    "data": {**input["data"], "status": "done"},
}`;

export const DEFAULT_AGENT_INITIAL_PROMPT = `[User]
请处理以下工作流输入：
{{payload}}`;

export const DEFAULT_SWITCH_CONTROL = "done";

const STANDARD_INPUT_EXAMPLE = JSON.stringify(
  {
    data: {
      customer: { name: "Alice" },
      items: [{ id: 7 }],
    },
    workflow: {
      var: { traceId: "trace-1" },
    },
    loop: {
      item: { id: 7 },
      index: 0,
      count: 1,
      i: "0",
    },
    node: {
      var: { counter: "0" },
    },
  },
  null,
  2,
);

const COMMAND_OUTPUT_EXAMPLE = JSON.stringify(
  {
    data: {
      customer: { name: "Alice" },
      items: [{ id: 7 }],
    },
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
    return {
      input: STANDARD_INPUT_EXAMPLE,
      output:
        (step.outputMode ?? "normal") === "normal"
          ? JSON.stringify({ data: { answer: "Agent reply" } }, null, 2)
          : COMMAND_OUTPUT_EXAMPLE,
      initialValue: DEFAULT_AGENT_INITIAL_PROMPT,
    };
  }
  if (step.type === "switch") {
    return {
      input: STANDARD_INPUT_EXAMPLE,
      output: JSON.stringify({ matched: DEFAULT_SWITCH_CONTROL }, null, 2),
    };
  }
  return {
    input: STANDARD_INPUT_EXAMPLE,
    output: JSON.stringify(
      {
        data: {
          control: "break",
        },
      },
      null,
      2,
    ),
  };
}
