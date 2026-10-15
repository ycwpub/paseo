# Debian Project External Proxy Design

## Goal

Add a server-wide external-proxy switch for Project execution traffic. The switch is available only
when the daemon itself runs on Debian, defaults to off, and controls whether every Project Agent,
Workflow, and Plugin subprocess is forced through Paseo's authenticated Project egress proxy.

## Platform Capability

The daemon reads `/etc/os-release` and treats the feature as available only when `ID=debian`.
`process.platform === "linux"` alone is insufficient. Detection is performed by the server and
published through the optional `server_info.features.projectExternalProxy` flag so remote clients
never infer support from their own operating system.

On non-Debian hosts, the switch is displayed off and disabled. The daemon also rejects attempts to
persist `externalProxy.enabled=true`; UI state is not a security boundary. If a persisted Debian
configuration is moved to another operating system, its effective mutable configuration reports the
switch as off without silently enabling Linux-only behavior.

## Global Configuration

Mutable daemon configuration gains:

```yaml
externalProxy:
  enabled: false
```

The value is persisted under `daemon.externalProxy.enabled`, supports live reload, and defaults to
false for old configurations. Enabling it on Debian affects newly started Project executions;
already-running processes retain the environment with which they were launched.

## Routing Semantics

When the switch is off, Project subprocesses run without the Linux network helper and therefore do
not traverse the Paseo Project proxy. Managed RPC/MCP authorization remains active when a Project
policy enables it.

When the switch is on, every Project subprocess receives the strict namespace/loopback-relay
environment, whether or not the Project has configured permission rules. If the helper or proxy
cannot be prepared, task startup fails closed. Paseo background traffic that has no Project identity,
including updates and Lark connectivity, is not routed by this switch.

The existing proxy authorizer evaluates Project HTTP rules:

1. Any matching deny rule blocks the request.
2. Otherwise any matching allow rule allows it.
3. Otherwise `defaultAction` applies.
4. A Project without enabled permissions remains compatibility-allow while still traversing the
   proxy.

RPC/MCP rules continue to use the managed authorization boundary and are not converted into network
proxy rules.

## User Interface

Host connection settings show an “外部代理” card:

- Debian capability available: the switch is interactive and writes the global daemon setting.
- Non-Debian or old daemon: the switch is off, disabled, and explains that only Debian servers
  support it.
- A save failure restores the previous value and displays the server error.

Project settings receive both the server capability and effective global state. RPC/MCP controls
remain editable. HTTP whitelist/blacklist controls and their add/edit/delete actions are enabled
only while the Debian external proxy is globally on. Otherwise their saved values remain visible but
disabled, with an explanation that the server switch must be enabled first.

## Verification

- Protocol tests cover default-off config, optional server feature compatibility, and patch parsing.
- Platform tests cover Debian, Ubuntu, malformed, missing, and non-Linux `/etc/os-release` inputs.
- Config-store tests cover Debian persistence/live reload and non-Debian rejection/effective-off
  behavior.
- Network-enforcer tests cover global-off bypass, global-on routing for Projects without policies,
  and fail-closed adapter errors.
- UI model/component tests cover interactive Debian state, enabled state, non-Debian disabled state,
  and disabled Project HTTP rules.
- Debian 12 integration runs the helper, Project proxy allow/deny, DNS rebinding, process escape,
  deb install/upgrade, and rpm install/upgrade checks.
