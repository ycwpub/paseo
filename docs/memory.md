# Memory

Paseo memory is daemon-local, user-controlled context for normal Agent conversations. Enable it
from the selected host's **Memory** settings page.

## Storage

Memory lives under `$PASEO_HOME/memory/`:

- `users/{userId}/summary.md` is that user's editable global-memory overview.
- `details/` contains one file per durable topic.
- `catalog.json` stores users, the selected user, scope, provenance, revisions, validity, usage, and
  feedback.
- `content.key` exists only when encrypted storage has been used.

The summary and detail files can be encrypted with a daemon-local AES-256-GCM key. Encryption
protects copied files and casual disk inspection. It does not protect against a process or user
that can read both the memory directory and its key.

Export produces plaintext JSON so it can be inspected and moved. Treat exports as sensitive.

## Scope

Every detail belongs to one scope:

- **Global** applies to the currently selected memory user and is isolated from other users.
- **Project** applies to Agents whose Workspace belongs to that Project.
- **Assistant** applies to Agents created from that Assistant.
- **Workspace** applies only to that Workspace.

Retrieval sees global memory plus the current Agent's matching narrower scopes. It never falls back
to a different global-memory user, Project, Assistant, or Workspace. Explicit user memory takes
precedence over later automatic extraction on the same topic.

The Memory settings page can create, rename, delete, and switch global-memory users. Switching the
user changes which global summary, global details, and global extraction policy the daemon uses.
Project, Assistant, and Workspace memory remains shared and continues to be selected by Agent
context. Existing single-user installations migrate their global memory to **默认用户**.

Preferences default to global scope. Project procedures, decisions, and project facts default to
the current Project when one exists. The extractor may choose a narrower available scope.

The global Memory switch is the master control. Global, Project, Assistant, and Workspace scopes
each have their own policy. A policy can disable that scope and define what durable information
belongs there. Disabling a scope removes it from retrieval and automatic learning without changing
the other scopes.

Each conversation can also disable memory or define extraction guidance. Disabling conversation
memory stops both retrieval and automatic learning for that Agent. Scope and conversation guidance
is appended to the extractor's safety rules; it controls what gets learned and is never injected
into the visible Agent answer as an instruction.

## Retrieval

Paseo combines weighted lexical matching, Chinese bigram matching, confidence, importance,
freshness, scope, origin, and user feedback. It diversifies the final set so near-duplicate topics
do not consume the context budget.

High-importance explicit global preferences are baseline context even when the current prompt does
not repeat their wording. Other details require a topical match. Superseded, expired, and disputed
details are excluded.

The context budget shrinks for long prompts. Paseo injects the editable summary prefix and the
selected detail content, never the entire memory directory. Memory is marked as potentially stale
context and never as a higher-priority instruction.

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

Automatic consolidation runs after a bounded number of successful extractions. You can also run it
from Memory settings.

## Scope and conversation control

Open Host **Memory** settings to manage Global, Project, Workspace, and Assistant policies in one
place. Project settings also expose the current Project policy. Use the brain button beside the
active Agent controls to configure the current conversation. Policies are daemon-local and stored
in `catalog.json`, not in a Project's `paseo.json`.

An unconfigured scope or conversation is enabled when the master Memory switch is on. Conversation
commands temporarily override its saved conversation switch for the rest of the Agent session.
Saving the conversation policy clears that temporary override. Scope policies do not override each
other: an Agent can use any enabled scope that matches its Global, Project, Workspace, or Assistant
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

These modes last for the Agent session. `read-only` retrieves memory but skips learning.

## Inspection and feedback

Memory settings support:

- manual explicit memory;
- scope, status, category, importance, validity, keywords, and content editing;
- active, superseded, expired, and disputed filters;
- source and usage counts;
- import, merge, replace, and export;
- retention, context budget, candidate count, privacy, encryption, and source-display controls.

When source display is enabled, a completed answer shows the memories it used. Feedback can mark a
memory helpful, not useful, outdated, or incorrect. Outdated and incorrect feedback immediately
removes the detail from future retrieval by changing its status.

Memory is context, not authority. Agents should verify time-sensitive facts and follow the current
user request when it conflicts with memory.
