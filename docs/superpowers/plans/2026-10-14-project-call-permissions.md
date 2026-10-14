# Project Call Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Project-level allow and deny policies for downstream RPC, MCP Tool, and HTTP calls, with auditable daemon enforcement and fail-closed strict-network status.

**Architecture:** Store an optional policy in `PaseoProjectConfig`, evaluate it through one pure policy engine, and inject a Project authorizer at daemon execution boundaries. Managed calls are enforced immediately. Strict process egress is a separate platform adapter; requesting strict mode without an active adapter blocks execution rather than silently weakening the policy.

**Tech Stack:** TypeScript, Zod, Vitest, React Native/Expo, daemon file stores.

**Spec:** `docs/product-extensions/project-call-permissions.md`

## Global Constraints

- Old Project configurations without `permissions` remain allowed.
- Once enabled, the UI defaults `defaultAction` to `deny`.
- A matching deny rule always wins over matching allow rules.
- Wire additions stay optional and backward-compatible.
- Default UI copy is Simplified Chinese.
- Feature-owned implementation lives in new responsibility-named files.
- Do not claim strict process isolation unless an OS adapter is active.
- Update `docs/extension-development-standard.md` in the same commit.

---

### Task 1: Policy schema and pure evaluator

**Files:**

- Create: `packages/protocol/src/project-call-permissions.ts`
- Create: `packages/protocol/src/project-call-permissions.capability-regressions.test.ts`
- Modify: `packages/protocol/src/paseo-config-schema.ts`
- Modify: `packages/protocol/src/extension-resource-exports.ts`

**Interfaces:**

- Produces: `ProjectCallPermissionsSchema`, `ProjectCallRequest`, `evaluateProjectCallPermission(policy, request)`, and `ProjectCallPermissionDecision`.

- [ ] Write tests for old-project compatibility, deny precedence, default deny, exact/prefix/glob/regex RPC matching, and HTTP protocol/host/port/method/path matching.
- [ ] Run `npx vitest run packages/protocol/src/project-call-permissions.capability-regressions.test.ts --bail=1` and confirm missing exports fail.
- [ ] Implement schemas and the pure evaluator without I/O.
- [ ] Re-run the targeted test and confirm all assertions pass.

### Task 2: Project authorizer, denial error, and redacted audit store

**Files:**

- Create: `packages/server/src/server/project-call-permissions/project-call-authorizer.ts`
- Create: `packages/server/src/server/project-call-permissions/project-call-authorizer.capability-regressions.test.ts`
- Create: `packages/server/src/server/project-call-permissions/project-call-audit-store.ts`
- Create: `packages/server/src/server/project-call-permissions/project-call-audit-store.capability-regressions.test.ts`

**Interfaces:**

- Consumes: `evaluateProjectCallPermission`.
- Produces: `ProjectCallAuthorizer.authorize(input)`, `ProjectPermissionDeniedError`, and append/list audit operations.

- [ ] Write a failing authorizer test that loads the Project through Workspace identity and returns `PROJECT_PERMISSION_DENIED` with a matched rule.
- [ ] Run the authorizer test and confirm the missing implementation fails.
- [ ] Implement Project config lookup, authorization, and typed denial errors.
- [ ] Write a failing audit test proving headers, query secrets, and bodies are not persisted.
- [ ] Implement atomic JSONL audit persistence with bounded retention.
- [ ] Run both targeted tests and confirm they pass.

### Task 3: Enforce Paseo MCP and managed HTTP boundaries

**Files:**

- Create: `packages/server/src/server/agent/tools/project-tool-authorization.ts`
- Create: `packages/server/src/server/agent/tools/project-tool-authorization.capability-regressions.test.ts`
- Modify: `packages/server/src/server/agent/tools/paseo-tools.ts`
- Create: `packages/server/src/server/project-call-permissions/project-http-client.ts`
- Create: `packages/server/src/server/project-call-permissions/project-http-client.capability-regressions.test.ts`

**Interfaces:**

- Consumes: `ProjectCallAuthorizer`.
- Produces: pre-handler `mcp:paseo/<tool>` checks and `projectFetch()` with redirect reauthorization.

- [ ] Write a failing MCP test proving a denied tool handler is never invoked and an allowed tool still runs.
- [ ] Add the single catalog execution hook and run the targeted MCP test.
- [ ] Write failing HTTP tests for method/path denial and redirect reauthorization.
- [ ] Implement `projectFetch()` with manual redirects, bounded redirect count, and authorization before every request.
- [ ] Run both targeted tests and confirm they pass.

### Task 4: Strict-network capability and fail-closed execution gate

**Files:**

- Create: `packages/server/src/server/project-call-permissions/project-network-enforcer.ts`
- Create: `packages/server/src/server/project-call-permissions/project-network-enforcer.capability-regressions.test.ts`
- Modify: `packages/server/src/server/agent/create-agent/create.ts`

**Interfaces:**

- Produces: `ProjectNetworkEnforcer.status(projectId)` and an Agent creation gate for enabled strict policies.

- [ ] Write a failing test proving strict mode with no active platform adapter blocks Agent creation before Provider startup.
- [ ] Implement `unavailable` status and the creation gate.
- [ ] Add adapters only when their process-tree isolation can be demonstrated by a local integration test; environment-variable-only proxying must remain `unavailable`.
- [ ] Run the targeted test and confirm it passes.

### Task 5: Project settings editor and rule simulation

**Files:**

- Create: `packages/app/src/projects/permissions/project-call-permissions-model.ts`
- Create: `packages/app/src/projects/permissions/project-call-permissions-model.capability-regressions.test.ts`
- Create: `packages/app/src/projects/permissions/project-call-permissions-editor.tsx`
- Create: `packages/app/src/projects/permissions/project-call-permissions-editor.capability-regressions.test.tsx`
- Modify: `packages/app/src/projects/config/project-config-editor-model.ts`
- Modify: `packages/app/src/screens/project-settings-screen.tsx`
- Modify: `packages/app/src/i18n/resources/chinese-translation-overrides.ts`

**Interfaces:**

- Consumes: Project config policy schema.
- Produces: inline Project settings editor with enable switch, default action, RPC/HTTP rule rows, validation, and visible strict-mode state.

- [ ] Write failing model tests for config round-trip and new-policy default deny.
- [ ] Implement the draft model and connect it to Project config save.
- [ ] Write failing UI tests for adding/removing rules and strict-unavailable warning.
- [ ] Implement the editor with Simplified Chinese copy and accessible controls.
- [ ] Run both targeted tests and confirm they pass.

### Task 6: Documentation, inventory, and verification

**Files:**

- Modify: `docs/extension-development-standard.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Documents the security boundary and feature integration points.

- [ ] Add the Project permission feature and critical integration points to the branch inventory.
- [ ] Document that strict mode is fail-closed and platform-adapter dependent.
- [ ] Run every targeted Vitest file from Tasks 1–5.
- [ ] Run `npm run build:client`, then package-specific typechecks for protocol, server, and app.
- [ ] Run `npm run lint`.
- [ ] Run `npm run format`, `npm run format:check`, and `git diff --check`.
- [ ] Review `git status` and the complete diff before committing.
