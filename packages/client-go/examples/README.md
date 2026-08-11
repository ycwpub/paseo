# Go client examples

The examples can use an existing agent through `PASEO_AGENT_ID`. If it is not
set, they call `GetAgent` using a stable agent title derived from
`PASEO_SESSION_KEY` before calling `CreateAgent`, preventing duplicate creation
during normal sequential runs.

After a task completes successfully, each example calls `ArchiveAgent`.
Set `PASEO_KEEP_AGENT=true` to keep the agent active.

Common environment variables:

```bash
export PASEO_WS_URL=ws://127.0.0.1:6767/ws
export PASEO_PASSWORD=<optional-daemon-password>

# Either reuse an agent:
export PASEO_AGENT_ID=<agent-id>

# Or query/create one:
export PASEO_CWD=/absolute/path/to/project
export PASEO_SESSION_KEY=<stable-business-session-key>
export PASEO_PROVIDER=codex
export PASEO_MODE=auto
export PASEO_MODEL=<optional-model-id>
export PASEO_THINKING=<optional-thinking-option-id>

# Optional: do not archive after successful completion.
export PASEO_KEEP_AGENT=true
```

If `PASEO_SESSION_KEY` is omitted, each example uses its own stable default.
Use a unique business key when multiple jobs or users share the same service.
If the matching session is already archived, the example exits instead of
creating a duplicate. The get-before-create sequence is not atomic across
concurrent processes; use
an external lock when the same key can be created concurrently.

## Single turn

Sends one message, prints stream events, and exits on `turn_completed`,
`turn_failed`, or `turn_canceled`. A successful turn is archived.

```bash
go run ./examples/single-turn
```

## Multiple turns

Keeps one subscription open and sends three messages sequentially. Each next
message is sent only after the previous turn completes. The agent is archived
after all turns complete.

```bash
go run ./examples/multi-turn
```

## Permission handling

Sends a task likely to require a file-write approval, prints the permission
details, asks the terminal user, and calls `RespondToPermission`.
The agent is archived after the turn completes.

Use an agent mode that asks for permission, such as Codex `auto` or Claude
`default`.

```bash
go run ./examples/permission
```

The prompt can be overridden:

```bash
PASEO_PROMPT='运行需要审批的命令' go run ./examples/permission
```
