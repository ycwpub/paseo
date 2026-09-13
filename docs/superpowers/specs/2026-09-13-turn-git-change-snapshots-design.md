# Turn Git Change Snapshots

## Problem

The completed-turn file card currently reconstructs changes from provider tool calls and the
repository's current diff. Providers may omit edit and shell events, a Project root may contain Git
repositories below `repos/`, and a completed task may commit or push before the App queries the
working tree. In each case the turn can have real file changes while the card renders nothing.

## Design

The daemon owns a provider-independent Git snapshot for each foreground turn.

Before starting the provider turn, it discovers Git repositories from the Agent cwd and configured
writable Project directories. A non-Git Project root also contributes direct child repositories
under `repos/`. For each repository, the daemon creates an immutable Git tree object representing
the complete visible working tree through a temporary index. This does not modify the repository's
real index, branch, or working tree.

When the turn completes, the daemon creates a second tree and compares it with the baseline tree.
The resulting repository roots and file statistics are attached to the final assistant timeline
item and to the live `turn_completed` event. The timeline copy makes the result survive reloads and
reconnects; the completion copy lets the current client render without waiting for a refetch.
Snapshot capture is best effort: a Git failure is logged and must not fail the Agent turn.

The wire additions are optional. A new App connected to an old daemon continues using the current
tool-call/current-diff inference. An old App connected to a new daemon ignores the optional fields.

## App behavior

The completed-turn card prefers the persisted snapshot. It groups files by repository and continues
to use the live uncommitted diff only to decide whether Undo is safe. If no snapshot exists, the App
uses the existing inference path.

The fix applies to new turns. Completed historical turns cannot be reconstructed reliably because
their starting working-tree state was never recorded.

## Verification

- A real temporary repository is changed and committed during a turn; the snapshot still contains
  the changed files after the working tree is clean.
- Multiple configured repositories produce separate groups.
- A live `turn_completed` event attaches the snapshot to the matching assistant item.
- A hydrated assistant timeline item preserves the persisted snapshot.
- The existing no-snapshot inference remains covered.
