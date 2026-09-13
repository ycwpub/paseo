# Turn Git Change Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the completed-turn file card accurate even when a provider omits mutation tool calls
or commits all changes before the App reads Git state.

**Architecture:** Capture immutable Git tree baselines around each daemon-managed foreground turn,
persist the resulting file summary on the final assistant timeline item, and send the same optional
snapshot on the live completion event. The App prefers the snapshot and falls back to its current
tool-call/current-diff inference for older daemons and history.

**Tech Stack:** TypeScript, Node Git subprocesses, Zod protocol schemas, React Native, Vitest

**Spec:** `docs/superpowers/specs/2026-09-13-turn-git-change-snapshots-design.md`

## Global Constraints

- Keep protocol changes backward-compatible by adding optional fields only.
- Do not depend on provider-specific Edit or Shell events.
- Do not modify the user's Git index, branch, or working tree.
- Snapshot failures must not fail the Agent turn.
- Run only focused tests, then `npm run typecheck`, `npm run lint`, and formatter checks.
- Update `docs/extension-development-standard.md` on `feature_paseo`.

---

### Task 1: Protocol snapshot contract

**Files:**

- Modify: `packages/protocol/src/agent-types.ts`
- Modify: `packages/protocol/src/messages.ts`
- Test: `packages/protocol/src/messages.stream-parsing.test.ts`

**Interfaces:**

- Produces: `AgentTurnChangesSnapshot`, optional `turnChanges` on assistant messages and completed
  turn events.

- [x] Write a parsing test for an assistant timeline item and `turn_completed` event containing two
      repository snapshots.
- [x] Run the test and verify it fails because `turnChanges` is stripped.
- [x] Add the optional schemas and exported types with a dated `COMPAT(turnGitChanges)` marker.
- [x] Regenerate validation and verify the focused protocol test passes.

### Task 2: Git tree snapshot engine

**Files:**

- Create: `packages/server/src/server/agent/turn-git-change-snapshot.ts`
- Create: `packages/server/src/server/agent/turn-git-change-snapshot.posix.test.ts`

**Interfaces:**

- Produces:
  `captureTurnGitBaseline({ cwd, writableProjectDirectories })` and
  `captureTurnGitChanges(baseline)`.

- [x] Write a real-filesystem test where a clean repository changes three files and commits them
      before final capture.
- [x] Run the test and verify the snapshot API is missing.
- [x] Implement repository discovery and temporary-index tree capture.
- [x] Run the test and verify the committed files and statistics are retained.
- [x] Add and pass a multi-repository grouping test.

### Task 3: Agent lifecycle persistence

**Files:**

- Modify: `packages/server/src/server/agent/agent-manager.ts`
- Modify: `packages/server/src/server/agent/agent-timeline-store.ts`
- Modify: `packages/server/src/server/agent/timeline-projection.ts`
- Test: `packages/server/src/server/agent/turn-git-change-lifecycle.test.ts`
- Test: `packages/server/src/server/agent/timeline-projection.test.ts`

**Interfaces:**

- Consumes: Task 1 snapshot types and Task 2 capture functions.
- Produces: persisted assistant `turnChanges` and enriched live `turn_completed`.

- [x] Write a lifecycle test proving a completion snapshot is persisted and broadcast without
      provider edit or shell events.
- [x] Run it and verify the snapshot is absent.
- [x] Capture before `startTurn`, finalize before terminal dispatch, update the final assistant row,
      and persist the row update.
- [x] Preserve `turnChanges` while projected assistant chunks merge.
- [x] Run focused lifecycle and projection tests.

### Task 4: App snapshot rendering and compatibility fallback

**Files:**

- Modify: `packages/app/src/types/stream.ts`
- Modify: `packages/app/src/agent-stream/turn-changes.tsx`
- Modify: `packages/app/src/agent-stream/turn-changes-model.ts`
- Modify: `packages/app/src/agent-stream/turn-footer.tsx`
- Modify: `packages/app/src/agent-stream/view.tsx`
- Test: `packages/app/src/types/stream.test.ts`
- Test: `packages/app/src/agent-stream/turn-changes-model.test.ts`

**Interfaces:**

- Consumes: optional `AgentTurnChangesSnapshot`.
- Produces: repository-grouped cards from snapshots, with the old inference path unchanged when the
  snapshot is absent.

- [x] Write a reducer test proving live completion attaches the snapshot to the matching assistant.
- [x] Write a model test converting persisted snapshot files to card rows.
- [x] Run both tests and verify the expected failures.
- [x] Carry snapshots through live and hydrated stream reduction.
- [x] Prefer snapshot repositories/files in the card and retain current uncommitted queries for
      Undo safety.
- [x] Run the focused App tests.

### Task 5: Documentation and verification

**Files:**

- Modify: `docs/extension-development-standard.md`

- [x] Add the turn Git snapshot integration point to the feature inventory.
- [x] Run formatter on changed files.
- [x] Run all directly changed focused tests.
- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Inspect `git diff --check` and the final diff.
