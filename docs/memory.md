# Memory

Paseo memory is daemon-local, user-controlled context shared by normal Agent conversations.
Enable it from the selected host's **Memory** settings page.

## Layers

Paseo keeps a small summary in `$PASEO_HOME/memory/summary.md` and topic details under
`$PASEO_HOME/memory/details/`. Every turn receives the bounded summary. Lexically relevant detail
files are added only when the current prompt matches their title, keywords, or content.

Assistant memory stays scoped to one Assistant. Project knowledge stays scoped to one Project.
Global memory is applied first; narrower Assistant and Project context may add more specific
instructions.

## Learning

After a successful visible turn, a hidden non-persisted Agent extracts durable preferences, facts,
procedures, project conventions, and confirmed decisions. Extraction runs after the answer and
does not delay it. The extractor consolidates matching topics instead of appending every turn.

Paseo excludes credentials, tokens, secrets, sensitive inferred attributes, hidden reasoning, raw
logs, temporary failures, speculation, and one-off requests. Internal Agents never learn from
their own turns.

## Control

Disabling memory stops retrieval and extraction without deleting files. Disable automatic learning
to keep retrieval while editing memory manually. The settings page lets you inspect and edit the
summary and detail files, delete one detail, or clear all stored memory.

Memory is context, not authority. Agents are told that it may be stale and must not treat it as a
higher-priority instruction.
