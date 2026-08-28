# Plugins

Paseo has one plugin lifecycle for local and Git-installed packages. A package can contribute
daemon RPCs and native app surfaces from `index.ts`, and can also import Codex-compatible Skills,
MCP servers, HTTP services, and declarative apps from `.codex-plugin/plugin.json`.

The lifecycle, enable/disable state, updates, subprocess ownership, logs, and cleanup are always
owned by Paseo's plugin runtime. Codex-compatible resources and Project-bound apps are contribution
types inside that lifecycle, not a second plugin manager. Plugin code is trusted code; Paseo does
not sandbox it.

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

Installed plugins from the packaged desktop marketplace are re-copied from the packaged source
when the daemon starts, including same-version package changes. This prevents a stale cache from
missing newly bundled apps or other components. For user-added local marketplaces, run
**Refresh**, then use **Update** to copy a new package version. Start a new Agent session when a
provider does not reload Skills or MCP configuration dynamically.

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
  "statusUrl": "http://127.0.0.1:8088/review?request_id=4f0f5ce6-87e3-4f72-9b13-873666f61ba4"
}
```

The request object becomes the workflow's original input. The referenced workflow can use every
supported workflow node type, including Bash, Python, Agent, Switch, and For, plus node retry
policies. Paseo stores
the processing record under `$PASEO_HOME/plugins/http-jobs/`, links it to the workflow run, and
updates it when execution completes.

Use `GET /review?request_id={processId}` to query status, structured workflow output, error
information, and the underlying workflow run ID.

Services bind to `127.0.0.1` by default. A listener may bind only to a concrete IPv4 address owned
by the daemon Host. The management console loads those addresses from the daemon and rejects
wildcard, hostname, and external addresses such as `0.0.0.0`. Port `0` is supported when an
automatically allocated local port is preferred. Disabling or uninstalling a plugin stops new HTTP
requests without deleting historical processing records.

The built-in HTTP Service plugin also provides a Project-scoped management console. A Project can
define multiple listeners, and each listener has its own local Host address, port, enabled state,
routes, and retention policy. Fixed ports sharing the same host are served by one listener;
`port: 0` listeners receive independent dynamically allocated ports.

Each listener can enable the standard asynchronous request API:

- `POST /jobs` persists the request and returns a processing ID before Workflow execution starts;
- `GET /jobs?request_id={requestId}` returns the persisted state, input, output, error, and
  Workflow run ID;
- `DELETE /jobs?request_id={requestId}` deletes a terminal request; queued and running requests
  are protected.

Additional POST paths can select a different Workflow or `targetNodeId`, and can define JSON
request/response mappings. Request mappings use `{{request}}` or `{{request.field}}`; response
mappings use `{{job.id}}`, `{{job.status}}`, and `{{result}}`. An empty mapping preserves the
standard payload.

Requests follow `queued → running → succeeded|failed|cancelled|timed_out`. The console supports
request inspection and batch deletion. Retention cleanup is listener-specific, filters by terminal
status and creation age, runs once after configuration changes, and then uses a low-frequency
timer instead of continuously scanning. Its test panel sends requests from the daemon to the
selected saved listener and route; the client cannot provide an arbitrary URL.

## Agent-generated plugin apps

### Project-first plugin standard

Paseo treats Project as the core unit of every user-facing plugin. A headless package can provide
Skills, MCP servers, or HTTP services, but its pages, interactions, and processes are composed by a
Project-bound app:

- the user must select an existing Project or create a new Project before opening the app;
- the user must select a Provider and a concrete model before saving the plugin project;
- a new Project always uses a user-defined name;
- the selected Provider and model become the plugin project's default Agent configuration;
- creation only collects the plugin project identity, Project, Provider, and model; prompts,
  assistants, approvals, and other Agent-dependent options are configured after the plugin project
  has been saved;
- app pages, Agent conversations, local app state, HTTP jobs, workflows, and history are scoped to
  the selected Project;
- Paseo injects the canonical `projectId`, `projectName`, and `projectSourceDirectory` fields into
  every app form and HTTP action input;
- plugin UI documents should not ask users to type raw Project IDs or repository paths that already
  come from Project context.

### Native runtime contributions

Shared files import contracts from `@getpaseo/plugin/server`. Client files import Paseo UI from
`@getpaseo/plugin/react-native`. Its `Icon` resolves a Lucide name using the client's installed icon
set; an unknown name renders nothing so it cannot break the plugin surface.
Its controlled modal keeps presentation metadata on `<Modal title="…" icon={…}>` and body UI in
`<Modal.Content>`.
Plugin UI runs on desktop and mobile across multiple themes: color every `Text` from
`theme.colors.foreground` or `theme.colors.foregroundMuted`, and size layout from `layout.compact`.
See `public-docs/plugins/reference.md`.

| Module                          | Use it for                                               |
| ------------------------------- | -------------------------------------------------------- |
| `@getpaseo/plugin`              | contribution contracts and client data hooks             |
| `@getpaseo/plugin/react-native` | Paseo React Native components and UI hooks               |
| `@getpaseo/plugin/server`       | `defineRpc`, `defineAttachmentSource`, and handler types |

The compiler removes client registrations and imports from the server entry point, and server
registrations and imports from the client entry point. Importing a `*.server` module from a client
module, or a `*.client` module from a server module, fails compilation. Top-level React Native calls
such as `StyleSheet.create` belong in `*.client.tsx`; placing them in `index.ts` executes them in the
server bundle.

```ts
import type { PluginContext } from "@getpaseo/plugin";
import { Greeting } from "./greeting.client";
import { createGreeting } from "./greeting.server";
import { greetRpc } from "./greeting.shared";

export default function contribute(plugin: PluginContext) {
  plugin.handle(greetRpc, createGreeting);
  plugin.addSurface("main", Greeting);
  plugin.addSidebarItem({ id: "main", title: "Greeting", icon: "MessageCircle", surface: "main" });
  return () => {};
}
```

### Project-bound declarative apps

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

### Runtime ownership and client extension points

RPC contracts validate inputs and outputs in both the app and plugin subprocess. `useRpc` returns a
typed async function. Use the host-provided `@tanstack/react-query` for request state and caching;
Paseo gives each plugin installation its own query client.

`usePaseo()` and the handler's `{ paseo }` context expose the same `PaseoApi`: projects,
workspaces, agents, providers, and daemon config. They do not expose connection lifecycle. A surface borrows the
selected host's existing connection; switching the screen's host changes both `usePaseo()` and
`useRpc()` to that host. An offline selected host fails there and never falls through to another
installation. A server handler owns an IPC-backed daemon session for the life of its subprocess.
Use plugin RPC for plugin-specific backend behavior that is not a normal Paseo operation.

Each subprocess gets an exclusively owned `plugin:<id>` session. That identity is reserved from
normal clients, never resumes another session, and is cleaned immediately on exit without reconnect
grace. During daemon startup, plugin sessions may connect while application WebSockets remain
paused; the daemon accepts clients only after configured plugins have settled and the initial
catalog is complete.

When the same plugin contribution exists on multiple hosts, Paseo shows it once in the sidebar and
adds a host picker to the screen header. The selected host supplies the bundle, RPC transport, and
query cache. Plugin code cannot address another host.

Workspace panels and Command Center items remain client contributions. The daemon transports their
compiled bundle without interpreting placement or callbacks. Panel props contain workspace and agent
IDs. Required-selector hooks read normalized client state synchronously and use shallow equality, so a
panel does not subscribe to fields it does not render. Command callbacks materialize their snapshots
only when invoked. Contribution discovery and panel opening never fetch active context through plugin
RPC. Snapshot DTOs are deeply readonly and frozen at runtime so plugin code cannot mutate normalized
app state or a memoized selection. Panels use one persisted
`plugin` workspace-tab target, so reload, disable, removal, and restoration resolve through the
current installed-plugin catalog. A missing contribution renders unavailable inside the tab.
Panels declare `locations: ["workspace", "explorer"]` to opt into Explorer hosting; omission means
workspace only. Location controls hosting, not context. An agent panel target keeps its `agentId`
when moved between hosts. Explorer configuration can create workspace-context panels and remove
existing agent-context instances, but it cannot create an agent panel without an agent-aware command.

Command Center callbacks use the selected host's existing `PaseoApi` for normal Paseo operations.
They use typed plugin RPC only for plugin-specific backend work. Navigation is limited to the
plugin's registered global surfaces and workspace panels; plugins do not receive Expo Router or
workspace-layout store access.

## Contribute composer pills

Register a headless client entrypoint, then add and remove targeted pills from that client
lifecycle. `addClientSide` runs once per plugin installation in each connected app and never runs
in the daemon subprocess. It can subscribe to the client API, call plugin RPCs, and own arbitrary
client state without mounting a panel or surface.

```tsx
export function contributeClient(client: PluginClientContext) {
  const pills = new Map<string, () => void>();
  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind !== "upsert" || !update.agent.workspaceId) return;
    const { id: agentId, workspaceId } = update.agent;
    pills.get(agentId)?.();
    pills.set(
      agentId,
      client.addComposerPill({
        id: "review",
        title: "Open review",
        workspaceId,
        agentId,
        Component: ReviewPill,
        async onPress() {
          await client.rpc(refreshReview, { agentId });
          client.openPanel("review", { workspaceId, agentId });
        },
      }),
    );
  });
  return () => {
    unsubscribe();
    for (const remove of pills.values()) remove();
  };
}
```

Wire it from `index.ts` with `plugin.addClientSide(contributeClient)`. `addComposerPill` exists only
on `PluginClientContext`; it returns an idempotent removal function. A pill appears only in the
matching workspace and agent track bar alongside Tasks and Subagents. Paseo owns the pressable,
shared chrome, pending state, error reporting, and placement. The component owns its icon and text;
the callback is client code by construction. Removing the pill, reloading the plugin, disconnecting
the host, or unloading the app tears down the contribution.

## Contribute timeline items

Timeline transformers and renderers are client contributions. The daemon's canonical rows and
built-in projection stay unchanged. The app transforms fetched projected history before building
its render model. A matching live event requests a fresh projected tail, so lifecycle deltas are
collapsed before the transformer replaces anything.

`query.itemType` selects one public `AgentTimelineItem.type`. The callback owns any detailed
recognition and returns plain plugin item objects. `undefined` keeps the source item, `items`
replaces it, and an empty array removes it. Output `data` must be JSON-compatible. Paseo adds the
runtime plugin ID, preserves the source timeline cursor, validates renderer data with its Zod
schema, and mounts the component inside the normal plugin runtime and error boundary.

Transformers run synchronously and must be deterministic. When several transformers match, the
first one that returns a result owns that source item. Plugin and registration ordering is stable.
See `plugin-examples/timeline-items` for the complete contract.

## Contribute composer attachments

Register a declarative attachment source backed by a plugin RPC. Paseo owns the attachment menu,
search picker, drafts, selected pill, and submission. The plugin returns complete text snapshots;
credentials and vendor API calls stay in the daemon handler.

```ts
import type { PluginContext } from "@getpaseo/plugin";
import { search } from "./issues.server";
import { issues, searchIssues } from "./issues.shared";

export default function contribute(plugin: PluginContext) {
  plugin.handle(searchIssues, search);
  plugin.addAttachmentSource(issues);
  return () => {};
}
```

### Declarative app slots

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

After installation, open **Host Settings → Plugins → Open app**, select the Project and default
Provider/model, and save the plugin project. Agent-driven interface generation is only shown after
that first save. Each later generation instruction revises the complete interface and uses the
saved default model first. Normal discussion happens on the associated Project page rather than
inside the plugin page.
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

Whenever Paseo saves a document, it also compiles an escaped static preview beside the state:

```text
$PASEO_HOME/plugins/data/<plugin-id>/apps/<app-id>/projects/<project-hash>/preview.html
```

The plugin page can open this file through Paseo's sandboxed browser preview. The declarative
document remains the source of truth; the exported HTML does not execute Agent-provided HTML or
JavaScript and does not submit HTTP service actions outside Paseo.

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

The bundled **HTTP 服务** plugin publishes Workflow-backed handlers as asynchronous HTTP APIs. Open its app,
select or create a Project, and manage multiple independently enabled ports. Each port can enable
the standard submit/query/delete API and add custom paths with independent request mappings,
response mappings, and processing handlers. The same page shows the request state machine,
structured input/output, errors, batch deletion, and retention cleanup.

Each request Path can either reuse an existing Workflow (optionally starting from a selected node)
or define one custom Bash, Python, Agent, Switch, or For node directly. Custom nodes are persisted
as plugin-private managed Workflows and run through the same Workflow engine; they do not need a
separate file in the user's Workflow list.

`.http.json` remains the package default and supplies the initial listener/route template. Saving
the Project configuration persists an override under `$PASEO_HOME/plugins/http-services/`; the
installed plugin cache remains read-only.

## Built-in Agent Web App plugin

The bundled **网页应用生成器** plugin provides an empty app slot named `web-app-builder`. Open it
from the installed plugin row and describe the desired interface to the Agent. When an HTTP service
plugin is installed and enabled, generated buttons can bind to that service without exposing its
random local port to the renderer. Paseo saves every generated interface as `preview.html` and
provides a browser preview from the plugin page.

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
