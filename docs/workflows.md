# Workflow scripts

Paseo workflows are versioned JSON scripts that can be run by the daemon, CLI, visual editor, or
Paseo MCP tools. Reusable scripts live under `~/.paseo/workflows/`; absolute script paths are also
supported.

## JSON payload contract

Every Bash, Python, or Agent node receives one JSON object serialized as a string. Node input contains
`control` plus business data, but never contains `error`:

```json
{
  "control": "",
  "customer": {
    "name": "Alice"
  }
}
```

- `control` drives `switch` and `for`.
- Bash and Agent outputs may include `error`. The workflow framework consumes it instead of passing
  it to the next node.
- A non-empty output `error` stops the workflow immediately.
- Missing output `control` and `error` fields default to `""`.
- Any other JSON fields are business data and are passed to the next node unchanged when the node
  includes them in its output.
- A run starts from a JSON payload supplied by the visual editor, CLI, RPC client, or Agent tool.
- `filePath` is optional. When present, relative paths are resolved from the workflow script's
  directory and can be used as file context by Bash and Agent nodes.

Example payload:

```json
{
  "control": "review",
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

## Input contracts and presets

`inputContract` is an executable JSON Schema subset. Paseo applies defaults and validates required
fields, types, allowed values, and additional properties before it creates a run. No node starts
when validation fails.

```json
{
  "inputContract": {
    "properties": {
      "scan_dir_url": { "type": "string" },
      "group_ids": { "type": "array", "default": [] },
      "mode": {
        "type": "string",
        "enum": ["scan_only", "prepare_only", "full"],
        "default": "scan_only"
      },
      "max_work_items": { "type": "integer", "default": 0 }
    },
    "required": ["scan_dir_url", "group_ids"],
    "additionalProperties": true
  }
}
```

Supported property types are `string`, `number`, `integer`, `boolean`, `object`, and `array`.
The visual editor generates run fields from these properties and keeps the complete JSON payload
available as an editable preview.

Use `inputPresets` for fixed resources and repeatable smoke or full-run configurations:

```json
{
  "inputPresets": [
    {
      "id": "scan-only",
      "name": "Scan only",
      "payload": {
        "scan_dir_url": "https://example.test/wiki",
        "group_ids": [],
        "mode": "scan_only",
        "max_work_items": 0
      }
    }
  ]
}
```

Preset payloads must satisfy the workflow input contract. The visual editor and CLI copy a preset
into an editable input payload. Agent tools can pass `inputPresetId` directly.

## Command environment

`environment` configures every Bash and Python node:

```json
{
  "environment": {
    "inherit": "login-shell",
    "variables": {
      "FIXED_WIKI_URL": "https://example.test/wiki"
    }
  }
}
```

- `inherit: "daemon"` uses the environment that started Paseo and is the default.
- `inherit: "login-shell"` loads the user's login shell environment once, including `PATH`.
- `variables` overrides inherited values for each command node.

Agent nodes keep their provider-managed environment.

Run history stores the serialized payload in `inputPayload` and `outputPayload` for both the whole
run and each node attempt. The historical file-path and control fields remain as compatibility
projections.

## Bash nodes

Bash nodes receive the serialized JSON as `$1`. Read `filePath`, `control`, and all business data
from that object.

Runtime metadata also includes:

- `PASEO_WORKFLOW_ITERATION_PATH`
- `PASEO_WORKFLOW_RUN_ID`
- `PASEO_WORKFLOW_STEP_ID`
- `PASEO_WORKFLOW_ATTEMPT`

The command must print one valid JSON object as the last non-empty stdout line. Paseo ignores all
earlier stdout lines. Empty stdout fails the node. Output `control` and `error` must be strings when
provided and default to `""` when omitted. Input JSON never contains `error`.

```bash
node - "$1" <<'NODE'
const input = JSON.parse(process.argv[2]);
const output = {
  ...input,
  normalizedCustomer: input.customer.name.trim(),
  control: "normalized",
  error: "",
};
console.log(JSON.stringify(output));
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
prefer parsing `$1` instead of interpolating it into shell syntax.

## Agent nodes

Agent nodes receive the complete node input JSON, without `error`, in their workflow prompt and
must finish with only one valid JSON object. Output `control` and `error` default to `""` when
omitted.

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

## Python nodes

Python nodes run the code stored directly in the workflow script. Paseo writes the code to a
temporary `.py` file, runs it with `python3`, and removes the file after the process exits. Set
`pythonPath` when the host uses another interpreter.

The serialized node input is available on stdin.

Runtime metadata uses the same environment variables as Bash nodes. The last non-empty stdout line
must be one JSON object. Earlier stdout lines and stderr are retained as process output. Empty
stdout, invalid JSON, a non-zero exit code, or a non-empty output `error` fails the node.

```python
import json
import sys

payload = json.load(sys.stdin)
payload["normalizedCustomer"] = payload["customer"]["name"].strip()
payload["control"] = "normalized"
print(json.dumps(payload, ensure_ascii=False))
```

Python code supports the same `{{path}}` template variables and custom `variables` as Bash nodes.
Prefer reading structured or untrusted values from the input JSON instead of inserting them into
Python source.

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

## For concurrency and early break

When `separator` is non-empty, `for` parses the payload's `control` as:

- a JSON array, such as `["a", {"id": 2}]`
- a non-negative integer count, where `3` produces `0`, `1`, and `2`
- a string split by the configured `separator`

When `separator` is empty or omitted, `for` ignores `control` and runs until `maxIterations` is
reached or a body node returns the configured break control. `maxIterations` defaults to `100`.
In this mode, `loop.item` is `null`, `loop.index` is the zero-based iteration index, and
`loop.count` equals `maxIterations`.

Each body iteration receives:

```json
{
  "control": "current item serialized as a string",
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

`concurrency` controls how many iterations run at once and defaults to `1`. At `1`, execution stays
serial and each iteration receives the previous iteration's output. Above `1`, every iteration
starts independently from the payload that entered the For node. The loop returns the output from
the highest completed iteration index, regardless of completion order.

When a concurrent iteration returns the break control, Paseo stops scheduling new iterations.
Iterations that already started finish. If more than one started iteration returns break, the
lowest loop index wins and its output becomes the For node output. `continue` only skips the
remaining body nodes in its own iteration.

```json
{
  "id": "iterate",
  "type": "for",
  "maxIterations": 100,
  "concurrency": 4,
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

The selected serial, highest-index concurrent, or breaking iteration payload is passed to the node
after the loop.

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
- Bash, Python, and Agent nodes may override `timeoutMs` and `retry`.
- Retry uses capped exponential backoff with optional jitter.
- Every attempt records status, timestamps, attempt number, payloads, error code, and retry delay.
- Command attempts also record the expanded command or Python code, cwd, environment source, PATH,
  stdout, stderr, exit code, and signal.
- A zero-item For node records `Skipped loop: 0 items` and its skip reason.
- Command failures preserve their original stderr and exit status. Paseo does not attempt to parse a
  JSON result after a command has already failed.
- Runs have `running`, `succeeded`, `failed`, `cancelled`, and `timed_out` states.
- A daemon restart closes in-flight work with `DAEMON_RESTARTED`.

`maxAttempts` includes the first attempt. Retried commands and prompts should be idempotent.

## CLI and APIs

```bash
paseo workflow inspect /absolute/path/workflow.json
paseo workflow run /absolute/path/workflow.json '{"control":""}'
paseo workflow run /absolute/path/workflow.json --preset scan-only
paseo workflow run /absolute/path/workflow.json '{"max_work_items":2}' --preset scan-only
paseo workflow run /absolute/path/workflow.json '{"control":""}' --node worker
paseo workflow run /absolute/path/workflow.json '{"control":"","filePath":"/absolute/path/input.txt"}' --background
paseo workflow cancel <run-id>
paseo workflow ls
```

Use `--node <node-id>` to run one top-level or nested node directly with the supplied input payload.
The run skips every other node. Selecting a Switch, For, or Workflow node runs that node's complete
branch, loop, or child workflow behavior.

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
  targetNodeId: "worker",
  inputPayload: JSON.stringify({
    control: "",
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
