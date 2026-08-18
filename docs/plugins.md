# Plugins

Paseo reads the Codex plugin package format. A plugin has a
`.codex-plugin/plugin.json` manifest and can bundle Skills, MCP servers, HTTP services, and
declarative apps.

## Supported package surface

Paseo activates:

- `skills` paths containing standard `SKILL.md` directories and their supporting files
- the default `./skills/` directory when present, even when omitted from the manifest
- `mcpServers` paths or inline server maps, including an `mcp_servers`/`mcpServers` wrapper
- the default `./.mcp.json` file when present, even when omitted from the manifest
- `httpServices` definitions backed by Paseo workflows
- the default `./.http.json` file when present, even when omitted from the manifest
- Codex-compatible `apps` declarations from `.app.json`
- Agent-generated declarative app interfaces that can invoke installed HTTP service plugins
- manifest metadata used by the Plugins settings page

Paseo detects `hooks` but does not execute them. Hooks need a separate trust and runtime model;
installing or enabling a plugin must not grant command execution implicitly.

Manifest component paths start with `./`, stay inside the plugin root, and cannot traverse symbolic
links. Plugin Skill files are copied into the install cache before activation. MCP strings may use
`${PLUGIN_ROOT}`, `${PLUGIN_DATA}`, `${CLAUDE_PLUGIN_ROOT}`, or `${CLAUDE_PLUGIN_DATA}`.

## Marketplaces

Paseo discovers Codex-compatible local marketplaces at:

- `~/.agents/plugins/marketplace.json`
- the packaged desktop marketplace at
  `process.resourcesPath/.agents/plugins/marketplace.json`
- `.agents/plugins/marketplace.json` in the daemon's repository ancestry
- `.claude-plugin/marketplace.json` in the daemon's repository ancestry
- paths added from **Host Settings → Plugins**

The first release installs local marketplace entries. Git and npm entries remain visible with an
unsupported-source explanation instead of being executed or downloaded.

## Lifecycle and ownership

Installed packages live under `$PASEO_HOME/plugins/cache/`. Writable plugin data lives under
`$PASEO_HOME/plugins/data/` and remains after uninstall so a reinstall can reuse credentials or
state.

Each imported Skill and MCP server records its owning plugin. Disabling a plugin disables its
resources and remembers their individual enabled states. Uninstall removes only resources still
owned by that plugin. A user-created resource or another plugin with the same name wins; the
conflicting bundled resource is skipped and shown as a warning.

Run **Refresh** after changing a local marketplace or plugin package, then reinstall the plugin to
copy the new package version. Start a new Agent session when a provider does not reload Skills or
MCP configuration dynamically.

## Workflow-backed HTTP services

Paseo extends the Codex package format with an optional `httpServices` manifest field:

```json
{
  "name": "review-service",
  "version": "1.0.0",
  "description": "Asynchronous review API",
  "httpServices": "./.http.json"
}
```

The referenced file contains one or more services:

```json
{
  "services": {
    "review": {
      "host": "127.0.0.1",
      "port": 8088,
      "path": "/review",
      "workflow": "./workflows/review.json",
      "maxBodyBytes": 1048576
    }
  }
}
```

`POST /review` accepts a JSON object and immediately returns HTTP 202:

```json
{
  "processId": "4f0f5ce6-87e3-4f72-9b13-873666f61ba4",
  "status": "queued",
  "statusUrl": "http://127.0.0.1:8088/review/4f0f5ce6-87e3-4f72-9b13-873666f61ba4"
}
```

The request object becomes the workflow's original input. The referenced workflow can use every
supported workflow node type, including Bash, Python, Agent, Switch, and For, plus node retry
policies. Paseo stores
the processing record under `$PASEO_HOME/plugins/http-jobs/`, links it to the workflow run, and
updates it when execution completes.

Use `GET /review/{processId}` to query status, structured workflow output, error information, and
the underlying workflow run ID.

Services bind to `127.0.0.1` by default. A non-loopback host such as `0.0.0.0` must configure
`authTokenEnv`; callers must then send `Authorization: Bearer <token>`. Port `0` is supported when
an automatically allocated local port is preferred. Disabling or uninstalling a plugin stops new
HTTP requests without deleting historical processing records.

## Agent-generated plugin apps

Declare app slots with the standard Codex `.app.json` shape:

```json
{
  "apps": {
    "review-console": {
      "id": "review-console",
      "category": "Productivity"
    }
  }
}
```

An app can ship an initial declarative interface instead of starting empty:

```json
{
  "apps": {
    "review-console": {
      "id": "review-console",
      "category": "Productivity",
      "document": "./apps/review-console.json"
    }
  }
}
```

The document is validated during plugin discovery and becomes the initial app state on first open.
Subsequent Agent revisions remain local and do not modify the packaged template.

Reference the file from `plugin.json`, or rely on default `.app.json` discovery:

```json
{
  "name": "review-console",
  "version": "1.0.0",
  "description": "Interactive review console",
  "apps": "./.app.json"
}
```

After installation, open **Host Settings → Plugins → Open app**. Describe the desired interface to
the Agent. Each message revises the complete interface while preserving the local conversation.
Paseo stores generated state under:

```text
$PASEO_HOME/plugins/data/<plugin-id>/apps/<app-id>/state.json
```

The Agent does not generate executable HTML or JavaScript. It must return a validated version 1
declarative document using these components:

- `heading`, `text`
- `text_input`, `textarea`, `number_input`, `select`, `checkbox`
- `button`
- `status`, `result`, `json`

A button can invoke an installed workflow-backed HTTP service:

```json
{
  "id": "submit",
  "type": "button",
  "label": "Start review",
  "action": {
    "type": "http_service",
    "pluginId": "review-service",
    "serviceName": "review",
    "input": {
      "repository": "{{form.repository}}",
      "question": "{{form.question}}"
    }
  }
}
```

`pluginId` may point to the app's own plugin or another enabled plugin. Paseo resolves
`{{form.<field-id>}}` templates, submits the processing job through the daemon, polls the persisted
job by `processId`, and renders its status and structured result. The app never needs direct access
to a random local port, so CORS and service authentication stay inside the daemon boundary.

## Workflow output to Paseo memory

A Workflow-backed HTTP service can explicitly opt into writing selected successful output to
Paseo Memory:

```json
{
  "services": {
    "development": {
      "host": "127.0.0.1",
      "port": 0,
      "path": "/development",
      "workflow": "./workflows/development.json",
      "memory": {
        "outputPath": "memory"
      }
    }
  }
}
```

The successful Workflow's final `data` object must contain:

```json
{
  "memory": {
    "targets": [
      { "type": "global" },
      { "type": "project", "id": "project-id" },
      { "type": "assistant", "id": "assistant-id" }
    ],
    "entries": [
      {
        "title": "Architecture decision",
        "category": "decision",
        "content": "Use an isolated run directory.",
        "keywords": ["architecture"],
        "confidence": 0.9,
        "importance": 0.8
      }
    ]
  }
}
```

Paseo deduplicates target scopes, applies normal memory safety and sensitive-data policy, rejects
secret-bearing or oversized entries, and records accepted entries as explicit memory. Failed,
cancelled, or timed-out workflows never write memory.

## Built-in Byte Development plugin

The bundled `byte-development` plugin demonstrates the complete composition:

- a prebuilt declarative app for PRD, repository, Agent, BITS approvals, and memory targets
- a Workflow for PRD → technical design → Agent instruction → development → review → deployment
  → testing → release
- dynamic Agent provider/model/cwd values resolved from Workflow input
- a safe BITS adapter that invokes `bytedcli --json bits ...` without shell interpolation
- deploy and publish dry-runs by default; quick-run is skipped until explicitly approved
- release state inspection before publish
- optional project, assistant, and global memory writes

The plugin does not create Dev Tasks itself. Agents must use the official
`bits-devops-dev-task` skill for its prepare/confirm/submit flow. It also does not bypass
Gatekeeper, QCSS, or other release gates.

## Built-in Byte Reconciliation plugin

The bundled `byte-reconciliation` plugin supports a guarded reconciliation lifecycle:

- conversational requirement clarification and reconciliation rule design
- repository code, SQL, and configuration generation or modification
- optional FundEye/Fullink/TCheck rule creation or draft updates
- local test execution or a generated test matrix
- Fullink double-rule debug and read-only TCheck record queries
- read-only FundEye Diff comparison over an explicit time window
- optional project, assistant, and global memory output

Repository changes, local tests, FundEye writes, and Fullink debug each have separate approval
fields. The FundEye adapter uses argument arrays rather than shell interpolation and only exposes an
allowlist of rule create/draft/sub-rule update commands. It never publishes TCheck rules, processes
or retries Diff records, or reruns historical reconciliation records.
