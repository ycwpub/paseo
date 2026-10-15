# Linux Loopback Proxy Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Paseo Linux strict Project network permissions work without iptables by exposing only
the authenticated Project proxy through isolated namespace loopback.

**Architecture:** The setuid helper creates an anonymous network namespace with loopback only and
binds a listener inside it. A protected host-namespace relay forwards that fixed listener only to the
existing Paseo proxy port; the unprivileged Project process enters the isolated namespace and cannot
reach any other host or internet socket.

**Tech Stack:** Linux C11 (`setns`, `unshare`, sockets, ioctl, poll, process groups), Bash integration
tests, Electron Builder deb/rpm packaging, GitHub Actions Debian 12 privileged container.

**Spec:** `docs/superpowers/specs/2026-10-15-linux-loopback-proxy-isolation-design.md`

## Global Constraints

- Debian 12 is the only Linux acceptance environment; Ubuntu results do not count.
- Strict mode must fail closed and must not degrade to proxy environment variables alone.
- The Project child must retain caller uid/gid, empty supplementary groups, `no_new_privs`, and
  parent-death protection.
- The relay target is fixed to host loopback plus the already validated proxy port.
- No credentials may be logged.
- Do not run the full repository test suite; use targeted tests plus lint/typecheck/format checks.

---

### Task 1: Make the Debian regression independent of netfilter

**Files:**

- Modify: `.github/workflows/linux-network-helper.yml`
- Modify: `packages/desktop/src/system/linux-network-helper-packaging.capability-regressions.test.ts`

**Interfaces:**

- Consumes: the existing `test:linux-network-helper` shell integration entrypoint.
- Produces: a Debian helper test that runs before iproute2 is installed and without iptables, plus a
  packaging assertion that forbids runtime iproute2/iptables dependencies.

- [ ] **Step 1: Change the packaging regression first**

  Assert that deb/rpm dependency blocks do not contain `iproute2`, `iproute`, or `iptables`.

- [ ] **Step 2: Run the targeted test and verify it fails**

  Run:
  `npx vitest run packages/desktop/src/system/linux-network-helper-packaging.capability-regressions.test.ts --bail=1`

  Expected: FAIL because `electron-builder.yml` still declares netfilter dependencies.

- [ ] **Step 3: Isolate Debian CI network-fixture prerequisites**

  Delete `iproute2` and `iptables` from the Debian 12 base install list. Run the helper integration
  first, then install only `iproute2` in a separate step to create the public-looking loopback
  address required by the later Project proxy test. Leave the helper integration test unchanged so
  it remains the real behavioral regression.

### Task 2: Replace veth/iptables with an isolated loopback listener

**Files:**

- Modify: `packages/desktop/native/network-helper/linux/paseo-network-helper.c`
- Test: `packages/desktop/scripts/test-linux-network-helper.sh`

**Interfaces:**

- Consumes: `--proxy-port PORT -- COMMAND`, `PASEO_PROJECT_PROXY_TOKEN`, and the existing Project
  proxy listening on host `127.0.0.1:PORT`.
- Produces: the same helper CLI and status JSON with `capability=project_proxy` and
  `strict_ready=true`.

- [ ] **Step 1: Preserve the already-failing Debian behavioral test**

  Use Debian run `38719233787` as RED evidence: the test reaches
  `no working iptables backend is available in the namespace`.

- [ ] **Step 2: Implement namespace setup**

  Add helpers that save the host namespace fd, call `unshare(CLONE_NEWNET)`, enable `lo` with
  `SIOCGIFFLAGS`/`SIOCSIFFLAGS`, bind and listen on isolated `127.0.0.1:PORT`, save the isolated
  namespace fd, and call `setns` to return to the host namespace.

- [ ] **Step 3: Implement the fixed-target relay**

  Add a relay process group that accepts the isolated listener, connects only to host
  `127.0.0.1:PORT`, and copies both directions with nonblocking sockets and `poll`. Make relay
  processes non-dumpable, parent-death protected, and free of the raw proxy-token environment
  variable.

- [ ] **Step 4: Launch and clean up the Project command**

  Fork the command child, enter the saved isolated namespace, configure proxy variables for
  `127.0.0.1:PORT`, drop privileges, and exec. After it exits, kill and reap the relay process group,
  close all namespace/listener fds, and return the command exit status.

- [ ] **Step 5: Compile and run the Debian helper integration**

  Push the implementation to `fork/ci/linux-network-helper-20261014`.

  Expected in Debian 12:
  `Compile helper and run process-tree escape tests` succeeds and prints
  `Linux network helper escape tests passed.`

### Task 3: Remove obsolete runtime package dependencies and update docs

**Files:**

- Modify: `packages/desktop/electron-builder.yml`
- Modify: `docs/product-extensions/project-call-permissions.md`
- Modify: `docs/extension-development-standard.md`

**Interfaces:**

- Consumes: Task 2 helper implementation.
- Produces: deb/rpm packages whose dependency metadata matches the libc-only helper architecture.

- [ ] **Step 1: Remove iproute/netfilter package dependencies**

  Remove `iproute2`, `iproute`, and `iptables` from helper-specific deb/rpm dependency lists while
  retaining unrelated Electron runtime dependencies.

- [ ] **Step 2: Update the Project permission architecture documentation**

  Replace veth/iptables language with anonymous namespace, isolated loopback listener, fixed-target
  host relay, fail-closed cleanup, and Debian-only acceptance requirements.

- [ ] **Step 3: Run the packaging regression**

  Run:
  `npx vitest run packages/desktop/src/system/linux-network-helper-packaging.capability-regressions.test.ts --bail=1`

  Expected: 2 tests pass.

### Task 4: Complete Debian acceptance and local regression checks

**Files:**

- Verify only; no expected production edits.

**Interfaces:**

- Consumes: Tasks 1-3.
- Produces: reproducible Debian CI evidence and a clean committed worktree.

- [ ] **Step 1: Run the complete Debian 12 workflow**

  Verify all of these steps succeed:
  `Assert Debian runtime`,
  `Compile helper and run process-tree escape tests`,
  `Run Project policy and proxy integration`,
  `Build Linux desktop packages`,
  `Install and upgrade deb package`,
  `Install and upgrade rpm package`.

- [ ] **Step 2: Run local targeted regressions**

  Run the Project permission, HTTP/CONNECT, Workflow/Plugin, packaging, and provider-owned Vitest
  files previously used by this feature; do not run the full test suite.

- [ ] **Step 3: Run repository quality gates**

  Run `npm run lint`, relevant workspace typechecks, `npm run format:check`, and
  `git diff --check`.

- [ ] **Step 4: Commit and verify**

  Commit implementation, tests, workflow, packaging, and documentation. Confirm `git status
--short` is empty and report the final commit hash plus the Debian 12 workflow URL.
