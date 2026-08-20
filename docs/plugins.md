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

The built-in HTTP Service plugin also provides a Project-scoped management console. A Project can
define multiple listeners, and each listener has its own host, port, authentication environment
variable, enabled state, routes, and retention policy. Fixed ports sharing the same host are served
by one listener; `port: 0` listeners receive independent dynamically allocated ports.

Each listener can enable the standard asynchronous request API:

- `POST /jobs` persists the request and returns a processing ID before Workflow execution starts;
- `GET /jobs/{requestId}` returns the persisted state, input, output, error, and Workflow run ID;
- `DELETE /jobs/{requestId}` deletes a terminal request; queued and running requests are protected.

Additional POST paths can select a different Workflow or `targetNodeId`, and can define JSON
request/response mappings. Request mappings use `{{request}}` or `{{request.field}}`; response
mappings use `{{job.id}}`, `{{job.status}}`, and `{{result}}`. An empty mapping preserves the
standard payload.

Requests follow `queued → running → succeeded|failed|cancelled|timed_out`. The console supports
request inspection and batch deletion. Retention cleanup is listener-specific, filters by terminal
status and creation age, runs once after configuration changes, and then uses a low-frequency
timer instead of continuously scanning.

## Agent-generated plugin apps

### Project-first plugin standard

Paseo treats Project as the core unit of every user-facing plugin. A headless package can provide
Skills, MCP servers, or HTTP services, but its pages, interactions, and processes are composed by a
Project-bound app:

- the user must select an existing Project or create a new Project before opening the app;
- a new Project always uses a user-defined name;
- app pages, Agent conversations, local app state, HTTP jobs, workflows, and history are scoped to
  the selected Project;
- Paseo injects the canonical `projectId`, `projectName`, and `projectSourceDirectory` fields into
  every app form and HTTP action input;
- plugin UI documents should not ask users to type raw Project IDs or repository paths that already
  come from Project context.

An app can customize labels and map Project context into workflow-specific fields:

```json
{
  "apps": {
    "review-console": {
      "id": "review-console",
      "category": "Productivity",
      "project": {
        "idField": "projectId",
        "nameField": "projectName",
        "sourceDirectoryField": "repository_path",
        "selectorLabel": "代码 Review Project",
        "selectorDescription": "Review 页面、Agent 会话和流程历史都归属于所选 Project。",
        "createNameLabel": "新 Review Project 名称",
        "createNamePlaceholder": "例如：支付服务安全 Review"
      },
      "document": "./apps/review-console.json"
    }
  }
}
```

`projectId`, `projectName`, and `projectSourceDirectory` are always present as canonical fields.
`idField`, `nameField`, and `sourceDirectoryField` add aliases for an existing workflow contract.
New plugins should prefer the canonical names.

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
Paseo stores generated state separately for each Project under:

```text
$PASEO_HOME/plugins/data/<plugin-id>/apps/<app-id>/projects/<project-hash>/state.json
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

## Built-in HTTP Service plugin

The bundled **HTTP 服务** plugin publishes Workflows as asynchronous HTTP APIs. Open its app,
select or create a Project, and manage multiple independently enabled ports. Each port can enable
the standard submit/query/delete API and add custom paths with independent request mappings,
response mappings, Workflow files, and processing node IDs. The same page shows the request state
machine, structured input/output, errors, batch deletion, and retention cleanup.

`.http.json` remains the package default and supplies the initial listener/route template. Saving
the Project configuration persists an override under `$PASEO_HOME/plugins/http-services/`; the
installed plugin cache remains read-only.

## Built-in Agent Web App plugin

The bundled **网页应用生成器** plugin provides an empty app slot named `web-app-builder`. Open it
from the installed plugin row and describe the desired interface to the Agent. When an HTTP service
plugin is installed and enabled, generated buttons can bind to that service without exposing its
random local port to the renderer.

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
