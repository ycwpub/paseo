# Debian Project External Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Debian-only global switch that routes every Project subprocess through the Paseo
egress proxy and activates per-Project HTTP whitelist/blacklist controls.

**Architecture:** The daemon detects Debian from `/etc/os-release`, advertises the capability in
`server_info`, and persists an `externalProxy.enabled` mutable setting that non-Debian servers reject.
The Project network enforcer reads that global setting at execution time; when enabled it wraps every
Project process with the existing namespace/loopback relay, while the existing authorizer applies
Project HTTP rules.

**Tech Stack:** TypeScript, Zod protocol schemas, persisted daemon config, WebSocket `server_info`,
React Native settings UI, Vitest, Linux C helper integration, Debian 12 GitHub Actions container.

**Spec:** `docs/superpowers/specs/2026-10-15-debian-project-external-proxy-design.md`

## Global Constraints

- Only a daemon whose `/etc/os-release` contains `ID=debian` may enable the switch.
- The switch defaults to false and old clients/daemons remain wire-compatible.
- Non-Debian enable attempts fail on the server even if a client bypasses the UI.
- Enabled mode routes all Project subprocess traffic and fails closed when isolation is unavailable.
- Disabled mode does not inject proxy or isolation environment variables.
- Project HTTP deny rules override allow rules; Projects without an enabled policy remain
  compatibility-allow.
- Daemon background traffic without a Project identity is not routed.
- Linux acceptance uses Debian 12; Ubuntu results do not count.

---

### Task 1: Debian capability and protocol contracts

**Files:**

- Create:
  `packages/server/src/server/project-call-permissions/debian-external-proxy-platform.ts`
- Create:
  `packages/server/src/server/project-call-permissions/debian-external-proxy-platform.capability-regressions.test.ts`
- Modify: `packages/protocol/src/messages.ts`
- Modify: `packages/protocol/src/messages.capability-regressions.test.ts`

**Interfaces:**

- Produces:
  `detectDebianExternalProxyCapability({ platform?, readOsRelease? }): { available: boolean; reason: string }`.
- Produces mutable config field `externalProxy: { enabled: boolean }`.
- Produces optional feature `server_info.features.projectExternalProxy`.

- [ ] **Step 1: Write protocol and platform RED tests**

  Assert mutable config defaults `externalProxy.enabled` to false, patches accept a boolean, old
  `server_info` remains parseable, Debian advertises availability, and Ubuntu/non-Linux/missing files
  do not.

- [ ] **Step 2: Run the focused tests and confirm expected failures**

  Run:
  `npx vitest run packages/protocol/src/messages.capability-regressions.test.ts packages/server/src/server/project-call-permissions/debian-external-proxy-platform.capability-regressions.test.ts --bail=1`

- [ ] **Step 3: Implement the schemas and detector**

  Parse `ID` without executing shell text. Match only normalized value `debian`; return a
  user-facing reason for unsupported or unreadable hosts.

- [ ] **Step 4: Run the focused tests to GREEN**

### Task 2: Persist and guard the global switch

**Files:**

- Modify: `packages/server/src/server/persisted-config.ts`
- Modify: `packages/server/src/server/config.ts`
- Modify: `packages/server/src/server/bootstrap.ts`
- Modify: `packages/server/src/server/daemon-config-store.ts`
- Test: `packages/server/src/server/daemon-config-store.capability-regressions.test.ts`
- Modify: `packages/app/src/test-utils/mutable-daemon-config.ts`

**Interfaces:**

- `PaseoDaemonConfig.externalProxyEnabled?: boolean` carries persisted startup state.
- `DaemonConfigStore` option `externalProxyAvailable?: boolean` guards effective state and patches.
- `daemon.externalProxy.enabled` is reloadable and persisted.

- [ ] **Step 1: Write config-store RED tests**

  Assert available hosts persist and reload true/false, unavailable hosts expose false and throw on
  `patch({ externalProxy: { enabled: true } })`.

- [ ] **Step 2: Run the config-store tests and confirm failures**

- [ ] **Step 3: Implement explicit patch allowlists, persisted mappings, startup resolution, reload
      normalization, and server-side rejection**

- [ ] **Step 4: Run config-store and persisted-config tests to GREEN**

### Task 3: Route all Project subprocesses only when globally enabled

**Files:**

- Modify:
  `packages/server/src/server/project-call-permissions/project-network-enforcer.ts`
- Modify:
  `packages/server/src/server/project-call-permissions/linux-project-network-isolation-adapter.ts`
- Modify: `packages/server/src/server/bootstrap.ts`
- Test:
  `packages/server/src/server/project-call-permissions/project-network-enforcer.capability-regressions.test.ts`
- Test:
  `packages/server/src/server/project-call-permissions/linux-project-network-isolation-adapter.capability-regressions.test.ts`
- Test:
  `packages/server/src/server/project-call-permissions/linux-project-network-isolation.local.e2e.test.ts`

**Interfaces:**

- `ProjectNetworkEnforcerDependencies.isExternalProxyEnabled(): boolean` is evaluated per launch.
- `LinuxProjectNetworkIsolationAdapterOptions.externalProxyAvailable?: boolean` blocks non-Debian
  activation.

- [ ] **Step 1: Write routing RED tests**

  Cover global-off direct execution, global-on routing without Project permissions, and fail-closed
  helper unavailability.

- [ ] **Step 2: Run the Project network tests and confirm failures**

- [ ] **Step 3: Replace policy-driven wrapping with global-switch-driven wrapping**

  Continue using Project identity for proxy credentials and rule evaluation. Do not read Project
  policy merely to decide whether to wrap the process.

- [ ] **Step 4: Run unit and local Linux integration tests to GREEN**

### Task 4: Advertise capability and add host switch

**Files:**

- Modify: `packages/server/src/server/websocket-server.ts`
- Modify: `packages/server/src/server/websocket-server.relay-reconnect.test.ts`
- Create: `packages/app/src/screens/settings/external-proxy-model.ts`
- Create: `packages/app/src/screens/settings/external-proxy-model.test.ts`
- Create: `packages/app/src/screens/settings/external-proxy-card.tsx`
- Modify: `packages/app/src/screens/settings/host-page.tsx`

**Interfaces:**

- `WebSocketServerConfig.projectExternalProxy?: boolean` controls capability advertisement.
- `resolveExternalProxyUiState(serverInfo, config)` returns `available`, `enabled`, `switchDisabled`,
  and explanatory copy.

- [ ] **Step 1: Write server-info and UI-model RED tests**

- [ ] **Step 2: Run tests and confirm expected failures**

- [ ] **Step 3: Advertise Debian support and implement the optimistic host switch**

  On patch failure restore the previous value and show the server error. Render the card in Host
  connection settings on every platform so unsupported users see the disabled explanation.

- [ ] **Step 4: Run server-info and UI tests to GREEN**

### Task 5: Gate Project HTTP whitelist/blacklist editing

**Files:**

- Modify:
  `packages/app/src/projects/permissions/project-call-permissions-editor.tsx`
- Modify: `packages/app/src/screens/project-settings-screen.tsx`
- Create:
  `packages/app/src/projects/permissions/project-call-permissions-availability.ts`
- Create:
  `packages/app/src/projects/permissions/project-call-permissions-availability.test.ts`

**Interfaces:**

- `resolveProjectHttpPermissionAvailability({ featureAdvertised, externalProxyEnabled })` returns
  `{ editable: boolean; reason: string | null }`.
- `ProjectCallPermissionsEditor` receives `httpRulesEditable` and `httpRulesDisabledReason`.

- [ ] **Step 1: Write availability RED tests**

  Cover enabled Debian, disabled Debian, non-Debian, and old-daemon feature absence.

- [ ] **Step 2: Run the tests and confirm failures**

- [ ] **Step 3: Disable HTTP rule add/edit/delete controls and show the reason while preserving
      saved values**

  Keep RPC/MCP controls editable. The server feature comes from the selected remote host's
  `server_info`, not the local client platform.

- [ ] **Step 4: Run Project editor model and availability tests to GREEN**

### Task 6: Documentation and Debian acceptance

**Files:**

- Modify: `docs/product-extensions/project-call-permissions.md`
- Modify: `docs/extension-development-standard.md`
- Modify: `.github/workflows/linux-network-helper.yml`

**Interfaces:**

- Debian CI remains the authoritative OS-level acceptance.

- [ ] **Step 1: Document global-off/direct and global-on/strict behavior**

- [ ] **Step 2: Add the Debian platform regression to the workflow's targeted Vitest command and
      trigger paths**

- [ ] **Step 3: Run local lint, typecheck, format, targeted Project/protocol/UI tests, and
      `git diff --check`**

- [ ] **Step 4: Push the validation branch and require all Debian steps to pass**

  Required steps: Debian assertion, helper escape tests, Project policy/proxy integration, Linux
  package build, deb install/reinstall, and rpm install/upgrade.

- [ ] **Step 5: Commit all changes and verify a clean worktree**
