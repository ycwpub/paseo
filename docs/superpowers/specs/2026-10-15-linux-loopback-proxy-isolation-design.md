# Linux Loopback Proxy Isolation Design

## Context

Paseo strict Project permissions must prevent Agent, Workflow, and Plugin child processes from
opening arbitrary sockets. The existing Linux helper creates a network namespace and veth pair, then
uses an `iptables` OUTPUT policy to expose only the authenticated Paseo Project proxy. Debian 12
validation showed that a privileged container can create the namespace and veth while both
`iptables-nft` and `iptables-legacy` reject rule mutations. A strict implementation cannot silently
drop the firewall or rely only on proxy environment variables.

## Decision

Replace the veth and netfilter design with an anonymous network namespace that has only loopback.
The setuid helper creates a TCP listener on `127.0.0.1:<proxy_port>` while it is inside that isolated
namespace, keeps the listener file descriptor, then returns to the host namespace. A protected relay
process accepts connections from that listener and connects only to
`127.0.0.1:<proxy_port>` in the host namespace.

The Project process enters the isolated namespace, receives the authenticated proxy URL pointing to
the isolated loopback listener, clears the raw proxy token, drops to the invoking uid/gid, clears
supplementary groups, enables `no_new_privs`, and executes the requested command. The isolated
namespace contains no veth, non-loopback interface, or default route. The relay never accepts a
destination from the child and therefore cannot be used to reach another host address or port.

## Security Invariants

- `strict_ready=true` is reported only by the complete namespace-plus-relay helper.
- The Project process can reach only loopback sockets created inside its own anonymous network
  namespace.
- The helper-owned listener is the only network service created in that namespace.
- The host-side relay connects only to the validated Paseo proxy port on host loopback.
- Proxy authentication and Project HTTP/CONNECT policy enforcement remain in the existing Paseo
  proxy.
- The relay uses a separate process group, is non-dumpable, does not execute user input, and is
  terminated with all workers when the Project command exits or the helper dies.
- The Project command runs with the caller uid/gid, no supplementary groups, `no_new_privs`, and a
  parent-death signal. It cannot enter another process network namespace.
- Failure to create the namespace, enable loopback, bind the listener, return to the host namespace,
  launch the relay, or enter the isolated namespace fails closed.
- No proxy token is logged. The relay removes the raw token from its environment.

## Packaging

The helper uses Linux namespace, socket, ioctl, poll, and process APIs from libc. It no longer invokes
`ip`, `iptables`, or `iptables-legacy`, so deb/rpm packages do not depend on iproute2 or iptables for
strict Project network isolation. The post-install hook continues to install the helper as
`root:root` mode `4755`.

## Verification

Linux acceptance runs only in a privileged Debian 12 container and must prove:

1. Direct curl, Python sockets, Node sockets, grandchildren, and namespace escape attempts fail.
2. The isolated loopback relay reaches the configured Paseo proxy port.
3. The same isolated process cannot reach a second host port or the public internet.
4. Project allow/deny, HTTP/CONNECT, DNS pinning, and DNS rebinding tests pass through the relay.
5. The helper process tree terminates when its owner exits.
6. deb and rpm packages build, install, reinstall/upgrade, preserve `root:root:4755`, and uninstall.
7. The Debian job does not install iproute2 or iptables as test prerequisites.
