# Workflows

Paseo workflows are reusable JSON scripts stored on the daemon host under
`~/.paseo/workflows`. You can create and run them from the Workflow page, call them from an Agent,
or invoke them with `paseo workflow`.

## Agent discovery

Paseo exposes Workflows directly to Agents through `list_workflows`, `inspect_workflow`,
`run_workflow`, `get_workflow_run`, and `cancel_workflow`. Agents should use these tools instead of
scanning `~/.paseo/workflows` themselves.

Discovery is on demand. `list_workflows` reads the daemon's Workflow directory when called, so a
new valid Workflow becomes discoverable without restarting the daemon. Invalid files are omitted
from the list and reported in the daemon log.

For a repeatable or multi-step task, an Agent should:

1. Call `list_workflows` once and compare names and descriptions with the request.
2. Call `inspect_workflow` for plausible candidates. Inspect the full definition, especially the
   first node's `inputSchema`, `inputPresets`, provider configuration, and nodes with external side
   effects.
3. Call `run_workflow` only after selecting a matching definition. Pass `inputPayload` as a
   serialized JSON object, or pass an inspected `inputPresetId`.
4. Read `status`, `outputPayload`, `error`, and `nodeRuns`. The successful `outputPayload` is the
   final Workflow `data` object serialized as JSON.
5. For `background: true`, keep the returned run ID and use `get_workflow_run` when the result is
   needed. Use `cancel_workflow` to stop an active run.

Agents should not run a Workflow from its name alone or invent input fields. They should skip
discovery for trivial one-step tasks and avoid repeatedly listing Workflows during the same task.
When a matching Workflow exists, the Agent should run it instead of reproducing, reordering, or
skipping its nodes manually. Single-node execution is for explicit testing and debugging, not a
replacement for the defined process. If no Workflow matches, the Agent continues with its normal
tools.

The CLI provides the same discovery path when Agent tools are unavailable:

```bash
paseo workflow ls --json
paseo workflow inspect /absolute/path/workflow.json --json
paseo workflow run /absolute/path/workflow.json '{"project":"paseo"}' --json
```

The `scriptPath` is absolute on the daemon host. Add `--host <host:port>` when discovering or
running Workflows on another daemon.

## Version 1

The current contract is `version: 1`. It does not read earlier Workflow result shapes.

```json
{
  "apiVersion": "paseo.sh/workflow/v1",
  "kind": "Workflow",
  "version": 1,
  "name": "Review",
  "variables": {
    "traceId": { "type": "string", "default": "" },
    "counter": { "type": "int64", "default": "0" }
  },
  "outputSchema": {
    "type": "object",
    "required": ["answer"],
    "properties": {
      "answer": { "type": "string" }
    }
  },
  "steps": [
    {
      "id": "review",
      "type": "agent",
      "outputMode": "normal",
      "initialPrompt": "Review {{data.project}}",
      "inputSchema": {
        "type": "object",
        "required": ["project"],
        "properties": {
          "project": { "type": "string" }
        }
      },
      "config": {
        "provider": "codex"
      }
    }
  ]
}
```

`string` and `int64` are the supported variable types. An `int64` value is always transported as a
signed 64-bit decimal string. This avoids precision loss in JSON and JavaScript.

The first node's `inputSchema` is the Workflow input schema. `outputSchema` validates the final
`data` object before the run succeeds. Paseo rejects fields not declared in a node input or output
schema.

## Node input

Every executable node receives one JSON object:

```json
{
  "data": {
    "project": "paseo"
  },
  "origin_input": {
    "project": "paseo",
    "requestId": "request-1"
  },
  "workflow": {
    "var": {
      "traceId": "trace-1"
    }
  },
  "project": {
    "var": {
      "serviceName": "checkout"
    }
  },
  "loop": {
    "var": {
      "item": {
        "id": 7
      },
      "index": 0,
      "count": 3,
      "i": "0"
    }
  },
  "node": {
    "var": {
      "cursor": "0"
    }
  }
}
```

- Paseo fills `data` from the previous node output's `data`; for the first node, it uses the
  original Workflow input. The node's `inputs` mapping is applied afterward.
- Paseo fills `origin_input` with the original Workflow launch input. It is read-only and remains
  unchanged for every node and every For iteration.
- Paseo fills `workflow.var` with the current Workflow-variable values.
- For Agent nodes, Paseo fills `project.var` from the selected Project. It is absent from other
  framework-created node inputs.
- Inside a For body, Paseo fills `loop.var` with the innermost For scope. `loop` is absent outside
  For.
- Paseo fills `node.var` with variables declared by the current node.
- A node's `inputSchema` validates `data`, not the outer envelope.
- Expressions can read `data.*`, `origin_input.*`, `workflow.var.*`, `loop.var.*`, `node.var.*`,
  `workflow.inputs.*`, and `nodes.<id>.outputs.*`.

The four variable scopes have different ownership:

- `workflow.var` is global to the run. Every node can read and modify declared values.
- `project.var` is read-only Project configuration available to Agent prompts.
- `loop.var.*` is shared only inside its For invocation. Nested For bodies see only the innermost
  scope.
- `node.var` contains read-only constants visible only to the current node.

## Node result

Bash, Python, and custom Agent nodes return:

```json
{
  "data": {
    "answer": "done",
    "control": ""
  }
}
```

`data` is required and must be a JSON object. It becomes the next node's `data`.

To update declared Workflow variables, add the optional `modify` field:

```json
{
  "data": {
    "answer": "done"
  },
  "modify": {
    "workflow": {
      "var": {
        "counter": "1"
      }
    },
    "loop": {
      "var": {
        "i": "1"
      }
    }
  }
}
```

Use `modify.loop.var` only inside a serial For to update custom Loop variables. Parallel For
iterations can read custom Loop variable initial values but cannot modify them. `item`, `index`,
and `count` are built-in and cannot be declared or modified. These values are
exposed as `loop.var.item`, `loop.var.index`, and `loop.var.count` in node input. Node variables are
read-only. Undeclared variables and invalid `int64` values fail the node.

For a business error, add the optional `base_resp` field:

```json
{
  "data": {},
  "base_resp": {
    "status_code": 1001,
    "status_msg": "validation failed",
    "forbid_retry": 1
  }
}
```

- `base_resp.status_code != 0` fails the node. `status_msg` is the failure message.
- `base_resp.forbid_retry != 0` prevents the configured retry policy from retrying the node.
- Omit `base_resp` for successful results.
- `artifacts` are owned and populated by the Workflow framework. Node result JSON must not output
  an `artifacts` field.
- Flow control is not a framework field. Put fields such as `control` in `data`, then point Switch
  or For at them.

Variable updates are committed only after the result envelope and output schema pass validation.
Parallel For iterations serialize shared Workflow-variable commits with a lock. Each assignment is
atomic; when iterations assign the same Workflow variable, the last committed assignment is
retained. Loop-variable updates exist only in serial For execution.

## Bash

Bash reads the input envelope from stdin. stdout and stderr are logs. Assign the result JSON string
to the configured output variable; Paseo writes that variable to file descriptor 3.

Set `inputVariable` and `outputVariable` on the node. They default to `input` and `output`.
Paseo wraps the command as follows:

```bash
input="$(cat)"
output=""

# user command

printf '%s' "$output" >&3
```

Example user command (requires `jq`):

```bash
output="$(jq -c '
{
  data: ((.data // {}) + {answer: "done"})
}
' <<< "$input")"
```

A non-zero process exit code fails the node before Paseo reads `base_resp`.

## Python

Python uses the same transport. Paseo parses stdin into `inputVariable`, runs the user code, then
serializes `outputVariable` to file descriptor 3.

```python
output = {
    "data": {
        **input["data"],
        "answer": "done",
    },
}
```

A non-zero interpreter exit code fails the node.

Python nodes support either inline `code` or a declared module entrypoint. Configure exactly one
mode:

```json
{
  "id": "prepare",
  "type": "python",
  "cwd": "/path/to/project",
  "module": "scripts.prepare_auto_troubleshoot",
  "function": "run_node",
  "env": {
    "MODE": "review"
  }
}
```

The function receives the complete node input object and returns the complete node result object.
It may return an awaitable. Bash and Python nodes can define `env`; these string values override
the Workflow command environment for that node.

## Agent

Agent nodes require a final answer. A missing final answer fails the node.

- `outputMode: "normal"` converts the final answer to
  `{"data":{"answer":"Agent answer"}}`.
- `outputMode: "custom"` parses the final answer as the complete node result envelope.

When a custom Agent result or its `outputSchema` is invalid, the configured node retry policy can
ask the Agent to correct it. The retry prompt includes the validator error. The node fails after
`retry.maxAttempts`; schema correction has no separate retry counter.

`lifecycle` controls Agent reuse and defaults to `single`:

- `workflow`: create the Agent on the node's first execution and reuse it until the Workflow ends.
- `for`: create the Agent on its first execution in the innermost containing For invocation and
  reuse it until that For invocation exits. A For-lifecycle Agent must be nested inside For.
- `single`: create a new Agent for every node execution.

Calls that reuse one Agent are serialized, including calls from parallel For iterations. The Agent's
workspace, provider configuration, and rendered system prompt are fixed by the first execution that
initializes the lifecycle. `subsequentPromptMode` controls the prompt sent after the first call:

- `reuse_initial` (default): render `initialPrompt` again from the current node input.
- `custom`: render and send `subsequentPrompt`; reusable Agent nodes require this field in custom
  mode.

Single-lifecycle Agents always use `initialPrompt`.

`config.archiveOnFinish` now applies when the selected Agent lifecycle ends. When enabled, Paseo
archives the Agent workspace after the Workflow, For invocation, or single execution finishes.

User and system prompts resolve paths from the same node input. For example:
`{{data.project}}`, `{{origin_input.requestId}}`, `{{workflow.var.traceId}}`,
`{{project.var.serviceName}}`,
`{{loop.var.item}}`, and `{{node.var.cursor}}`. `{{input}}` renders the complete input envelope.

## Switch

Switch evaluates `switchVar` and compares the native result with each case:

```json
{
  "id": "route",
  "type": "switch",
  "switchVar": "{{data.decision}}",
  "cases": [
    {
      "equals": "approve",
      "steps": []
    }
  ],
  "defaultSteps": []
}
```

Case values can be strings, numbers, or booleans.

## For

For supports three modes. `maxIterations` defaults to `100`; `0` means no limit.

### Array mode

```json
{
  "id": "items",
  "type": "for",
  "mode": "array",
  "executionMode": "parallel",
  "items": "{{data.items}}",
  "forControl": "{{data.control}}",
  "maxIterations": 100,
  "concurrency": 4,
  "loopVariables": {
    "i": {
      "type": "int64",
      "default": "0"
    }
  },
  "steps": []
}
```

The expression must resolve to a JSON array.

### Number mode

`mode: "number"` requires the expression to resolve to a non-negative integer. For an initial value
of `3`, `loop.var.item` is `3`, `2`, then `1`. Paseo checks the value before each iteration and
stops at zero.

### True mode

`mode: "true"` does not use an items expression. It runs until `maxIterations`, `break`,
cancellation, or the Workflow timeout. With `maxIterations: 0`, it has no iteration limit. An
unlimited True loop requires serial execution. A bounded True loop can use either execution mode.

The body receives the innermost Loop scope:

- `loop.var.item`: the array item, the current Number-mode value, or `true`
- `loop.var.index`: zero-based iteration index
- `loop.var.count`: array length, initial Number-mode value, or the True-mode maximum; `0` means
  unlimited
- custom declared values such as `loop.var.i`

`forControl` reads a user-defined value after each body node:

- `break`: stop scheduling iterations
- `continue`: skip the remaining nodes in the current iteration
- empty or missing field: run the next body node

Any other non-empty control value fails the For node, so misspelled control values do not silently
change execution.

Use `breakWhen` and `continueWhen` when the control is already boolean:

```json
{
  "forControl": "{{data.control}}",
  "breakWhen": "{{data.review_passed}}",
  "continueWhen": "{{data.skip_remaining}}"
}
```

`forControl` takes precedence when it returns `break` or `continue`. The condition fields must
resolve to booleans; missing values are false.

Every iteration's first body node starts from the For node's original `input.data`. The previous
iteration's output does not become the next iteration's input. In serial execution, use custom Loop
variables for cross-iteration state.

`executionMode` defaults to `serial`:

- `serial` runs one iteration at a time in index order. `concurrency` must be `1`. Nodes can update
  declared custom Loop variables through `modify.loop.var`.
- `parallel` runs multiple iterations at once. `concurrency` defaults to `1` and accepts values from
  `1` to `100`. Iterations can read custom Loop variable initial values, but any non-empty
  `modify.loop.var` fails the node to prevent concurrent state conflicts.

Parallel iterations start from the same For input data. Workflow variable commits remain serialized;
iteration `data` remains isolated. Parallel True loops require a finite `maxIterations`.

## Run directories and artifacts

Each run owns an isolated directory under `$PASEO_HOME/workflow-run-data/<run-id>`. Bash, Python,
and Agent nodes use it as their default working directory. Set a node `cwd` when it must execute in
a Project or repository.

The run's `artifacts` subdirectory is framework-owned. Write files under
`PASEO_WORKFLOW_ARTIFACT_DIR`; Paseo discovers them recursively after every successful or failed
attempt, attaches them to the run and node attempt, and keeps them available to the UI and clients.
Do not return `artifacts` in node result JSON.

Runtime templates expose:

- `{{workflow.cwd}}`: directory containing the Workflow definition
- `{{run.id}}`: run ID
- `{{run.dir}}`: isolated run directory
- `{{run.artifacts_dir}}`: artifact directory
- `{{node.id}}`: current node ID
- `{{attempt.index}}`: one-based attempt index

Command nodes also receive `PASEO_WORKFLOW_RUN_ID`, `PASEO_WORKFLOW_RUN_DIR`,
`PASEO_WORKFLOW_ARTIFACT_DIR`, `PASEO_WORKFLOW_STEP_ID`, and `PASEO_WORKFLOW_ATTEMPT`.

## Side-effect declarations

Nodes can declare external effects without putting provider-specific behavior in the framework:

```json
{
  "sideEffects": ["lark_doc_update", "bamboo_card_update"],
  "requiresWriteBack": true,
  "idempotencyKey": "{{origin_input.requestId}}",
  "rollbackHint": "Restore the previous document version, then reset the card status."
}
```

These fields are metadata. `paseo workflow plan` surfaces them before execution. The Workflow
author remains responsible for enforcing idempotency and write authorization inside the node.
Paseo does not automatically roll back external systems.

## Protocol discovery

External callers can inspect the exact contract supported by the connected daemon:

```bash
paseo workflow protocol --json
```

The JSON response includes the Workflow definition schema, executable-node input schema,
executable-node result schema, variable-scope rules, Agent prompt paths, For semantics, and
transport details. Use local discovery when no daemon is running:

```bash
paseo workflow protocol --local --json
```

The contract uses a `version.revision` pair. The version changes for an incompatible Workflow
format; the revision changes whenever observable v1 execution semantics change. The CLI requires
the daemon to advertise both the current `workflowProtocolVersion` and
`workflowProtocolRevision`. A daemon missing either value is rejected instead of being treated as
compatible.

## Schemas and mappings

Node `inputSchema` and `outputSchema` use JSON Schema. Paseo forces
`additionalProperties: false`, including when the schema omits it. Declare every accepted field.

An `inputs` mapping constructs the node's `data`:

```json
{
  "project": "{{workflow.inputs.project}}",
  "items": "{{nodes.scan.outputs.items}}",
  "traceId": "{{workflow.var.traceId}}"
}
```

A whole expression preserves its JSON type. Text containing an inline expression converts the
value to text.

## Running workflows

```bash
paseo workflow run /absolute/path/workflow.json \
  '{"project":"paseo"}'
```

Use `--node <node-id>` to test one node and `--background` to return before completion. Use
`--preset <preset-id>` to start from a saved input preset.

Single-node runs support two input types:

- `--input-type upstream-output` (default) treats the JSON as the previous node's `data`, or as the
  original Workflow input when there is no previous node. Paseo applies the node's `inputs` mapping
  and fills `workflow.var`, `loop`, and `node.var`.
- `--input-type node-input` treats the JSON as the complete node input envelope and passes it
  directly to the selected node. Paseo does not apply input mapping or fill any variables.

```bash
paseo workflow run /absolute/path/workflow.json \
  '{"data":{"project":"paseo"},"origin_input":{"project":"paseo"},"workflow":{"var":{}},"node":{"var":{}}}' \
  --node review \
  --input-type node-input
```

`node-input` requires `--node`, requires the caller to provide `origin_input`, and cannot be
combined with `--preset`.

```bash
paseo workflow inspect /absolute/path/workflow.json
paseo workflow plan /absolute/path/workflow.json
paseo workflow status <run-id>
paseo workflow logs <run-id>
paseo workflow logs <run-id> --node <node-id>
paseo workflow ls
paseo workflow cancel <run-id>
paseo workflow protocol --json
```

The Workflow path is resolved on the daemon host. Add `--host` when the CLI connects to another
daemon.

`plan` validates through the daemon, expands the node graph, and lists declared side effects. It
does not execute a subset of nodes because skipped Agent or write nodes would leave downstream
inputs undefined. `status` returns the complete run record. `logs` shows each attempt's input,
output, timestamps, command diagnostics, Agent ID, errors, and artifacts.

## Deliberate boundaries

- Failure retries use the node `retry` policy. Conditional repetition uses For with
  `breakWhen`/`continueWhen`; Paseo does not add a second Retry container with overlapping
  semantics.
- Python can reference a module and function explicitly. Paseo does not silently move long code or
  prompts out of the Workflow JSON because that would make a definition non-atomic and
  path-dependent.
- Recovery remains explicit. Declare `rollbackHint` or model recovery as normal nodes after human
  confirmation. The framework does not infer or automatically execute compensating writes.
