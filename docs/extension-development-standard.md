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

Automated alert troubleshooting prompt variables must use lowercase underscore-separated names.
Saved camelCase placeholders are normalized during configuration parsing, including Project-defined
variables, so the UI, persisted templates, and runtime rendering use one canonical convention.
Automated alert troubleshooting must use the selected bot application's Paseo-managed user OAuth
identity only to read the configured Wiki root (`wiki:wiki:readonly`). Creating the daily Wiki node
and reading or writing its Base must use the bot identity with real fine-grained `wiki:node:*` and
`base:*` scopes; deprecated or unknown aggregate scopes must not be requested. Lark rate limits and
transient network failures use bounded retries; user OAuth errors, bot permission errors, and
resource visibility errors remain distinct, and credentials must never be included in logs or
persisted task errors. Every monitoring stage that can fail before an Agent task is created,
including scheduled scanning, real-time message ingestion, daily Base creation, and unclaimed-row
polling, must persist a failed task record. The task error must name the failed stage, the request
identity, the exact missing scope, the Lark error code, and the next recovery action.

| Feature area                       | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Critical integration points                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow runtime and editor        | Reusable Workflow protocol, execution, variables, loops, node results, graph editing, run inspection, and lifecycle controls remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Protocol exports, server bootstrap/session registration, app routes, settings/navigation entries.                                                                                                                                                                                                                                                                                                                                               |
| Plugin platform                    | Plugin discovery, installation, runtime surfaces, sidebar items, command-center contributions, attachments, themes, timeline items, and Project-linked plugins remain reachable. The sidebar prefers the active Workspace Host when it has installed plugins, then falls back to the local daemon and other connected Hosts, so opening a remote Workspace without plugins does not hide plugins installed elsewhere. A Host reconnect keeps its last successful plugin catalog visible while network eligibility only controls refreshes; once online, the authoritative catalog is fetched again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Plugin registry/exports, app root providers, multi-Host sidebar catalog selection, sidebar wiring, route registration, server bootstrap.                                                                                                                                                                                                                                                                                                        |
| Automated alert troubleshooting    | Argos and Bamboo troubleshooting plugins support Project-scoped configuration, provider/model/Assistant/Team selection, Lark group monitoring, SOP and attribution documents, real-time alert handling, compensating scheduled scans, and Project-based Agent collaboration. Bamboo troubleshooting uses the `life-settle-ai-assistant` Bamboo Skill and supports direct `result_id` debugging: a manually specified result creates or reuses the daily attribution-table record before entering the forced manual queue. Both plugin types support create, update, delete, and runtime status management. Configuration forms provide field-level actionable Chinese validation and never expose raw schema errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Bundled plugin marketplace/packages, alert-troubleshooter protocol types and RPC schemas, unified plugin service/session wiring, Project plugin panels, shared alert-troubleshooter form validation, Lark channel service, daily attribution-table record store, and plugin-specific managers.                                                                                                                                                  |
| Workflow HTTP service              | Workflow-backed asynchronous HTTP listeners, routes, request/response templates, custom handlers, task inspection, cleanup, and Project overrides remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Plugin package, HTTP management protocol exports, server plugin manager, app plugin surface.                                                                                                                                                                                                                                                                                                                                                    |
| Agent web app                      | Declarative Agent web app plugin interfaces and runtime integration remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Plugin registry, app surface routing, server plugin transport.                                                                                                                                                                                                                                                                                                                                                                                  |
| Memory                             | Global, Project, daily/task, scoped memory, import/export, user selection, and memory management remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Settings routes, host/Project settings entries, server configuration and session context.                                                                                                                                                                                                                                                                                                                                                       |
| Managed Projects                   | Project creation, hierarchy, local or Git-backed directories, pre-task repository/branch synchronization into Project-owned `repos`, variables, Project knowledge and memory second-level settings entries, user OAuth-backed Lark group context, icons, plugin links, indexing, and Project-owned storage remain available. Cloud document knowledge authorization requests include a directly clickable OAuth link, complete the pending authorization challenge, and retry the cache download after authorization. The sidebar supports Workspace multi-selection with batch archive and batch delete; failed items remain selected for retry, and delete only removes Paseo-managed Workspace data without deleting or modifying external source directories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Project settings, Git resource schema/sync service, knowledge, memory, and Lark context routes; cloud-cache source/auth adapters and permission-card authorization action; settings navigation; sidebar Project projection and Workspace row bulk-selection wiring; Lark OAuth RPC/token store; protocol/session handlers.                                                                                                                      |
| Lark channel OAuth                 | Lark group lookup and user-name search use the Paseo-managed user OAuth identity, while email/open_id contact lookup uses the configured bot application's tenant identity and contact scopes. Group lookup requests `im:chat:read` without the deprecated `im:chat` grant, and group identity is presented as group name plus `oc_xxx`; token refresh preserves existing scopes instead of silently expanding them. The contact directory can resolve an `ou_id` into the visible username and email, add the result, automatically complete observed contacts with missing identity fields, scan either a recent private-message window (30 minutes by default) or an explicit local start/end message time range for contacts that the user can explicitly add, and clear all stored first-message content for the selected bot while preserving identity fields and first-message timestamps. When authorization is missing, incomplete, or expired, the field-level error includes an in-place authorization link that creates a fresh OAuth state, opens the authorization page, polls status, and clears the stale error after authorization succeeds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Lark directory fields and service, recent-private-user scan and first-message cleanup RPCs, result list, Lark client adapter and search-result adapters, reminder editor, reusable OAuth error action, OAuth hook/RPC, external URL opener, and OAuth token store.                                                                                                                                                                              |
| Lark substitute modes              | Substitute modes support create/edit/list flows, private/group replies, disclosures, topic context, and realtime-event merge delays; two-layer audience lists (OR within conversation rules, OR within user rules, AND between layers, OR between lists). Seven conversation types and seven configurable sender types are supported, including persisted user open_id and robot-name matching; legacy email rules remain readable for compatibility. Users can resolve open_id values by username, email, or existing contact-directory data. Independent question allowlists/blocklists, user/group lookup, group AI classification, name regex matching, active time windows, provider/model/Assistant/Team selection, and automatic Project creation from the substitute name when no Project is selected. In an allowed group, only mentioning the OAuth-authorized substitute user triggers the bound mode; mentioning the bound bot or any other configured bot alone never triggers substitute mode, while additional bot mentions do not prevent an authorized-user mention from triggering it. Local bots from different Lark applications recognize the same authorized user by `unionId` plus the target application's OAuth `openId`; the target authorization's private-chat `chatId` must not block a group mention from being relayed. Each mode owns a task page for listener/scanner list, immediate scan, pause, and delete. Failures stay visible with their stage, real error detail, and recovery advice. Private-message detail loading uses bounded concurrency, honors Lark rate-limit reset headers, retries `99991400`, and preserves successful messages when individual details fail. New and migrated legacy modes default to a 10-minute realtime-event merge delay and the prompt “仅回答工作相关问题，避免代替用户做承诺”. Scheduled private/group scans bypass that delay and instead use a 30-minute interval, 60-minute lookback, and 10-minute recent-message exclusion by default. Applying for a Lark bot requests the permissions, events, and callback allowlists required by these flows. | Lark channel settings routes and sections, substitute task page and RPC schemas/types, main Session routing, channel session handler, mode/task stores and migrations, group/private pollers, Lark API request controls, audience rule forms/editors, Project creation adapter, rule matcher, debounce/context services, reply sender, bot capability requirements, user OAuth, and Lark client adapter.                                        |
| Agent behavior                     | Chat continuity, cache-first history restore for open tabs, authoritative history delivery through both WebSocket events and correlated fetch results, preservation and display of the current submitted prompt—including untracked compatibility prompts anchoring newer live activity—when an older bootstrap snapshot completes concurrently with a live turn, history windows calculated from the same visible projection that is rendered, stable newest-message anchoring before top-history pagination, finite history-pagination loading states, active-turn handling, default queueing while a turn is running, queued-message edit/delete/immediate-steer actions, context compaction queueing, response review, timestamps, fork/handoff behavior, task notifications, task summaries, multi-repository change review/undo, and auto-archive remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Agent manager/provider adapters, timeline projection and replica cache, `timeline/timeline-response-delivery.ts`, `timeline/current-prompt-visibility.capability-regressions.test.ts`, `agent-stream/web-route-bottom-anchor.ts`, history-start pagination state, process-visibility projection, composer queue modules, `agent-stream/view.tsx`, `agent-stream/turn-footer.tsx`, task-summary panels, and workspace layout/panel registration. |
| Aiden Claude and Codex integration | Provider-specific reasoning/commentary handling, translation settings, notification routing, resume behavior, and model/provider configuration remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Provider adapters, settings storage/UI, stream rendering, desktop notifications.                                                                                                                                                                                                                                                                                                                                                                |
| TraeX provider                     | TraeX is available as a disabled-by-default built-in Provider, launches `traex acp serve`, discovers models and modes through ACP, supports normal command/environment overrides, and reuses the existing TRAE icon without duplicating the ACP subsystem. Legacy custom `traecli` Provider configuration remains compatible and can be removed from Provider settings. The mutable Provider source must retain complete custom definitions before a registry-wide replacement, so toggling TraeX or removing TRAE CLI cannot discard another Provider's `extends`, command, environment, models, or metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Provider manifest, TraeX ACP adapter, provider registry factory, initial mutable Provider config adapter, provider settings snapshot/toggle/removal flow, provider icon alias, and focused regression tests.                                                                                                                                                                                                                                    |
| Native desktop integration         | macOS Dynamic Island, desktop identity, daemon connectivity, pairing, packaged runtime, platform-specific startup behavior, and bidirectional supervisor/worker heartbeat remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Desktop main/preload, daemon manager, app host runtime, pairing screens and settings, `packages/server/scripts/supervisor.ts`, `packages/server/src/server/daemon-worker.ts`, and `supervision-parity.test.ts`.                                                                                                                                                                                                                                 |
| Shared resources and collaboration | Assistants, MCP servers, skills, orchestration, collaboration, reusable agent tooling, and configurable ten-item pagination for Skill/MCP management remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Protocol exports, server bootstrap, CLI registration, settings/navigation entries.                                                                                                                                                                                                                                                                                                                                                              |
| Byte development workflows         | Byte development and reconciliation workflows, handoff stages, plugin assets, and related skills remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Plugin manifests/workflows, skill materialization, Workflow runtime.                                                                                                                                                                                                                                                                                                                                                                            |
| Go client SDK                      | Go WebSocket client, agent creation/query/archive, message sending, stream subscription, approval handling, types, documentation, and examples remain available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `packages/client-go`, protocol compatibility, exported message contracts.                                                                                                                                                                                                                                                                                                                                                                       |
| Simplified Chinese default UI      | New branch-owned user-facing copy defaults to Simplified Chinese and existing branch surfaces retain their Chinese labels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | i18n resources, route titles, settings/sidebar labels, plugin documents.                                                                                                                                                                                                                                                                                                                                                                        |
| Branch navigation and settings     | Workflow, Plugin, Memory, Project, HTTP service, provider, pairing, and related feature pages remain reachable from their intended routes and menus. Explorer must retain File, Changes, Task Summary, and Pull Request entries, and its supporting-panel Tab rail wraps onto another row when the available width cannot fit one row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | App root layout, left sidebar, settings screen, Project settings screen, host page, workspace panel manifest/registration, launcher catalog, Explorer Tab rail and sortable-list layout strategy, and persisted Explorer layout migration.                                                                                                                                                                                                      |

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

## Lark substitute scanning safeguards

- Private-message processing requires an audience allow list containing `private` in its
  conversation layer and at least one user-layer rule. An empty private allowlist disables private
  scanning and must never create a relay group.
- Group-message processing requires an audience allow list containing an explicit group,
  group-name regex, group AI category, or `all_groups` in its conversation layer and at least one
  user-layer rule. An empty group allowlist disables listener/scanner processing and must never
  invite the bot into a group.
- Every private user observed by an enabled scan is stored in the Lark contact directory with the
  first message content/time, then asynchronously enriched with the visible username and email.
- Long private-contact scans must split the requested time range into bounded search windows,
  fully paginate each window, deduplicate message IDs, and attribute both sides of a private
  conversation to the peer instead of discarding the authorized user's replies.
- Legacy bot-level substitute configuration is read as a two-layer list covering private chat and
  all groups with all users, so preserving its old behavior does not weaken the empty-allowlist
  default-deny rule for newly managed modes.
- The configured answer delay applies only to realtime listener events, where it merges consecutive
  messages and avoids answering too quickly. Scheduled private/group scans must bypass that delay
  and rely exclusively on their lookback and recent-message exclusion windows.
- New private/group scan settings default to a 30-minute interval, 60-minute lookback, and
  10-minute recent-message exclusion. Realtime listener debounce defaults to 600 seconds.

## Aiden Codex retry notification contract

Codex app-server `error` notifications describe model-request failures, not Paseo transport
disconnects. Provider adapters must preserve that distinction:

- `willRetry: true` keeps the current turn and Provider session alive and emits a non-terminal
  timeline error such as “模型服务负载过高，正在重试”;
- retry notifications must not restart the Provider, recreate the session, or emit
  `turn_failed`;
- `willRetry: false` is not an independent terminal because Codex follows it with
  `turn/completed`; the adapter waits for that notification so the original 429/529 diagnostic is
  retained exactly once;
- upstream Aiden gateways should expose provider overload as standard HTTP 429 with
  `Retry-After`, rather than converting it into a transport-looking 529 response.

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

## Conversation route activation

Retained conversation panels must treat every hidden-to-visible route activation as a new entry
request. A conversation that was previously detached from the live tail must return to the newest
message when the user explicitly enters it again. The activation request key must change for each
entry, restore follow-output before anchoring, remain active while virtualized rows are measured,
and block older-history pagination until the bottom anchor settles. Do not implement this behavior
with fixed timeouts.
