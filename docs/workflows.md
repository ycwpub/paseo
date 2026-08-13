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
  "node": {
    "var": {
      "cursor": "0"
    }
  }
}
```

- `data` is the original Workflow input or the previous node's `data`, after the node's `inputs`
  mapping.
- `workflow.var` contains Workflow variables.
- `node.var` contains variables declared by the current node.
- A node's `inputSchema` validates `data`, not the outer envelope.
- Expressions can read `data.*`, `workflow.var.*`, `node.var.*`,
  `workflow.inputs.*`, and `nodes.<id>.outputs.*`.

## Node result

Bash, Python, and custom Agent nodes return:

```json
{
  "data": {
    "answer": "done",
    "control": ""
  },
  "modify": {
    "workflow": {
      "var": {
        "counter": "1"
      }
    },
    "node": {
      "var": {
        "cursor": "next"
      }
    }
  },
  "base_resp": {
    "status_code": 0,
    "status_msg": "",
    "forbid_retry": 0
  },
  "artifacts": [
    {
      "name": "report",
      "uri": "file:///tmp/report.json",
      "mediaType": "application/json"
    }
  ]
}
```

- `data` becomes the next node's `data`.
- `modify` can update declared Workflow and node variables. Undeclared variables and invalid
  `int64` values fail the node.
- `base_resp.status_code != 0` fails the node. `status_msg` is the failure message.
- `base_resp.forbid_retry != 0` prevents the configured retry policy from retrying the node.
- `artifacts` are retained on the node run and the Workflow run.
- Flow control is not a framework field. Put fields such as `control` in `data`, then point Switch
  or For at them.

Variable updates are committed only after the result envelope and output schema pass validation.
Concurrent For iterations serialize shared Workflow-variable commits with a lock. Each assignment
is atomic; when iterations assign the same variable, the last committed assignment is retained.

## Bash

Bash reads the input envelope from stdin. stdout and stderr are logs. File descriptor 3 is the only
structured result channel.

Set `inputVariable` and `outputVariable` on the node. They default to `input` and `output`.
Paseo wraps the command as follows:

```bash
input="$(cat)"
output=""

# user command

printf '%s' "$output" >&3
```

Example user command:

```bash
output="$(node - "$input" <<'NODE'
const input = JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify({
  data: {
    ...input.data,
    answer: "done"
  },
  modify: {
    workflow: { var: {} },
    node: { var: {} }
  },
  base_resp: {
    status_code: 0,
    status_msg: "",
    forbid_retry: 0
  },
  artifacts: []
}));
NODE
)"
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
    "modify": {
        "workflow": {"var": {}},
        "node": {"var": {}},
    },
    "base_resp": {
        "status_code": 0,
        "status_msg": "",
        "forbid_retry": 0,
    },
    "artifacts": [],
}
```

A non-zero interpreter exit code fails the node.

## Agent

Agent nodes require a final answer. A missing final answer fails the node.

- `outputMode: "normal"` converts the final answer to
  `{"data":{"answer":"Agent answer"}}`.
- `outputMode: "custom"` parses the final answer as the complete node result envelope.

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

For supports two modes.

### Array mode

```json
{
  "id": "items",
  "type": "for",
  "mode": "items",
  "items": "{{data.items}}",
  "forControl": "{{data.control}}",
  "maxIterations": 100,
  "concurrency": 4,
  "steps": []
}
```

The body receives:

- `data.loop.item`: current array item
- `data.loop.index`: zero-based index
- `data.loop.count`: total planned iterations

### Continuous mode

`mode: "while"` runs until `maxIterations` or `break`. Continuous mode is serial and requires
`concurrency: 1`.

`forControl` reads a user-defined value after each body node:

- `break`: stop scheduling iterations
- `continue`: skip the remaining nodes in the current iteration
- empty: run the next body node

Any other non-empty control value fails the For node, so misspelled control values do not silently
change execution.

Array mode supports concurrency from 1 to 100. Concurrent iterations start from the For node's
input data. Workflow-variable commits are serialized; iteration `data` remains isolated.

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

```bash
paseo workflow inspect /absolute/path/workflow.json
paseo workflow ls
paseo workflow cancel <run-id>
paseo workflow protocol --json
```

The Workflow path is resolved on the daemon host. Add `--host` when the CLI connects to another
daemon.
