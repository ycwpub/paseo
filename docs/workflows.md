# Workflow scripts

Paseo workflows are versioned JSON scripts that can be run by the daemon, CLI, visual editor, or
Paseo MCP tools. Reusable scripts live under `~/.paseo/workflows/`; absolute script paths are also
supported.

## JSON payload contract

Nodes exchange one JSON object serialized as a string. Every executable Bash or Agent node must
output these two string fields:

```json
{
  "control": "",
  "error": ""
}
```

- `control` drives `switch` and `for`.
- A non-empty `error` stops the workflow immediately.
- Any other JSON fields are business data and are passed to the next node unchanged when the node
  includes them in its output.
- A run starts from a JSON payload supplied by the visual editor, CLI, RPC client, or Agent tool.
- `filePath` is optional. When present, relative paths are resolved from the workflow script's
  directory and can be used as file context by Bash and Agent nodes.

Example payload:

```json
{
  "control": "review",
  "error": "",
  "filePath": "/absolute/path/input.csv",
  "customer": {
    "name": "Alice"
  },
  "records": [
    {
      "id": 7
    }
  ]
}
```

Run history stores the serialized payload in `inputPayload` and `outputPayload` for both the whole
run and each node attempt. The historical file-path and control fields remain as compatibility
projections.

## Bash nodes

Bash nodes receive the same serialized JSON in:

- `$1`
- `PASEO_WORKFLOW_INPUT_JSON`

When the current payload contains `filePath`, Bash nodes also receive it in:

- `$2` and `PASEO_WORKFLOW_INPUT_FILE`

Runtime metadata also includes:

- `PASEO_WORKFLOW_CONTROL`
- `PASEO_WORKFLOW_ITERATION_PATH`
- `PASEO_WORKFLOW_RESULT_FILE`
- `PASEO_WORKFLOW_RUN_ID`
- `PASEO_WORKFLOW_STEP_ID`
- `PASEO_WORKFLOW_ATTEMPT`

The command should write one valid JSON object to `PASEO_WORKFLOW_RESULT_FILE`. If the file is not
created, Paseo parses stdout. Both `control` and `error` must be present and must be strings.

```bash
node - <<'NODE'
const fs = require("fs");
const input = JSON.parse(process.env.PASEO_WORKFLOW_INPUT_JSON);
const output = {
  ...input,
  normalizedCustomer: input.customer.name.trim(),
  control: "normalized",
  error: "",
};
fs.writeFileSync(process.env.PASEO_WORKFLOW_RESULT_FILE, JSON.stringify(output));
NODE
```

Each Bash node always executes its configured `initialCommand`. Fields such as `filePath` in the
upstream JSON payload are data for the command and never replace the configured command.

Bash commands support the same `{{path}}` template syntax as Agent prompts:

```json
{
  "id": "prepare",
  "type": "bash",
  "initialCommand": "printf '%s\\n' '{{customer.name}}' '{{role}}'",
  "variables": {
    "role": "{{customer.name}}-reviewer"
  }
}
```

For an input containing `{"customer":{"name":"Alice"}}`, this renders `Alice` and
`Alice-reviewer`. Nested objects and array items such as `{{items.0.id}}` are supported. Objects
and arrays are serialized as JSON, and an unknown variable fails the node.

Template values are inserted directly into the shell command. For untrusted or complex data,
prefer parsing `PASEO_WORKFLOW_INPUT_JSON` instead of interpolating it into shell syntax.

## Agent nodes

Agent nodes receive the complete input JSON in their workflow prompt and must finish with only one
valid JSON object containing string fields `control` and `error`.

Payload data can be inserted into `initialPrompt` with nested paths:

```text
Review customer {{customer.name}} and record {{records.0.id}}.
Full input: {{payload}}
```

Objects and arrays are inserted as JSON. Unknown variables fail the node instead of silently
rendering an empty prompt. Custom `promptVariables` remain supported and can themselves reference
payload values.

Runtime variables include:

- `payload` or `inputJson`: complete serialized payload
- `control`
- `inputFilePath`, `inputDirectory`, `inputFileName`, and `inputFileContent` when the payload
  contains `filePath`
- `iterationPath`
- `runId`, `stepId`, `stepName`, and `attempt`

Agent nodes support provider, model, mode, thinking, approval/sandbox, MCP, feature, network, and
workspace-isolation settings.

## Switch

`switch` compares its cases with the payload's `control` string. Matching is case-insensitive by
default and can be changed with `caseSensitive`.

```json
{
  "id": "route",
  "type": "switch",
  "cases": [
    {
      "equals": "review",
      "steps": []
    }
  ],
  "defaultSteps": []
}
```

## For and early break

`for` parses the payload's `control` as:

- a JSON array, such as `["a", {"id": 2}]`
- a non-negative integer count, where `3` produces `0`, `1`, and `2`
- a comma/newline-separated string, or a custom `separator`

Each body iteration receives:

```json
{
  "control": "current item serialized as a string",
  "error": "",
  "loop": {
    "item": "the original JSON value",
    "index": 0,
    "count": 3
  }
}
```

The other fields from the previous payload are preserved when the iteration starts. A body node
can stop the loop early by returning `control: "break"`. Configure a different value with
`breakControl`.

```json
{
  "id": "iterate",
  "type": "for",
  "maxIterations": 100,
  "breakControl": "stop-now",
  "steps": [
    {
      "id": "worker",
      "type": "bash",
      "initialCommand": "node worker.js"
    }
  ]
}
```

The payload returned by the last completed iteration, including the break control value, is passed
to the node after the loop.

## Complete example

```json
{
  "version": 1,
  "name": "prepare and review",
  "timeoutMs": 86400000,
  "taskDefaults": {
    "timeoutMs": 1800000,
    "retry": {
      "maxAttempts": 3,
      "initialDelayMs": 1000,
      "maxDelayMs": 30000,
      "backoffMultiplier": 2,
      "jitter": true
    }
  },
  "steps": [
    {
      "id": "prepare",
      "type": "bash",
      "initialCommand": "node prepare.js '{{customer.name}}'",
      "variables": {
        "customerLabel": "{{customer.name}}-customer"
      }
    },
    {
      "id": "review",
      "type": "agent",
      "initialPrompt": "Review {{customer.name}} using the input at {{inputFilePath}}.",
      "config": {
        "provider": "codex",
        "model": "gpt-5.4",
        "cwd": "/tmp",
        "archiveOnFinish": true
      }
    }
  ]
}
```

## Execution policies

- A workflow may define a total `timeoutMs`.
- `taskDefaults` defines default task timeout and retry behavior.
- Bash and Agent nodes may override `timeoutMs` and `retry`.
- Retry uses capped exponential backoff with optional jitter.
- Every attempt records status, timestamps, attempt number, payloads, error code, and retry delay.
- Runs have `running`, `succeeded`, `failed`, `cancelled`, and `timed_out` states.
- A daemon restart closes in-flight work with `DAEMON_RESTARTED`.

`maxAttempts` includes the first attempt. Retried commands and prompts should be idempotent.

## CLI and APIs

```bash
paseo workflow inspect /absolute/path/workflow.json
paseo workflow run /absolute/path/workflow.json '{"control":"","error":""}'
paseo workflow run /absolute/path/workflow.json '{"control":"","error":"","filePath":"/absolute/path/input.txt"}' --background
paseo workflow cancel <run-id>
paseo workflow ls
```

Agent tools:

- `list_workflows`
- `inspect_workflow`
- `run_workflow`
- `get_workflow_run`
- `cancel_workflow`

Embedded server usage:

```ts
const run = await daemon.workflowService.runScriptAndWait({
  scriptPath: "/absolute/path/workflow.json",
  inputPayload: JSON.stringify({
    control: "",
    error: "",
    customer: {
      name: "Alice",
    },
  }),
});
```

## End-to-end test

```bash
npm run build:server
node scripts/test-workflow-complex-e2e.mjs
```

Set `PASEO_KEEP_WORKFLOW_E2E=1` to retain the generated files.
