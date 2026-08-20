# Data Model

## Project identity

Directory-backed Projects are allocated for the exact root selected by the caller, normalized
lexically with `path.resolve` (never `realpath`). Blank Projects are allocated with `rootPath:
null`; they remain visible without a Workspace and do not create a hidden or temporary directory.
Creating the first directory Workspace in a blank Project attaches that directory as its root.
New project IDs are generated opaque `prj_<16 hex>` values and are never derived from the
filesystem path. Existing remote-shaped or path-shaped IDs are retained as readable compatibility
records and are never rekeyed. Explicit **Add Project** operations always allocate a new identity,
so multiple Projects may intentionally use the same root path. Idempotent workspace recovery may
reuse the oldest active exact-root Project. Archived-only matches do not resurrect an old Project.
Workspace `projectId` is stable membership: reconciliation may update git-derived kind and branch
metadata, but never rehomes a workspace or changes a directory-backed Project's root, ID, or
default name.

`projectId` is the unique project identity. Display/custom project names are not unique and may be
reused by multiple projects. UI and protocol operations that mutate a project use `projectId`,
never the display name.

`kind` is mutable metadata, not identity. Workspace reconciliation watches active directory-backed project roots and
updates only a project's `kind` and `updatedAt` when `.git` appears or disappears, preserving its
ID, root path, names, and workspace foreign keys. Attached workspaces are independently refreshed
from their own cwd, so an explicit project root never implies a workspace checkout. Empty projects
are observed too.

The workspace registry model defines placement once: initial directory/worktree construction,
mutable reconciliation fields, and the persisted-to-wire checkout projection. Its update policy
preserves `displayName` and `baseBranch`. `WorkspaceProvisioningService` owns the corresponding
registry writes, so directory opens, agent imports, and worktree creation all enter through that
service instead of constructing records independently. The workspace record is then the durable
placement authority: `cwd` is the exact execution directory, while `worktreeRoot` is the backing
checkout root. They intentionally differ for an exact subproject inside a worktree. Archive,
restore, branch auto-name, and descriptor flows consume those persisted facts rather than
rediscovering ownership from a directory that may already be gone. Reconciliation may refresh
mutable placement facts, but never changes `projectId`, `cwd`, `displayName`, or `baseBranch`.
Workspace archive runs lifecycle teardown from the exact `cwd` but removes only the backing
`worktreeRoot` after its last active reference disappears. Worktree recovery recreates that backing
checkout from `mainRepoRoot`, then restores the relative path from `worktreeRoot` to `cwd`.

Paseo uses **file-based JSON persistence** instead of a traditional database. All data is validated at runtime with Zod schemas. Most stores write atomically (write to temp file, then rename); a few still use plain `writeFile` — see each section. There is no schema-versioning/migration framework — schemas rely on optional fields with defaults for forward compatibility, with a small amount of inline normalization in `persisted-config.ts` for legacy provider/speech entries.

All server-side stores live under `$PASEO_HOME` (defaults to `~/.paseo`).

## Project resource configuration

Project resource configuration follows the Project's directory mode:

- A single-directory Project stores `paseo.json` in its configured Project directory.
- A multiple-directory Project stores `paseo.json` under
  `$PASEO_HOME/projects/configs/{project-key}/paseo.json`. The opaque project key is a hash of
  `projectId`, so legacy path-shaped IDs cannot escape the configuration directory.
- A Project created without a directory starts in multiple-directory mode with an empty Project
  directory list.

Changing the mode migrates the complete `paseo.json`, including worktree and script configuration.
Paseo writes the new file before removing the old one. Changing to single-directory mode also
updates the registered Project root to the selected directory.

```json
{
  "project": {
    "directories": {
      "project": [".", "../shared-source"],
      "indexSkill": [".paseo/project-index"],
      "workspaceData": [".paseo/workspaces"]
    },
    "knowledge": {
      "general": [
        { "type": "local-directory", "source": "docs/background" },
        { "type": "local-document", "source": "README.md" },
        { "type": "cloud-document", "source": "https://example.com/domain" }
      ],
      "standards": [
        { "type": "local-document", "source": "docs/standards.md" },
        { "type": "cloud-document", "source": "https://example.com/standards" }
      ],
      "projectSpecific": [{ "type": "local-document", "source": "docs/architecture.md" }]
    },
    "indexSkill": {
      "autoGenerate": false,
      "updateIntervalMinutes": null
    },
    "variables": {
      "serviceName": "checkout"
    }
  }
}
```

Every directory type accepts multiple physical directories. Relative paths resolve from the
registered Project root. When `directories.project` is empty, the active Workspace directory is
used so worktree Agents do not accidentally edit the main checkout. Project directories are
writable and read on demand. Configured index Skill directories are consulted before broad
filesystem exploration.

Project knowledge has three explicit policies:

- General knowledge is optional background material. It supports local directories, local
  documents, and cloud documents. Agents load and adopt it only when relevant. Local directories
  are included in the generated Project index.
- Standard knowledge supports local and cloud documents. Local document contents are injected into
  every Agent's system prompt. Agents must load every cloud standard before acting and obey all
  applicable requirements.
- Project-specific knowledge supports local and cloud documents. Local document contents are
  injected into every Agent's system prompt, but Agents adopt the content according to task
  relevance.

Knowledge content is read-only by default. Agents may change it only when the user explicitly asks
to update Project knowledge in the current conversation. Legacy `directories.knowledge`,
`directories.reference`, and `project.larkDocumentLinks` values remain readable and are migrated
to general knowledge the next time the Project is saved.

Workspace data roots are workspace-scoped: Paseo appends the opaque `workspaceId` unless the
configured path explicitly contains `{{workspaceId}}`. These directories hold resumable process
notes, review artifacts, and outputs. They are created when an Agent starts in the Workspace.

When a Project omits directory configuration, Paseo uses these defaults:

- Project directories: `{{workspaceDirectory}}`
- General AI knowledge directories: `.agents`, `.agent`, `.claude`, `.codex`, and `.trae`
- Index Skill directories: none
- Workspace data directories: `.paseo/workspaces/{{workspaceId}}`

Missing default knowledge directories are ignored by the Agent context until they exist. The
right-side file explorer exposes all four directory categories and supports switching among every
configured physical root.

Automatic index Skill generation is disabled by default. When enabled, Paseo writes a standard
`SKILL.md` directory index to every configured index Skill directory. A Project-specific
`updateIntervalMinutes` overrides the daemon-wide interval; a missing/null value inherits the
global setting. Disabling generation does not delete manually maintained index content.

Instruction templates are daemon-global and stored in `$PASEO_HOME/config.json`, not in a
Project's `paseo.json`. Projects define only variables used to fill those templates. The expanded
Markdown composer loads the host's global templates and fills active Project variables plus
built-ins such as `projectId`, `projectName`, `projectRoot`, `workspaceId`, `workspaceName`, and
`workspaceDirectory`. Unknown placeholders remain visible rather than being silently removed.
Legacy Project-local templates remain readable and are migrated to global configuration the next
time that Project is saved.

## Store Surface Rules

Store APIs own persistence atomicity and should not make services coordinate raw reads and writes. A good store method maps cleanly to one SQL statement or one SQL transaction, even when the current implementation is JSON files. If a caller needs a queue, lock, read-merge-write loop, or uniqueness race workaround, that behavior belongs behind the store surface.

---

## Directory layout

```
$PASEO_HOME/
├── config.json                          # Daemon configuration
├── server-id                            # Stable daemon identifier (plain text, "srv_<base64url>")
├── daemon-keypair.json                  # E2EE keypair for relay (mode 0600)
├── paseo.pid                            # Daemon PID lock file
├── daemon.log                           # Default log file (path configurable)
├── agents/
│   └── {sanitized-cwd}/
│       └── {agentId}.json               # One file per agent
├── assistants.json                      # Assistant presets
├── channels/
│   └── lark-directory.json              # App-scoped Lark email/Open ID and group/chat ID relations
├── memory/
│   ├── catalog.json                     # Memory users, active user, settings, metadata, provenance, and extraction state
│   ├── users/
│   │   └── {userId}/summary.md          # Per-user global memory summary and detail index
│   └── details/                         # Topic detail files loaded only when relevant
├── plugins/
│   ├── catalog.json                     # Plugin marketplaces, installs, enable state, and resource ownership
│   ├── cache/                           # Installed plugin package copies
│   └── data/                            # Writable plugin state retained across uninstall/reinstall
├── teams.json                           # Assistant teams and leader membership
├── client-access.json                   # Approved clients + 30-day client connection history
├── relay-connection-history.json        # 30-day local Relay connection history
├── schedules/
│   └── {scheduleId}.json                # One file per schedule
├── projects/
│   ├── projects.json                    # Project registry
│   ├── workspaces.json                  # Workspace registry
│   ├── configs/
│   │   └── {project-key}/paseo.json      # Multiple-directory Project configuration
│   └── icons/                           # Host-local custom project icon images
├── runtime/
│   └── managed-processes/
│       └── {recordId}.json              # Helper processes owned by Paseo; reconciled on daemon bootstrap
└── push-tokens.json                     # Expo push notification tokens
```

The `agents/{sanitized-cwd}/` directory name is derived from the agent's `cwd` by stripping the filesystem root and replacing path separators with `-` (Windows drive letters become a `C-` style prefix). Persistent server stores write atomically by writing a temp file in the target directory and then renaming it into place.

Client and local Relay histories record every accepted connection's start and end time. Active
records use a null end time; records left active by a process restart are closed when the store is
next loaded. Ended records older than 30 days are deleted automatically, and individual records
can also be deleted from their management screens.

---

## 1. Agent Record

**Path:** `$PASEO_HOME/agents/{project-dir}/{agentId}.json`

Each agent is stored as a separate JSON file, grouped by project directory.

| Field                | Type                                     | Description                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `string`                                 | UUID, primary key                                                                                                                                                                                                                                                                                                                                                                   |
| `provider`           | `string`                                 | Agent provider (`"claude"`, `"codex"`, `"opencode"`, etc.)                                                                                                                                                                                                                                                                                                                          |
| `cwd`                | `string`                                 | Working directory the agent operates in                                                                                                                                                                                                                                                                                                                                             |
| `workspaceId`        | `string?`                                | Owning workspace id — the single source of ownership. Every agent is stamped with one at create time; legacy cwd-only records are backfilled once by `migrations/backfill-workspace-id.migration.ts` (the only place a cwd→id mapping exists). Runtime code never infers ownership or status from cwd: status is computed per `workspaceId`, and same-cwd siblings are independent. |
| `createdAt`          | `string` (ISO 8601)                      | Creation timestamp                                                                                                                                                                                                                                                                                                                                                                  |
| `updatedAt`          | `string` (ISO 8601)                      | Last update timestamp                                                                                                                                                                                                                                                                                                                                                               |
| `lastActivityAt`     | `string?` (ISO 8601)                     | Last activity timestamp                                                                                                                                                                                                                                                                                                                                                             |
| `lastUserMessageAt`  | `string?` (ISO 8601)                     | Last user message timestamp                                                                                                                                                                                                                                                                                                                                                         |
| `title`              | `string?`                                | User-visible title                                                                                                                                                                                                                                                                                                                                                                  |
| `labels`             | `Record<string, string>`                 | Key-value labels (default `{}`). `paseo.parent-agent-id` is set automatically for agent-scoped creation and removed by detach — see [agent-lifecycle.md](./agent-lifecycle.md)                                                                                                                                                                                                      |
| `lastStatus`         | `AgentStatus`                            | One of: `"initializing"`, `"idle"`, `"running"`, `"error"`, `"closed"`. `closed` means the record is resumable but has no live provider runtime; archive remains represented separately by `archivedAt`.                                                                                                                                                                            |
| `lastModeId`         | `string?`                                | Last active mode ID                                                                                                                                                                                                                                                                                                                                                                 |
| `config`             | `SerializableConfig?`                    | Agent session configuration (see below)                                                                                                                                                                                                                                                                                                                                             |
| `runtimeInfo`        | `RuntimeInfo?`                           | Live runtime state (see below)                                                                                                                                                                                                                                                                                                                                                      |
| `features`           | `AgentFeature[]?`                        | Provider-reported features (toggles/selects)                                                                                                                                                                                                                                                                                                                                        |
| `persistence`        | `PersistenceHandle?`                     | Handle for resuming sessions                                                                                                                                                                                                                                                                                                                                                        |
| `lastError`          | `string?` (nullable)                     | Last error message, if any                                                                                                                                                                                                                                                                                                                                                          |
| `requiresAttention`  | `boolean?`                               | Whether the agent needs user attention                                                                                                                                                                                                                                                                                                                                              |
| `attentionReason`    | `"finished" \| "error" \| "permission"?` | Why attention is needed                                                                                                                                                                                                                                                                                                                                                             |
| `attentionTimestamp` | `string?` (ISO 8601)                     | When attention was flagged                                                                                                                                                                                                                                                                                                                                                          |
| `internal`           | `boolean?`                               | Whether this is a system-internal agent                                                                                                                                                                                                                                                                                                                                             |
| `archivedAt`         | `string?` (ISO 8601)                     | Soft-delete timestamp                                                                                                                                                                                                                                                                                                                                                               |

### Nested: SerializableConfig

| Field              | Type                       | Description                  |
| ------------------ | -------------------------- | ---------------------------- |
| `title`            | `string?`                  | Configured title             |
| `modeId`           | `string?`                  | Configured mode              |
| `model`            | `string?`                  | Configured model             |
| `thinkingOptionId` | `string?`                  | Thinking/reasoning level     |
| `featureValues`    | `Record<string, unknown>?` | Feature preference overrides |
| `extra`            | `Record<string, any>?`     | Provider-specific config     |
| `systemPrompt`     | `string?`                  | Custom system prompt         |
| `mcpServers`       | `Record<string, any>?`     | MCP server configurations    |

### Nested: RuntimeInfo

| Field              | Type                       | Description                    |
| ------------------ | -------------------------- | ------------------------------ |
| `provider`         | `string`                   | Active provider                |
| `sessionId`        | `string?`                  | Active session ID              |
| `model`            | `string?`                  | Active model                   |
| `thinkingOptionId` | `string?`                  | Active thinking option         |
| `modeId`           | `string?`                  | Active mode                    |
| `extra`            | `Record<string, unknown>?` | Provider-specific runtime data |

### Nested: PersistenceHandle

| Field          | Type                   | Description                                                           |
| -------------- | ---------------------- | --------------------------------------------------------------------- |
| `provider`     | `string`               | Provider that owns the session                                        |
| `sessionId`    | `string`               | Session ID for resumption                                             |
| `nativeHandle` | `any?`                 | Provider-specific handle (Codex thread ID, Claude resume token, etc.) |
| `metadata`     | `Record<string, any>?` | Extra metadata                                                        |

### Nested: AgentFeature (discriminated union on `type`)

**Toggle:**

| Field         | Type       |
| ------------- | ---------- |
| `type`        | `"toggle"` |
| `id`          | `string`   |
| `label`       | `string`   |
| `description` | `string?`  |
| `tooltip`     | `string?`  |
| `icon`        | `string?`  |
| `value`       | `boolean`  |

**Select:**

| Field         | Type                  |
| ------------- | --------------------- |
| `type`        | `"select"`            |
| `id`          | `string`              |
| `label`       | `string`              |
| `description` | `string?`             |
| `tooltip`     | `string?`             |
| `icon`        | `string?`             |
| `value`       | `string \| null`      |
| `options`     | `AgentSelectOption[]` |

---

## Runtime-only Terminal Sessions

Terminals are live daemon state, not persisted JSON records. A terminal carries a `workspaceId` while it is running; workspace-scoped terminal lists include only terminals with the matching `workspaceId`. Legacy live terminals without an owner remain visible to unscoped terminal reads but contribute to no workspace status.

Terminal activity contributes to the workspace status bucket **per `workspaceId`**: a working terminal drives `running` onto the workspace it carries only. Same-`cwd` siblings are untouched; terminal visibility is likewise `workspaceId`-scoped.

---

## 2. Daemon Configuration

**Path:** `$PASEO_HOME/config.json`

Single file, validated with `PersistedConfigSchema`.

```
{
  version: 1,
  daemon: {
    listen: "127.0.0.1:6767",
    hostnames: true | string[],   // legacy alias `allowedHosts` is migrated on load
    trustedProxies: true | string[], // defaults to ["loopback"]; Express proxy names/CIDRs
    mcp: { enabled: boolean, injectIntoAgents: boolean },
    projectIndexing: { updateIntervalMinutes: number }, // default 1440
    appendSystemPrompt: string,    // appended to supported provider system/developer prompts
    terminalProfiles: TerminalProfile[],  // named shell commands; omitted means DEFAULT_TERMINAL_PROFILES
    agentProfiles: AgentProfile[],        // named agent launch bundles; omitted means none
    cors: { allowedOrigins: string[] },
    relay: { enabled: boolean, endpoint: string, publicEndpoint: string, useTls: boolean, publicUseTls: boolean }, // new homes materialize enabled: false
    auth: { password: string }    // bcrypt hash, optional
  },
  app: {
    baseUrl: string
  },
  worktrees?: {
    root?: string            // optional root for new worktrees; defaults to $PASEO_HOME/worktrees
    servicePorts?: {         // optional dynamic service port allocation policy
      range?: string         // inclusive range, e.g. "3000-4000"
      portScript?: string    // executable that receives service/workspace context and prints one TCP port
    }
  },
  providers: {
    openai: {
      apiKey?: string,
      baseUrl?: string,
      stt?: { apiKey?: string, baseUrl?: string },
      tts?: { apiKey?: string, baseUrl?: string }
    },
    local: { modelsDir: string }
  },
  agents: {
    // ProviderOverrideSchema; legacy entries with `command: { mode, ... }` are migrated to the
    // current shape on load via `migrateProviderSettings`. Custom provider IDs must declare
    // `extends` (one of the built-ins or `"acp"`) and `label`. See `provider-launch-config.ts`.
    providers: Record<providerId, ProviderOverride>,
    metadataGeneration: {
      providers: [{ provider, model?, thinkingOptionId? }]
    }
  },
  features: {
    dictation: { enabled, stt: { provider, model, language, confidenceThreshold } },
    voiceMode: { enabled, llm, stt: { provider, model, language }, turnDetection, tts: { provider, model, voice, speakerId, speed } }
  },
  log: {
    level, format,
    console: { level, format },
    file: { level, path, rotate: { maxSize, maxFiles } }
  }
}
```

All fields are optional with sensible defaults.

### Profile lists

`terminalProfiles` and `agentProfiles` are both whole-list fields: a config patch replaces the
array, never merges entries, so a client sends the complete next list on every add, edit, reorder
and remove. List order is the display order.

Absent and empty mean different things for terminal profiles — omitting the key falls back to
`DEFAULT_TERMINAL_PROFILES`, while `[]` means the user removed them all. Agent profiles have no
defaults, so both mean none.

`PersistedConfigSchema` parses strictly, so a daemon that predates a field drops it on write
rather than storing something it cannot describe. That is why the client gates the agent profiles
UI on `server_info.features.agentProfiles` instead of letting a save appear to succeed against an
older daemon.

### Git process limits

Git process limits are global to one daemon. The start-rate limit defaults to `64` processes per
second, and the concurrency limit defaults to `8`:

```json
{
  "daemon": {
    "git": {
      "maxProcessesPerSecond": 64,
      "maxProcessConcurrency": 8
    }
  }
}
```

`maxProcessesPerSecond` limits Git process starts in any one-second interval. The allowance can
start as a burst; it does not wait for earlier processes to exit. `maxProcessConcurrency` limits
the number of Git processes that have started but not exited. Every Git command uses both limits,
including initial workspace reads, filesystem-triggered refreshes, background checks, and explicit
requests.

Environment variables override `config.json`:

| Environment variable                 | Setting                  |
| ------------------------------------ | ------------------------ |
| `PASEO_GIT_MAX_PROCESSES_PER_SECOND` | `maxProcessesPerSecond`  |
| `PASEO_GIT_MAX_PROCESS_CONCURRENCY`  | `maxProcessConcurrency`  |
| `PASEO_GIT_CONCURRENCY`              | Legacy concurrency alias |

`PASEO_GIT_MAX_PROCESS_CONCURRENCY` wins when it and the legacy alias are both set. Restart the
daemon after changing the file or environment. Run `paseo daemon restart` for a standalone daemon.
For a desktop-managed daemon, fully quit and reopen Paseo Desktop.

`agents.metadataGeneration.providers` controls the preferred structured-generation fallback order for daemon-side metadata tasks such as commit messages, PR text, branch names, and generated agent titles. Entries are tried first in the configured order, then Paseo falls through to dynamically discovered defaults and finally the current selection when available.

Local speech model ids are intentionally narrow: STT uses `parakeet-tdt-0.6b-v2-int8`, TTS uses `kokoro-en-v0_19`, and turn detection uses the bundled Silero VAD model.

Set these to select OpenAI instead of local speech:

| Env var                        | Applies to                      |
| ------------------------------ | ------------------------------- |
| `PASEO_VOICE_STT_PROVIDER`     | Voice mode STT provider         |
| `PASEO_DICTATION_STT_PROVIDER` | Composer dictation STT provider |
| `PASEO_VOICE_TTS_PROVIDER`     | Voice mode TTS provider         |

OpenAI speech can be configured under `providers.openai`. STT and TTS resolve independently, so they can point at different endpoints:

```json
{
  "providers": {
    "openai": {
      "stt": {
        "apiKey": "sk-...",
        "baseUrl": "https://stt.example.com/v1"
      },
      "tts": {
        "apiKey": "sk-...",
        "baseUrl": "https://api.openai.com/v1"
      }
    }
  }
}
```

`providers.openai.stt` is used for both composer dictation and voice mode speech-to-text; `providers.openai.tts` is used for voice mode text-to-speech. The equivalent env vars are `OPENAI_STT_API_KEY`/`OPENAI_STT_BASE_URL` and `OPENAI_TTS_API_KEY`/`OPENAI_TTS_BASE_URL`. Each feature falls back to `providers.openai.apiKey`/`providers.openai.baseUrl`, then `OPENAI_API_KEY`/`OPENAI_BASE_URL`, when its own fields are unset. These settings apply only to Paseo OpenAI speech features, not to Codex or other OpenAI-backed tools.

Paseo uses these paths under the configured OpenAI base URL:

- dictation STT: `/v1/audio/transcriptions`
- voice mode STT: `/v1/audio/transcriptions`
- voice mode TTS: `/v1/audio/speech`

---

## Assistant teams

**Path:** `$PASEO_HOME/teams.json`

A team references at least two assistant presets. `leaderAssistantId` must be present in
`assistantIds`; the remaining assistants are available to the leader for delegation. Starting a
conversation with a team creates the root agent with the leader assistant and stamps
`paseo.team-id` / `paseo.team-role` labels. Subagents inherit the team identity. The leader may pass
an optional `assistantId` to `create_agent`; the daemon accepts only non-leader assistants from that
team, while omitting `assistantId` deliberately creates an unassigned subagent.

The persisted `assistants` array is a denormalized compatibility projection used by older team
clients. `assistantIds` and `leaderAssistantId` are the membership authority.

---

## 3. Schedule

**Path:** `$PASEO_HOME/schedules/{id}.json`

One file per schedule. ID is 8 hex characters.

| Field       | Type                                  | Description                      |
| ----------- | ------------------------------------- | -------------------------------- |
| `id`        | `string`                              | 8-char hex ID                    |
| `name`      | `string?`                             | Human-readable name              |
| `prompt`    | `string`                              | The prompt to send               |
| `cadence`   | `ScheduleCadence`                     | Timing (see below)               |
| `target`    | `ScheduleTarget`                      | What to run (see below)          |
| `status`    | `"active" \| "paused" \| "completed"` | Current state                    |
| `createdAt` | `string` (ISO 8601)                   |                                  |
| `updatedAt` | `string` (ISO 8601)                   |                                  |
| `nextRunAt` | `string?` (ISO 8601)                  | Next scheduled execution         |
| `lastRunAt` | `string?` (ISO 8601)                  | Last execution time              |
| `pausedAt`  | `string?` (ISO 8601)                  | When paused                      |
| `expiresAt` | `string?` (ISO 8601)                  | Auto-expire time                 |
| `maxRuns`   | `number?`                             | Max executions before completing |
| `runs`      | `ScheduleRun[]`                       | Execution history                |

### Nested: ScheduleCadence (discriminated union on `type`)

- `{ type: "cron", expression: string, timezone?: string }` — canonical cadence for new writes; absent `timezone` means UTC
- `{ type: "every", everyMs: number }` — legacy rolling interval, still readable and executable during the compatibility window

### Nested: ScheduleTarget (discriminated union on `type`)

- `{ type: "agent", agentId: string }` — send to existing agent
- `{ type: "new-agent", config: { provider, cwd, modeId?, model?, thinkingOptionId?, title?, providerOptions?, featureValues?, systemPrompt?, mcpServers? } }` — create a new agent

### Nested: ScheduleRun

| Field          | Type                                   | Description             |
| -------------- | -------------------------------------- | ----------------------- |
| `id`           | `string`                               | Run ID                  |
| `scheduledFor` | `string` (ISO 8601)                    | Intended execution time |
| `startedAt`    | `string` (ISO 8601)                    |                         |
| `endedAt`      | `string?` (ISO 8601)                   |                         |
| `status`       | `"running" \| "succeeded" \| "failed"` |                         |
| `agentId`      | `string?` (UUID)                       | Agent used for this run |
| `output`       | `string?`                              | Agent output text       |
| `error`        | `string?`                              | Error message if failed |

---

## 4. Project Registry

**Path:** `$PASEO_HOME/projects/projects.json`

Array of project records.

| Field                | Type                        | Description                                                                                                                                |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `projectId`          | `string`                    | Host-local primary key; new records use opaque `prj_<16 hex>` IDs                                                                          |
| `projectKey`         | `string \| null`            | Persisted opaque cross-host grouping key; reconciliation backfills absent values                                                           |
| `rootPath`           | `string \| null`            | Exact lexically normalized selected root; null for a blank Project that is not yet attached to a directory                                 |
| `kind`               | `"git" \| "non_git"`        | Mutable Git observation about `rootPath`, never a membership key                                                                           |
| `displayName`        | `string`                    | Stable default name; selected-root basename for directory-backed Projects and the entered name for blank Projects                          |
| `customName`         | `string \| null`            | User-set override layered over `displayName`. Null means "use the derived name".                                                           |
| `customIconRevision` | `string \| null`            | Identifies the host-local custom icon stored under `projects/icons/`. Null uses directory discovery when a root exists, otherwise no icon. |
| `createdAt`          | `string` (ISO 8601)         |                                                                                                                                            |
| `updatedAt`          | `string` (ISO 8601)         |                                                                                                                                            |
| `archivedAt`         | `string \| null` (ISO 8601) | Soft-delete timestamp; required nullable                                                                                                   |

Uploading a file and pasting a website or image URL are two ways of _acquiring_ the same custom
icon. The client fetches URL imports and sends their bytes through the upload RPC. The daemon never
receives or fetches the URL; it validates the uploaded bytes, stores them, and records a new
`customIconRevision`. Going back to automatic deletes the stored image, as does removing the
project.

Active exact roots are idempotent using lexical platform-equivalence semantics. Existing legacy
remote-shaped and path-shaped IDs remain readable, including duplicate roots; reconciliation never
merges them, transfers names, archives them, or moves workspace foreign keys. An explicit
workspace `projectId` is authoritative when it names an active project, regardless of cwd
containment. Archived-only exact-root records are not resurrected by explicit add/open; a fresh
opaque project is allocated instead. Agent restore is separate and restores the agent's existing
workspace together with its owning project.

---

## 5. Workspace Registry

**Path:** `$PASEO_HOME/projects/workspaces.json`

Array of workspace records. A workspace is a specific working directory within a project.

| Field                          | Type                                            | Description                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceId`                  | `string`                                        | Opaque stable identifier (`wks_<hex>`), generated independently of the directory. MUST NOT be treated as a path; compare by exact equality. Use the `cwd` field for directory access.         |
| `projectId`                    | `string`                                        | FK to Project.projectId; the workspace's stable project membership                                                                                                                            |
| `cwd`                          | `string`                                        | Exact execution directory selected for agents, files, scripts, and setup                                                                                                                      |
| `kind`                         | `"local_checkout" \| "worktree" \| "directory"` | Mutable checkout classification                                                                                                                                                               |
| `displayName`                  | `string`                                        | The human name (the generated/derived title). Decoupled from `branch` by construction.                                                                                                        |
| `title`                        | `string \| null`                                | User-set name override layered over `displayName`. Null means "use `displayName`".                                                                                                            |
| `branch`                       | `string \| null`                                | The current Git branch for git-backed workspaces. Separate from `displayName`/`title`; a background branch refresh never rewrites the name.                                                   |
| `worktreeRoot`                 | `string \| null`                                | Backing checkout/worktree root. May differ from `cwd` for exact subprojects and remains persisted after the worktree is deleted so restore can reproduce the placement.                       |
| `baseBranch`                   | `string \| null`                                | Normalized branch the Paseo worktree was created from; null for directories, local checkouts, and checkout-branch worktrees                                                                   |
| `isPaseoOwnedWorktree`         | `boolean`                                       | Whether Paseo owns and may remove/recreate the backing `worktreeRoot`                                                                                                                         |
| `mainRepoRoot`                 | `string \| null`                                | Main repository root for worktree checkouts, independent of both exact `cwd` and backing `worktreeRoot`                                                                                       |
| `createdAt`                    | `string` (ISO 8601)                             |                                                                                                                                                                                               |
| `updatedAt`                    | `string` (ISO 8601)                             |                                                                                                                                                                                               |
| `archivedAt`                   | `string \| null` (ISO 8601)                     | Soft-delete; required nullable                                                                                                                                                                |
| `autoArchivedChangeRequestUrl` | `string \| null`                                | Change request whose merged state triggered auto-archive. Restore replaces it with the current merged change request, when present, so repeated snapshots cannot archive the workspace again. |
| `pinnedAt`                     | `string \| null` (ISO 8601)                     | Pinned-to-top-of-sidebar timestamp; null means "not pinned"                                                                                                                                   |

> **Opaque-ID invariant:** `workspaceId` is opaque identity, never a filesystem path. Filesystem and git operations take `cwd`/`workspaceDirectory` only — never the id. A compatibility-only first-materialization bootstrap still groups pre-registry agent records by path and Git remote so existing installs retain their legacy records. That grouping never runs against a live registry, and its keys are not runtime project or workspace identity.

`projectId` is still a real FK: workspace records should have a matching project record. Read-only
history surfaces tolerate transient orphaned workspaces by omitting those rows so one bad FK cannot
blank the whole History screen, but mutation paths should repair or remove the orphaned state rather
than treating it as valid.

---

## 6. Push Token Store

**Path:** `$PASEO_HOME/push-tokens.json`

```json
{
  "tokens": ["ExponentPushToken[...]", ...]
}
```

Simple set of Expo push notification tokens. Loaded with permissive parsing (filters non-string entries). Persisted with atomic temp-file rename.

---

## 7. Daemon meta files

These small files are not validated as full Zod schemas but are persisted under `$PASEO_HOME` for daemon identity and runtime coordination.

| Path                  | Format                                                         | Notes                                                                             |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `server-id`           | Plain text, e.g. `srv_<base64url>`                             | Stable per-`$PASEO_HOME` daemon ID. Overridable via `PASEO_SERVER_ID` env.        |
| `daemon-keypair.json` | `{ v: 2, publicKeyB64, secretKeyB64 }` (libsodium box keypair) | E2EE relay identity. Written with mode `0600`. Regenerated if file is unreadable. |
| `paseo.pid`           | JSON `{ pid, startedAt, ... }`                                 | PID lock; prevents two daemons sharing one `$PASEO_HOME`.                         |
| `daemon.log`          | Pino log output                                                | Default location; path/rotation configurable via `log.file` in `config.json`.     |

---

## Client-side stores (App)

These live in React Native `AsyncStorage` or browser `IndexedDB`, not on the daemon filesystem.

### Keying convention: directory-backed vs workspace-owned

Right-sidebar client state splits on whether it is determined by the directory or owned by the workspace (two workspaces can share one `cwd`). The split is enforced by the cache key, so changing a key changes the sharing semantics — see [architecture.md](architecture.md#right-sidebar-boundary-directory-backed-vs-workspace-owned) for the full table.

- **Directory-backed** (shared by same-`cwd` workspaces): keyed by `(serverId, cwd)`. Git status/diff, GitHub PR status, PR timeline, file preview content. These are TanStack Query caches, not persisted stores.
- **Workspace-owned** (independent per workspace): keyed by `workspaceId`, with `cwd` used only as a fallback when no `workspaceId` is present. Review draft comments (`@paseo:review-draft-store`), diff-mode overrides (in-memory), workspace composer attachments, and file-explorer nav/expand state. The `workspaceId` part of these keys is **opaque** — never parse it back into a path.

### Draft Store

**AsyncStorage key:** `paseo-drafts` (version 2)

```typescript
{
  drafts: Record<draftKey, {
    input: { text: string, images: AttachmentMetadata[] },
    lifecycle: "active" | "abandoned" | "sent",
    updatedAt: number,     // epoch ms
    version: number        // optimistic concurrency
  }>,
  createModalDraft: DraftRecord | null
}
```

### Attachment Store (Web)

**IndexedDB database:** `paseo-attachment-bytes`, object store: `attachments`

Stores binary attachment blobs keyed by attachment ID.

### AttachmentMetadata

| Field         | Type      | Description                    |
| ------------- | --------- | ------------------------------ |
| `id`          | `string`  | Unique attachment ID           |
| `mimeType`    | `string`  | MIME type                      |
| `storageType` | `string`  | Storage backend identifier     |
| `storageKey`  | `string`  | Key within the storage backend |
| `createdAt`   | `number`  | Epoch ms                       |
| `fileName`    | `string?` | Original filename              |
| `byteSize`    | `number?` | Size in bytes                  |
