# `feature_paseo` Development Standard

This document applies only when the current branch is `feature_paseo`. It is the source of truth for
the branch's feature inventory and for development or rebasing work performed on the branch.

The detailed pre-rebase inventory and the latest item-by-item restoration audit are maintained in
[`pre-rebase-feature-inventory.md`](./pre-rebase-feature-inventory.md).

Extension architecture and product documentation lives under
[`docs/product-extensions/`](./product-extensions/README.md); keep upstream-owned documents unchanged
unless integration cannot be expressed in an extension-owned document.

## Non-negotiable rules

1. Preserve every feature in the inventory below. A rebase, merge, refactor, conflict resolution, or
   upstream adaptation must not silently remove, hide, disconnect, or regress any inventory item.
2. Update the inventory in the same commit whenever a feature is added, removed, renamed, split,
   merged, or changes its entry points.
3. Move most branch-specific business implementation, including UI, state, hooks, services, types,
   tests, and documentation, into new feature-owned files.
4. Shared upstream-owned files may contain only the stable, auditable minimum wiring required for
   imports, exports, routing, registration, capability exposure, or integration. Extract business
   logic into a feature-owned module before adding that wiring.
5. Do not use same-basename `.feature-paseo.ts` / `.feature-paseo.tsx` source overlays to make the
   modified-file count look smaller. An overlay still conflicts semantically with upstream and
   creates a parallel copy of main-owned code.
6. Drive the complete `feature_paseo` branch down to at most 100 conflict-bearing files that already
   existed at the fixed upstream baseline. Until the legacy debt reaches that target, no change may
   increase the frozen migration ceiling. Added feature-owned files do not consume this budget.
7. Do not duplicate existing abstractions or weaken the architecture solely to avoid a shared-file
   change.
8. Never treat a clean Git index, a successful rebase, typecheck, or lint result as proof that branch
   features were preserved. Feature preservation requires the inventory audit described below.

## Overlay removal policy

The branch previously introduced broad same-basename source overlays to avoid recording changes to
main-owned files. That optimizes the metric rather than the rebase outcome: upstream edits still
conflict with the copied implementation, while normal merge tooling can no longer show a small,
auditable integration diff.

All new and migrated work must follow these three rules:

1. Continue extracting business logic from large modified files into newly added feature-owned
   modules.
2. Keep the original main-owned file limited to small, stable imports, registration, routing, and
   adapter wiring.
3. Never introduce or expand broad overlays merely to satisfy a file-count target; do not maintain a
   second copy of a main subsystem.
4. Name new files and directories after their responsibility, domain, or product role. Do not put
   the branch identifier (`feature-paseo` or `feature_paseo`) in a path.

The overlay count must remain zero. `scripts/check-source-overlays.mjs` rejects same-basename
`.feature-paseo.*` source, test, configuration, and helper replacements, as well as any restored
Metro/Vite/TypeScript resolver machinery or override manifests. Feature-owned modules must have
distinct responsibilities and names; they may not shadow a main-owned file.

The 100-file limit remains a ceiling, but it must be met by extracting cohesive feature modules and
removing obsolete shared-file edits—not by hiding modified implementations behind resolver
overrides.

## Upstream-owned file budget

The branch target is at most 100 conflict-bearing paths that already existed at the fixed upstream
baseline `463415ae846cbcfef0df691e413a1a73a9213757`.

The overlay migration exposed 264 legacy conflict-bearing paths. During migration, the checker
uses 264 as a hard non-growth ceiling while continuing to report the 100-file target. This temporary
ceiling must only move downward. It must never be raised to make a change pass, and it must be
removed once the branch reaches the 100-file target.

- Put most business implementation, state, tests, and documentation for a branch feature in new
  feature-owned files.
- Keep upstream-owned files as stable, auditable thin imports, exports, route entries,
  registrations, or adapters. They must not become a second home for branch business logic.
- Move an existing block into a new module before extending it when the block belongs to a
  `feature_paseo` capability.
- Put branch-owned regression cases in a sibling
  `*.capability-regressions.test.*` / `*.capability-regressions.spec.*` file. Keep an existing main
  test file unchanged when the main assertions still describe supported compatibility behavior.
  Tests that intentionally replace obsolete main behavior may remain in the original file after
  explicit review; do not weaken production types or keep duplicate suites solely to reduce the
  file count.
- Do not split behavior into several commits to bypass the limit: all commits and uncommitted
  changes are measured together against the fixed upstream tree.
- Do not copy an upstream subsystem into a parallel implementation. Use the main-owned foundations
  and extension boundaries documented below.

The pre-commit hook compares the staged branch result with the fixed upstream tree. Run the
worktree-wide check directly while developing:

```bash
node scripts/check-upstream-file-budget.mjs
```

When the branch is deliberately rebased onto a newer upstream, update the fixed SHA in
`scripts/upstream-file-budget.mjs` and this document in the same audited change. A temporary
baseline can also be supplied explicitly:

```bash
node scripts/check-upstream-file-budget.mjs \
  --upstream <upstream-sha>
```

## Feature inventory

Keep this table current during daily development. “Critical integration points” records shared
surfaces whose loss can leave implementation files present but make a feature unreachable.

| Feature area                       | Required behavior                                                                                                                                                                                                                                                              | Critical integration points                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow runtime and editor        | Reusable Workflow protocol, execution, variables, loops, node results, graph editing, run inspection, and lifecycle controls remain available.                                                                                                                                 | Protocol exports, server bootstrap/session registration, app routes, settings/navigation entries.                                                                                                               |
| Plugin platform                    | Plugin discovery, installation, runtime surfaces, sidebar items, command-center contributions, attachments, themes, timeline items, and Project-linked plugins remain reachable.                                                                                               | Plugin registry/exports, app root providers, sidebar wiring, route registration, server bootstrap.                                                                                                              |
| Workflow HTTP service              | Workflow-backed asynchronous HTTP listeners, routes, request/response templates, custom handlers, task inspection, cleanup, and Project overrides remain available.                                                                                                            | Plugin package, HTTP management protocol exports, server plugin manager, app plugin surface.                                                                                                                    |
| Agent web app                      | Declarative Agent web app plugin interfaces and runtime integration remain available.                                                                                                                                                                                          | Plugin registry, app surface routing, server plugin transport.                                                                                                                                                  |
| Memory                             | Global, Project, daily/task, scoped memory, import/export, user selection, and memory management remain available.                                                                                                                                                             | Settings routes, host/Project settings entries, server configuration and session context.                                                                                                                       |
| Managed Projects                   | Project creation, hierarchy, directories, variables, Project knowledge and memory second-level settings entries, user OAuth-backed Lark group context, icons, plugin links, indexing, and Project-owned storage remain available.                                              | Project settings, knowledge, memory, and Lark context routes; settings navigation; sidebar Project projection; Lark OAuth RPC/token store; protocol/session handlers.                                           |
| Agent behavior                     | Chat continuity, cache-first history restore for open tabs, active-turn handling, context compaction queueing, response review, timestamps, fork/handoff behavior, task notifications, task summaries, multi-repository change review/undo, and auto-archive remain available. | Agent manager/provider adapters, timeline projection and replica cache, composer, `agent-stream/view.tsx`, `agent-stream/turn-footer.tsx`, task-summary panels, and workspace layout/panel registration.        |
| Aiden Claude and Codex integration | Provider-specific reasoning/commentary handling, translation settings, notification routing, resume behavior, and model/provider configuration remain available.                                                                                                               | Provider adapters, settings storage/UI, stream rendering, desktop notifications.                                                                                                                                |
| Native desktop integration         | macOS Dynamic Island, desktop identity, daemon connectivity, pairing, packaged runtime, platform-specific startup behavior, and bidirectional supervisor/worker heartbeat remain available.                                                                                    | Desktop main/preload, daemon manager, app host runtime, pairing screens and settings, `packages/server/scripts/supervisor.ts`, `packages/server/src/server/daemon-worker.ts`, and `supervision-parity.test.ts`. |
| Shared resources and collaboration | Assistants, MCP servers, skills, orchestration, collaboration, reusable agent tooling, and configurable ten-item pagination for Skill/MCP management remain available.                                                                                                         | Protocol exports, server bootstrap, CLI registration, settings/navigation entries.                                                                                                                              |
| Byte development workflows         | Byte development and reconciliation workflows, handoff stages, plugin assets, and related skills remain available.                                                                                                                                                             | Plugin manifests/workflows, skill materialization, Workflow runtime.                                                                                                                                            |
| Go client SDK                      | Go WebSocket client, agent creation/query/archive, message sending, stream subscription, approval handling, types, documentation, and examples remain available.                                                                                                               | `packages/client-go`, protocol compatibility, exported message contracts.                                                                                                                                       |
| Simplified Chinese default UI      | New branch-owned user-facing copy defaults to Simplified Chinese and existing branch surfaces retain their Chinese labels.                                                                                                                                                     | i18n resources, route titles, settings/sidebar labels, plugin documents.                                                                                                                                        |
| Branch navigation and settings     | Workflow, Plugin, Memory, Project, HTTP service, provider, pairing, and related feature pages remain reachable from their intended routes and menus. Explorer must retain File, Changes, Task Summary, and Pull Request entries.                                               | App root layout, left sidebar, settings screen, Project settings screen, host page, workspace panel manifest/registration, launcher catalog, and persisted Explorer layout migration.                           |

## Unified plugin architecture

`feature_paseo` must extend the plugin architecture from `main`; it must not maintain a second,
parallel plugin lifecycle.

1. `packages/server/src/server/plugins/` is the authoritative plugin lifecycle:
   installation source, enable/disable, isolated runtime process, reload, logs, removal, and runtime
   contributions all use the main-branch implementation.
2. Skills, MCP servers, declarative apps, Workflow HTTP services, and plugin-project bindings are
   resource capabilities of the same plugin ID. They are composed by
   `UnifiedPluginService`, not exposed as a second plugin product.
3. `paseo-plugin.json` is the preferred unified manifest. Runtime-only manifests may contain only
   `id`; unified packages may additionally declare metadata and resource paths. Existing
   `.codex-plugin/plugin.json` packages remain readable for compatibility.
4. Preserve the main-branch client API boundary:
   - `DaemonClient.listPlugins()` returns the runtime plugin list used by the upstream diagnostics
     page.
   - `DaemonClient.listUnifiedPlugins()` returns the branch-owned unified runtime and resource
     catalog through `plugin.list.request`.
   - Product UI must not render two user-facing plugin catalogs; the runtime-only API remains a
     compatibility and diagnostics surface.
5. One plugin ID has one visible row and one user-facing enable/uninstall lifecycle. Runtime status,
   source, logs, and declarative resources are displayed on that row.
6. New plugin capabilities must be added to the unified manifest, summary, service, and page instead
   of adding a new top-level plugin service, store, list RPC, or settings section.

## Main-owned foundations and feature-owned extensions

The branch must keep one owner for each shared concept:

| Area                | Main-owned foundation                                                                | Feature-owned extension                                                                       |
| ------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Plugins             | installation, enable/disable, process lifecycle, updates, logs, contribution runtime | unified resource catalog, Project binding, declarative apps, Workflow HTTP services           |
| Skills              | bundled orchestration Skill selection, distribution, update, and migration           | user/plugin Skill catalog, scanning, editing, Agent selection, multi-host sync                |
| Projects            | registry, CRUD, identity, Workspace placement, CLI                                   | hierarchy, multi-directory context, knowledge, memory, Lark context, plugin project binding   |
| Explorer            | pane/tab layout, Files, Changes, pull request surfaces                               | task summary, review/undo affordances, historical-input navigation                            |
| Connections         | direct, Relay, pairing, SSH, daemon/client transport state                           | approval history, client identity, local Relay management and connection presentation         |
| Agent configuration | Agent Profile stores reusable provider/model/runtime parameters                      | Assistant stores prompt, knowledge, memory, MCP, and Skill identity; Team composes Assistants |

Do not create a second lifecycle, registry, settings entry, or connection state machine for an
extension. Add adapters and contribution points to the foundation instead.

The daemon starts its WebSocket server paused, permits only internal plugin sessions while the
plugin catalog settles, and opens normal Direct/Relay/Hub clients afterward. `DirectorySyncService`,
Workspace Labels, and orchestration Skills are daemon-scoped services and must be injected into
every Session rather than recreated or omitted during bootstrap conflict resolution.

Local Workflow and Hub Workflow are intentionally distinct:

- **Local Workflow** uses the Workflow v1 protocol, local visual editor, local runtime, HTTP service
  integration, and `$PASEO_HOME/workflows`.
- **Hub Workflow** uses the Hub project/deployment flow and `.paseo/workflows`.

The app label must say **本地工作流 / Local workflows** wherever the local editor is opened.

## Conflict-minimizing extension boundaries

Feature work should use these boundaries before modifying an upstream-owned implementation file:

- Client resource RPC implementations belong in
  `packages/client/src/daemon-resource-rpc-client.ts`; `daemon-client.ts` should expose only thin,
  intentionally named forwarding methods.
- Plugin catalog composition belongs in
  `packages/server/src/server/plugins/unified-plugin-service.ts`; the upstream runtime under
  `packages/server/src/server/plugins/` remains the lifecycle authority.
- Plugin CLI behavior belongs in `packages/cli/src/commands/plugin/unified-catalog.ts`; the upstream
  command file should contain command registration and thin delegation only.
- Feature settings UI belongs in feature-owned files under
  `packages/app/src/screens/settings/`; shared settings screens should contain route and section
  registration only.
- Feature translations belong in `packages/app/src/i18n/resources/feature-additions.ts`; locale
  files should contain only the merge hook plus intentional corrections to upstream translations.
- New protocol families belong in dedicated schema/type modules and are re-exported through
  `extension-resource-exports.ts`; `messages.ts` should contain only union registration and
  compatibility changes that cannot be expressed through the extension arrays.
- Server features should expose a session/service adapter from a feature-owned directory.
  `bootstrap.ts`, `session.ts`, and `websocket-server.ts` should only construct, register, and route
  those adapters.

Do not reuse an upstream public method name for a different response shape. Add a distinct method
name instead; otherwise every upstream caller becomes a conflict site during the next rebase.

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
4. Run `node scripts/check-upstream-file-budget.mjs`. If the change exceeds 100 upstream-owned
   files, extract feature modules before continuing.
5. Run `node scripts/check-source-overlays.mjs` and verify it reports
   `feature_paseo overlays: 0`.
6. Add or update a targeted regression test that fails if the feature implementation remains present
   but its route, menu, export, registration, or capability wiring disappears.
7. Update this inventory in the same commit.
8. Run targeted tests, typecheck, lint, and formatting required by `CLAUDE.md`.

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
