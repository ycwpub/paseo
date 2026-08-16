# Workflows

Paseo workflows are reusable JSON scripts stored on the daemon host under
`~/.paseo/workflows`. You can create and run them from the Workflow page, call them from an Agent,
or invoke them with `paseo workflow`.

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
  "workflow": {
    "var": {
      "traceId": "trace-1"
    }
  },
  "loop": {
    "item": {
      "id": 7
    },
    "index": 0,
    "count": 3,
    "i": "0"
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
- Paseo fills `workflow.var` with the current Workflow-variable values.
- Inside a For body, Paseo fills `loop` with the innermost For scope. It is absent outside For.
- Paseo fills `node.var` with variables declared by the current node.
- A node's `inputSchema` validates `data`, not the outer envelope.
- Expressions can read `data.*`, `workflow.var.*`, `loop.*`, `node.var.*`,
  `workflow.inputs.*`, and `nodes.<id>.outputs.*`.

The three variable scopes have different ownership:

- `workflow.var` is global to the run. Every node can read and modify declared values.
- `loop.*` is shared only inside its For invocation. Nested For bodies see only the innermost
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
iterations can read custom Loop variable initial values but cannot modify them. `loop.item`,
`loop.index`, and `loop.count` are built-in and cannot be declared or modified. Node variables are
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

## Agent

Agent nodes require a final answer. A missing final answer fails the node.

- `outputMode: "normal"` converts the final answer to
  `{"data":{"answer":"Agent answer"}}`.
- `outputMode: "custom"` parses the final answer as the complete node result envelope.

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

User and system prompts support the same template variables. `{{data.project}}`,
`{{workflow.var.traceId}}`, `{{node.var.cursor}}`, `{{payload}}`, and `{{inputJson}}` are available.
Custom `templateVariables` can compose those values.

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
of `3`, `loop.item` is `3`, `2`, then `1`. Paseo checks the value before each iteration and stops at
zero.

### True mode

`mode: "true"` does not use an items expression. It runs until `maxIterations`, `break`,
cancellation, or the Workflow timeout. With `maxIterations: 0`, it has no iteration limit. An
unlimited True loop requires serial execution. A bounded True loop can use either execution mode.

The body receives the innermost Loop scope:

- `loop.item`: the array item, the current Number-mode value, or `true`
- `loop.index`: zero-based iteration index
- `loop.count`: array length, initial Number-mode value, or the True-mode maximum; `0` means
  unlimited
- custom declared values such as `loop.i`

`forControl` reads a user-defined value after each body node:

- `break`: stop scheduling iterations
- `continue`: skip the remaining nodes in the current iteration
- empty or missing field: run the next body node

Any other non-empty control value fails the For node, so misspelled control values do not silently
change execution.

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

## Protocol discovery

External callers can inspect the exact contract supported by the connected daemon:

```bash
paseo workflow protocol --json
```

The CLI requires the daemon to advertise `workflowProtocolVersion: 1`. A daemon that only supports
an older fd 3 result contract is rejected instead of being treated as compatible.

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
  '{"data":{"project":"paseo"},"workflow":{"var":{}},"node":{"var":{}}}' \
  --node review \
  --input-type node-input
```

`node-input` requires `--node` and cannot be combined with `--preset`.

```bash
paseo workflow inspect /absolute/path/workflow.json
paseo workflow ls
paseo workflow cancel <run-id>
paseo workflow protocol --json
```

The Workflow path is resolved on the daemon host. Add `--host` when the CLI connects to another
daemon.
