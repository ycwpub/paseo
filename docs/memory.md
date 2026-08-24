# Memory

Paseo memory is daemon-local, user-controlled context for normal Agent conversations. Enable it
from the selected host's **Memory** settings page.

## Storage

Each memory level owns its overview and detail files:

- Global: `$PASEO_HOME/memory/users/{userId}/summary.md` and `details/`.
- Project: `$PASEO_HOME/projects/{projectId}/memory/summary.md` and `details/`.
- Assistant: `$PASEO_HOME/assistants/{assistantId}/memory/learned/summary.md` and `details/`.

`$PASEO_HOME/memory/catalog.json` stores shared settings and logical-memory metadata.
`agent-indexes/{agentId}.md` is a generated runtime index containing only visible overview paths.
`content.key` exists only when encrypted storage has been used. Project and Assistant
detail content is not stored under the global memory directory.

Existing detail files under `$PASEO_HOME/memory/details/` move to their scoped directories when the
store loads. Legacy Workspace details automatically move to their owning Project directory when the
Workspace-to-Project mapping is available. Unresolved legacy files remain intact for recovery.

The summary and detail files can be encrypted with a daemon-local AES-256-GCM key. Encryption
protects copied files and casual disk inspection. It does not protect against a process or user
that can read both the memory directory and its key.

Export produces plaintext JSON so it can be inspected and moved. Treat exports as sensitive.

## Multi-host sync

Open the selected Host's **Memory** settings and use **Multi-host memory sync** to select another
online Host. Before running synchronization, select exactly one memory range:

- **Global memory** synchronizes the current global-memory user's overview, details, and Global
  policy.
- **Project memory** synchronizes the selected Project's details and Project policy.
- **Assistant memory** synchronizes the selected Assistant's details and Assistant policy.

There is no user-facing "sync everything" option. Paseo supports three operations for the selected
range:

- **Sync to host** merges the selected range from the current Host into the selected Host.
- **Sync from host** merges the selected range from the selected Host into the current Host.
- **Two-way sync** captures both Hosts' snapshots first, then merges each snapshot into the other
  Host. Capturing both snapshots before either write prevents freshly imported data from being
  echoed back during the same operation.

Synchronization includes only the selected range's detail projections and applicable policy.
Global synchronization additionally includes the selected user's editable overview. Project and
Assistant synchronization does not copy unrelated global users or overviews. Synchronization
intentionally does not copy Host-local settings, encryption keys, recent usage history, or which
global-memory user is active. The destination encrypts imported content with its own at-rest
setting and key.

The scoped-sync RPC requires a Global, Project, or Assistant selection in current clients. For
compatibility only, an older client that omits the selection still receives the legacy full-memory
snapshot; the current Paseo UI never uses that path.

Each detail carries a stable source Host and source memory ID. Repeating the same synchronization is
idempotent instead of creating another copy. When the same detail changed on both Hosts, the newest
`updatedAt` version wins; equal timestamps use a deterministic tie-break so both Hosts converge.
Evidence, keywords, provenance, revision links, and feedback counters are merged without repeatedly
inflating counts.

Global users are matched by ID and then by normalized name. Project and Assistant scope
IDs are preserved, so the corresponding entity should use the same ID on both Hosts for scoped
memory to become visible there. Sync uses the Hosts' existing Paseo connections and transfers
plaintext memory inside that connection; treat direct non-TLS network connections accordingly.

## Scope

A logical memory can belong to several scopes. Each scope receives a detail-file projection, while
the catalog keeps one logical ID so edits, deletion, feedback, synchronization, and deduplication
remain consistent.

- **Global** applies to the currently selected memory user and is isolated from other users.
- **Project** applies to Agents whose Workspace belongs to that Project.
- **Assistant** applies to Agents created from that Assistant.

Project is the finest memory scope. A conversation's Workspace is used only to resolve its owning
Project; it does not own separate memory. Project memory is projected to the Assistant used by the
conversation. Reusable preferences and knowledge about CLIs, Skills, plugins, code repositories,
tools, and terminology are projected to Global memory.

Each level overview indexes only the detail projections stored at that level. Hierarchical
promotion creates the required Project, Assistant, or Global projection; overviews do not link to
unrelated lower-level scopes.

An Agent's total memory document lists only overview paths for the active global user and the
current Agent's matching narrower scopes. It never exposes a different global-memory user, Project,
or Assistant. Explicit user memory takes precedence over later automatic extraction on
the same topic.

The Memory settings page can create, rename, delete, and switch global-memory users. Switching the
user changes which global summary, global details, and global extraction policy the daemon uses.
Project and Assistant memory remains shared and continues to be selected by Agent
context. Existing single-user installations migrate their global memory to **默认用户**.

The extractor chooses a semantic scope. The framework applies the hierarchy above. Manual memory
creation and editing can select several scopes explicitly.

The global Memory switch is the master control. Global, Project, and Assistant scopes
each have their own policy. A policy can disable that scope and define what durable information
belongs there. Disabling a scope removes it from the Agent's total memory document and automatic
learning without changing the other scopes.

Each conversation can also disable memory or define extraction guidance. Disabling conversation
memory removes readable memory paths from that Agent's total memory document and stops automatic
learning. Scope and conversation guidance is appended to the extractor's safety rules; it controls
what gets learned and is never injected into the visible Agent answer as an instruction.

## Agent-directed reading

Paseo does not prepend memory content to the user's message. Every non-internal Agent receives only
the absolute path of its stable total memory document through the provider's system-instruction
channel. Before each visible turn, Paseo refreshes that document for the active global-memory user
and the Agent's enabled Project, Assistant, and conversation scopes.

The Agent decides from the current user request whether memory could help. It reads the total
memory document only when useful, opens the relevant level overview, then follows that overview's
relative paths to the required detail documents. The total document contains no detail summaries or
bodies. Superseded, expired, disputed, disabled, and out-of-scope details are excluded from level
overviews.

Memory remains user-controlled, potentially stale context and never becomes a higher-priority
instruction. Merely exposing a file path is not counted as memory usage because Paseo cannot assume
that the Agent read it.

## Learning

After a successful visible turn, a hidden non-persisted Agent extracts durable preferences, facts,
procedures, project conventions, and confirmed decisions. Extraction is event-driven, bounded, and
runs after the answer, so it does not delay the visible turn. Internal Agents do not learn from
their own turns.

Automatic learning rejects:

- credentials and secrets;
- sensitive personal data under the configured privacy policy;
- low-confidence statements;
- temporary failures, logs, speculation, and one-off instructions;
- oversized detail content.

An explicit request such as “remember this” uses a lower confidence threshold. Sensitive memory is
still controlled by the configured policy.

Changed preferences, facts, decisions, and project knowledge create a new revision. The previous
revision remains available for audit with `superseded` status. User feedback can mark a detail
`expired` or `disputed`, which removes it from retrieval without deleting its history.

## Consolidation and retention

Consolidation applies validity dates and the configured retention window. Retention only expires
automatic memory; explicit user memory remains until the user changes or deletes it. A retention
value of `0` disables age-based expiry.

The daemon also organizes memory once per day. It only considers entries that have not changed for
at least 24 hours, keeps scopes isolated, merges exact duplicates, and removes unused automatic
entries with very low importance. Explicit user memory is never removed as low-value memory.
Organization covers Global, Project, and Assistant scopes and records its last successful
run separately so daemon restarts do not trigger repeated work.

Lightweight consolidation still runs after a bounded number of successful extractions. You can also
run it from Memory settings.

## Scope and conversation control

Open Host **Memory** settings to manage Global, Project, and Assistant policies in one
place. Project settings also expose the current Project policy. Use the brain button beside the
active Agent controls to configure the current conversation. Policies are daemon-local and stored
in `catalog.json`, not in a Project's `paseo.json`.

An unconfigured scope or conversation is enabled when the master Memory switch is on. Conversation
commands temporarily override its saved conversation switch for the rest of the Agent session.
Saving the conversation policy clears that temporary override. Scope policies do not override each
other: an Agent can use any enabled scope that matches its Global, Project, or Assistant
context.

## Per-Agent commands

Memory can be changed for one Agent without changing daemon settings:

```text
/memory on
/memory off
/memory read-only
/memory forget <topic>
/memory forget all
```

Chinese forms are also accepted:

```text
/记忆 开启
/记忆 关闭
/记忆 只读
/记忆 忘记 <主题>
/记忆 忘记 全部
```

These modes last for the Agent session. `read-only` keeps memory paths available but skips learning.

## Inspection and feedback

Memory settings support:

- manual explicit memory;
- scope, status, category, importance, validity, keywords, and content editing;
- active, superseded, expired, and disputed filters;
- source and usage counts;
- import, merge, replace, and export;
- retention, context budget, candidate count, privacy, encryption, and source-display controls.

Feedback can mark a memory helpful, not useful, outdated, or incorrect. Outdated and incorrect
feedback immediately removes the detail from future Agent total memory documents by changing its
status. Paseo does not infer that a memory was used merely because its path was available to the
Agent.

Memory is context, not authority. Agents should verify time-sensitive facts and follow the current
user request when it conflicts with memory.
