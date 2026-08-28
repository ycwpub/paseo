# `feature_paseo` Development Standard

This document applies only when the current branch is `feature_paseo`. It is the source of truth for
the branch's feature inventory and for development or rebasing work performed on the branch.

## Non-negotiable rules

1. Preserve every feature in the inventory below. A rebase, merge, refactor, conflict resolution, or
   upstream adaptation must not silently remove, hide, disconnect, or regress any inventory item.
2. Update the inventory in the same commit whenever a feature is added, removed, renamed, split,
   merged, or changes its entry points.
3. Put new UI, state, hooks, services, types, and tests in feature-owned files whenever practical.
4. Limit shared-file changes to the smallest wiring, registration, export, routing, capability, or
   integration changes required. Extract substantial logic into a feature-owned module first.
5. Do not duplicate existing abstractions or weaken the architecture solely to avoid a shared-file
   change.
6. Never treat a clean Git index, a successful rebase, typecheck, or lint result as proof that branch
   features were preserved. Feature preservation requires the inventory audit described below.

## Feature inventory

Keep this table current during daily development. “Critical integration points” records shared
surfaces whose loss can leave implementation files present but make a feature unreachable.

| Feature area                       | Required behavior                                                                                                                                                                           | Critical integration points                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow runtime and editor        | Reusable Workflow protocol, execution, variables, loops, node results, graph editing, run inspection, and lifecycle controls remain available.                                              | Protocol exports, server bootstrap/session registration, app routes, settings/navigation entries.                                                                                                               |
| Plugin platform                    | Plugin discovery, installation, runtime surfaces, sidebar items, command-center contributions, attachments, themes, timeline items, and Project-linked plugins remain reachable.            | Plugin registry/exports, app root providers, sidebar wiring, route registration, server bootstrap.                                                                                                              |
| Workflow HTTP service              | Workflow-backed asynchronous HTTP listeners, routes, request/response templates, custom handlers, task inspection, cleanup, and Project overrides remain available.                         | Plugin package, HTTP management protocol exports, server plugin manager, app plugin surface.                                                                                                                    |
| Agent web app                      | Declarative Agent web app plugin interfaces and runtime integration remain available.                                                                                                       | Plugin registry, app surface routing, server plugin transport.                                                                                                                                                  |
| Memory                             | Global, Project, daily/task, scoped memory, import/export, user selection, and memory management remain available.                                                                          | Settings routes, host/Project settings entries, server configuration and session context.                                                                                                                       |
| Managed Projects                   | Project creation, hierarchy, directories, variables, knowledge, Lark context, icons, plugin links, indexing, and Project-owned storage remain available.                                    | Project settings route, settings navigation, sidebar Project projection, protocol/session handlers.                                                                                                             |
| Agent behavior                     | Chat continuity, active-turn handling, context compaction queueing, response review, timestamps, fork/handoff behavior, task notifications, and auto-archive remain available.              | Agent manager/provider adapters, timeline projection, composer, agent stream and panel wiring.                                                                                                                  |
| Aiden Claude and Codex integration | Provider-specific reasoning/commentary handling, translation settings, notification routing, resume behavior, and model/provider configuration remain available.                            | Provider adapters, settings storage/UI, stream rendering, desktop notifications.                                                                                                                                |
| Native desktop integration         | macOS Dynamic Island, desktop identity, daemon connectivity, pairing, packaged runtime, platform-specific startup behavior, and bidirectional supervisor/worker heartbeat remain available. | Desktop main/preload, daemon manager, app host runtime, pairing screens and settings, `packages/server/scripts/supervisor.ts`, `packages/server/src/server/daemon-worker.ts`, and `supervision-parity.test.ts`. |
| Shared resources and collaboration | Assistants, MCP servers, skills, orchestration, collaboration, and reusable agent tooling remain available.                                                                                 | Protocol exports, server bootstrap, CLI registration, settings/navigation entries.                                                                                                                              |
| Byte development workflows         | Byte development and reconciliation workflows, handoff stages, plugin assets, and related skills remain available.                                                                          | Plugin manifests/workflows, skill materialization, Workflow runtime.                                                                                                                                            |
| Go client SDK                      | Go WebSocket client, agent creation/query/archive, message sending, stream subscription, approval handling, types, documentation, and examples remain available.                            | `packages/client-go`, protocol compatibility, exported message contracts.                                                                                                                                       |
| Simplified Chinese default UI      | New branch-owned user-facing copy defaults to Simplified Chinese and existing branch surfaces retain their Chinese labels.                                                                  | i18n resources, route titles, settings/sidebar labels, plugin documents.                                                                                                                                        |
| Branch navigation and settings     | Workflow, Plugin, Memory, Project, HTTP service, provider, pairing, and related feature pages remain reachable from their intended routes and menus.                                        | App root layout, left sidebar, settings screen, Project settings screen, host page.                                                                                                                             |

When adding a feature, add a row or expand the relevant row with:

- the user-visible behavior that must remain;
- its feature-owned implementation paths;
- every shared integration point needed to make it reachable;
- the targeted test or manual verification used after rebases.

## Daily development procedure

Before completing any feature change:

1. Confirm the current branch with `git branch --show-current`.
2. Review this inventory and identify the affected feature rows.
3. Prefer new feature-owned files. If a shared file must change, keep the change to minimal wiring and
   record the integration point in the inventory.
4. Add or update a targeted regression test that fails if the feature implementation remains present
   but its route, menu, export, registration, or capability wiring disappears.
5. Update this inventory in the same commit.
6. Run targeted tests, typecheck, lint, and formatting required by `CLAUDE.md`.

## Mandatory rebase procedure

### 1. Before rebasing

1. The worktree must be clean. Preserve unrelated local changes before starting.
2. Fetch the intended upstream and record its exact commit SHA. Do not use an ambiguous local
   `main`/`master` reference.
3. Create a permanent backup reference before rewriting history:

   ```bash
   git branch backup/feature-paseo-before-rebase-YYYYMMDD-HHMMSS
   ```

4. Record:
   - the pre-rebase feature tip;
   - the merge base;
   - the upstream target SHA;
   - the complete feature inventory;
   - files changed by both the feature branch and upstream.
5. Save a machine-readable pre-rebase baseline under `/tmp`, including:

   ```bash
   git diff --name-status <merge-base>..<feature-tip>
   git diff --stat <merge-base>..<feature-tip>
   git log --oneline <merge-base>..<feature-tip>
   ```

### 2. While resolving conflicts

1. Resolve each conflict semantically. Preserve both the upstream architecture and the branch
   behavior.
2. In a rebase, remember that `ours` commonly refers to the rebased upstream state and `theirs` to
   the feature commit being replayed. Never use `checkout --ours`, `checkout --theirs`, an `-Xours`
   strategy, or an `-Xtheirs` strategy across the branch without reviewing every affected feature.
3. For every conflicted shared file:
   - identify the inventory rows that depend on it;
   - inspect the pre-rebase file and patch;
   - preserve or deliberately adapt each branch integration point;
   - add the result to the post-rebase audit list.
4. Do not resolve conflicts by replacing an entire shared file with the upstream version.
5. Do not delete or skip a feature commit merely because its patch no longer applies cleanly.
6. If the correct semantic resolution is uncertain, abort the rebase and keep the backup intact.

### 3. After rebasing

The rebase is incomplete until all steps pass:

1. Compare the rebased branch against the backup using `git range-diff`, targeted file diffs, and the
   saved baseline. Investigate dropped commits, large deletion spikes, missing exports, deleted
   routes, and renamed integration points.
2. Audit every feature inventory row. Verify both implementation and reachability:
   - implementation files still exist;
   - protocol and package exports still exist;
   - server registration/bootstrap still occurs;
   - routes, navigation, sidebar, and settings entries are still connected;
   - provider and platform gates still expose the feature;
   - tests still exercise the public entry point.
3. Run the targeted regression tests for every conflicted feature area, then typecheck, lint, and
   formatting checks.
4. Record the audit result in the rebase completion commit or pull-request description. List every
   inventory row as `preserved`, `adapted`, or intentionally `removed` with explicit user approval.
5. Compare the final tree with the pre-rebase backup. Any unexplained deletion or unreachable feature
   blocks completion.
6. Keep the backup reference until the rebased branch has passed review and runtime smoke testing.

## Rebase completion gate

A rebase must not be reported as complete, committed as “conflicts resolved”, force-pushed, or used
for release when any inventory item is unchecked.

If even one feature is missing or cannot be verified:

- stop;
- do not force-push;
- restore or adapt the feature from the backup;
- rerun its targeted verification;
- report the rebase as incomplete.

Conflict count is not the success criterion. Preserving every branch feature is the success
criterion.
