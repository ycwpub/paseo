# Workflow scripts

Paseo workflows are versioned JSON scripts that can be run by the daemon, CLI, visual editor, or
Paseo MCP tools. Reusable scripts live under `~/.paseo/workflows/`; absolute script paths are also
supported.

## Workflow v2 contract

New workflows use an explicit, versioned resource:

```json
{
  "apiVersion": "paseo.sh/workflow/v1",
  "kind": "Workflow",
  "version": 2
}
```

Each executable node can declare `inputs`, `inputSchema`, and `outputSchema`. `inputs` maps workflow
inputs, current data, or prior node outputs into the exact business object the node receives:

```json
{
  "inputs": {
    "project": "{{workflow.inputs.project}}",
    "alerts": "{{nodes.scan.outputs.alerts}}"
  }
}
```

A whole `{{expression}}` preserves arrays, objects, booleans, and numbers. Expressions embedded in
larger strings are stringified. Available roots are `workflow.inputs`, `nodes.<id>.outputs`,
`input`, `payload`, and fields on the current input.

Bash and Python read mapped business data from stdin. stdout/stderr are logs. File descriptor `3`
must contain exactly one v2 result envelope:

```json
{
  "outputs": {
    "alerts": []
  },
  "artifacts": [
    {
      "name": "report",
      "uri": "file:///tmp/report.json",
      "mediaType": "application/json"
    }
  ],
  "flow": {
    "action": "next"
  }
}
```

- `outputs` contains business data only.
- `artifacts` describes files or external resources produced by the node.
- `flow.action` is `next`, `continue`, `break`, or `branch`. The framework consumes flow control
  instead of forwarding it as business input.
- Node results never contain `error`. Bash/Python fail with a non-zero exit code and stderr;
  Agent/provider failures are recorded by the framework with status, error code, and message.

Version 1 files remain readable for compatibility, but the visual editor creates version 2.

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

Bash nodes receive mapped business JSON on stdin. stdout and stderr are log streams. Write exactly
one v2 result envelope to file descriptor `3`.

Runtime metadata also includes:

- `PASEO_WORKFLOW_ITERATION_PATH`
- `PASEO_WORKFLOW_RUN_ID`
- `PASEO_WORKFLOW_STEP_ID`
- `PASEO_WORKFLOW_ATTEMPT`

An empty result channel, multiple JSON documents, invalid JSON, a non-object result, or a result
containing the reserved `error` field fails the node. `control` must be a string when provided and
defaults to `""`.

```bash
input="$(cat)"
node - "$input" <<'NODE'
const fs = require("fs");
const input = JSON.parse(process.argv[2]);
console.log("normalized customer");
fs.writeSync(3, JSON.stringify({
  outputs: {
    normalizedCustomer: input.customer.name.trim()
  },
  flow: { action: "next" }
}));
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
prefer parsing stdin instead of interpolating it into shell syntax.

## Agent nodes

Agent nodes receive the complete node input JSON, without `error`, in their workflow prompt. Answer
nodes store the response in `answer`; Control nodes store the response in `control`.

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

Runtime metadata uses the same environment variables as Bash nodes. stdout and stderr are retained
as process output. Write exactly one result JSON document to file descriptor `3`. An empty or
invalid result channel, a reserved `error` field, or a non-zero exit code fails the node.

```python
import json
import os
import sys

payload = json.load(sys.stdin)
print("normalized customer")
with os.fdopen(3, "w") as result:
    json.dump({
        "outputs": {
            "normalizedCustomer": payload["customer"]["name"].strip()
        },
        "flow": {"action": "next"},
    }, result, ensure_ascii=False)
```

Python code supports the same `{{path}}` template variables and custom `variables` as Bash nodes.
Prefer reading structured or untrusted values from the input JSON instead of inserting them into
Python source.

## Switch

`switch` resolves `switchOn` and compares the native value with its cases. String matching is
case-insensitive by default and can be changed with `caseSensitive`.

```json
{
  "id": "route",
  "type": "switch",
  "switchOn": "{{nodes.classify.outputs.decision}}",
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

`for.items` must resolve to an array. `maxIterations` defaults to `100`; `concurrency` defaults to
`1`.

Each body iteration receives:

```json
{
  "loop": {
    "item": "the original JSON value",
    "index": 0,
    "count": 3
  }
}
```

A body node returns `flow.action: "continue"` to skip the remaining body nodes or
`flow.action: "break"` to stop scheduling new iterations.

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
paseo workflow protocol
paseo workflow protocol --json
paseo workflow run /absolute/path/workflow.json '{"control":""}'
paseo workflow run /absolute/path/workflow.json --preset scan-only
paseo workflow run /absolute/path/workflow.json '{"max_work_items":2}' --preset scan-only
paseo workflow run /absolute/path/workflow.json '{"control":""}' --node worker
paseo workflow run /absolute/path/workflow.json '{"control":"","filePath":"/absolute/path/input.txt"}' --background
paseo workflow cancel <run-id>
paseo workflow ls
```

`paseo workflow protocol --json` reports the command-node protocol expected by the CLI and whether
the connected daemon advertises support. External tools should require
`daemonSupported: true`, `version: 2`, and `legacyStdoutResult: false` before running workflows that
contain Bash or Python nodes. A new CLI refuses to start a workflow against a daemon that does not
advertise the fd 3 result protocol.

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
