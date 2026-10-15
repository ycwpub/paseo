#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Linux network helper integration test requires Linux." >&2
  exit 77
fi

desktop_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$desktop_root/../.." && pwd)"

node "$desktop_root/scripts/build-linux-network-helper.mjs"
helper="$desktop_root/native-build/linux/$(node -p 'process.arch')/paseo-network-helper"
sudo chown root:root "$helper"
sudo chmod 4755 "$helper"

cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  if [[ -n "${second_server_pid:-}" ]]; then
    kill "$second_server_pid" 2>/dev/null || true
    wait "$second_server_pid" 2>/dev/null || true
  fi
  if [[ -n "${proxy_failure_helper_pid:-}" ]]; then
    kill "$proxy_failure_helper_pid" 2>/dev/null || true
    wait "$proxy_failure_helper_pid" 2>/dev/null || true
  fi
  if [[ "${package_install_created:-0}" == "1" ]]; then
    sudo rm -f /opt/Paseo/resources/network-helper/paseo-network-helper
    sudo rmdir /opt/Paseo/resources/network-helper /opt/Paseo/resources /opt/Paseo 2>/dev/null || true
  fi
}
trap cleanup EXIT

is_live_process() {
  local pid="$1"
  if [[ ! -r "/proc/$pid/stat" ]]; then
    return 1
  fi
  local state
  state="$(awk '{print $3}' "/proc/$pid/stat")"
  [[ "$state" != "Z" && "$state" != "X" ]]
}

port="$(
  python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()
PY
)"
python3 -m http.server "$port" --bind 0.0.0.0 --directory "$repo_root" >/tmp/paseo-network-helper-http.log 2>&1 &
server_pid=$!

for _ in $(seq 1 50); do
  if curl --fail --silent --show-error "http://127.0.0.1:$port/package.json" >/dev/null; then
    break
  fi
  sleep 0.1
done
curl --fail --silent --show-error "http://127.0.0.1:$port/package.json" >/dev/null

status="$("$helper" --status-json)"
node -e '
const status = JSON.parse(process.argv[1]);
if (status.capability !== "project_proxy") throw new Error("unexpected helper capability");
if (status.privilege_active !== true) throw new Error("setuid privilege is not active");
if (status.strict_ready !== true) throw new Error("project proxy helper must be strict-ready");
' "$status"

caller_uid="$(id -u)"
isolated_uid="$("$helper" -- /usr/bin/id -u)"
[[ "$isolated_uid" == "$caller_uid" ]]
"$helper" -- /usr/bin/test -r "$repo_root/package.json"

expect_blocked() {
  local label="$1"
  shift
  if "$helper" -- "$@"; then
    echo "$label unexpectedly reached the host network" >&2
    exit 1
  fi
}

expect_blocked "curl" curl --fail --silent --show-error "http://127.0.0.1:$port/package.json"
expect_blocked "Python socket" python3 -c \
  "import socket; socket.create_connection(('127.0.0.1', $port), timeout=1)"
expect_blocked "Node socket" node -e \
  "const net=require('node:net'); const s=net.connect($port,'127.0.0.1'); s.on('connect',()=>process.exit(0)); s.on('error',()=>process.exit(1)); setTimeout(()=>process.exit(1),1000)"
expect_blocked "grandchild curl" bash -c \
  "bash -c 'curl --fail --silent --show-error http://127.0.0.1:$port/package.json >/dev/null'"
expect_blocked "host namespace escape" nsenter -t 1 -n /usr/bin/true

second_port="$(
  python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()
PY
)"
python3 -m http.server "$second_port" --bind 0.0.0.0 --directory "$repo_root" >/tmp/paseo-network-helper-http-2.log 2>&1 &
second_server_pid=$!

proxy_token="0123456789abcdef0123456789abcdef"
PASEO_PROJECT_PROXY_TOKEN="$proxy_token" "$helper" --proxy-port "$port" -- bash -c \
  'curl --noproxy "*" --fail --silent --show-error "http://$PASEO_PROJECT_PROXY_HOST:'"$port"'/package.json" >/dev/null'

if PASEO_PROJECT_PROXY_TOKEN="$proxy_token" "$helper" --proxy-port "$port" -- bash -c \
  'curl --noproxy "*" --connect-timeout 1 --fail --silent --show-error "http://$PASEO_PROJECT_PROXY_HOST:'"$second_port"'/package.json" >/dev/null'; then
  echo "proxy namespace reached a non-proxy host port" >&2
  exit 1
fi

if PASEO_PROJECT_PROXY_TOKEN="$proxy_token" "$helper" --proxy-port "$port" -- \
  curl --noproxy "*" --connect-timeout 1 --fail --silent --show-error "https://1.1.1.1/" >/dev/null; then
  echo "proxy namespace reached the internet without the Project proxy" >&2
  exit 1
fi

PASEO_PROJECT_PROXY_TOKEN="$proxy_token" "$helper" --proxy-port "$port" -- sleep 30 &
proxy_failure_helper_pid=$!
relay_pid=""
proxy_command_pid=""
for _ in $(seq 1 50); do
  while read -r child_pid; do
    [[ -n "$child_pid" ]] || continue
    child_uid="$(awk '/^Uid:/{print $2}' "/proc/$child_pid/status" 2>/dev/null || true)"
    if [[ "$child_uid" == "0" ]]; then
      relay_pid="$child_pid"
    elif [[ "$child_uid" == "$caller_uid" ]]; then
      proxy_command_pid="$child_pid"
    fi
  done < <(pgrep -P "$proxy_failure_helper_pid" || true)
  if [[ -n "$relay_pid" && -n "$proxy_command_pid" ]]; then
    break
  fi
  sleep 0.05
done
if [[ -z "$relay_pid" || -z "$proxy_command_pid" ]]; then
  echo "helper did not launch distinct relay and command children" >&2
  exit 1
fi
sudo kill -KILL "$relay_pid"
for _ in $(seq 1 50); do
  if ! is_live_process "$proxy_failure_helper_pid"; then
    break
  fi
  sleep 0.05
done
if is_live_process "$proxy_failure_helper_pid"; then
  echo "helper did not fail closed after relay termination" >&2
  exit 1
fi
set +e
wait "$proxy_failure_helper_pid"
proxy_failure_status=$?
set -e
proxy_failure_helper_pid=""
if [[ "$proxy_failure_status" == "0" ]]; then
  echo "helper reported success after relay termination" >&2
  exit 1
fi
for _ in $(seq 1 50); do
  if ! is_live_process "$proxy_command_pid"; then
    break
  fi
  sleep 0.05
done
if is_live_process "$proxy_command_pid"; then
  echo "proxy command survived relay termination" >&2
  sudo kill -KILL "$proxy_command_pid" 2>/dev/null || true
  exit 1
fi

"$helper" -- sleep 30 &
helper_pid=$!
for _ in $(seq 1 50); do
  child_pid="$(pgrep -P "$helper_pid" | head -n 1 || true)"
  if [[ -n "$child_pid" ]]; then
    break
  fi
  sleep 0.05
done
if [[ -z "${child_pid:-}" ]]; then
  echo "helper did not launch its isolated child" >&2
  exit 1
fi
kill "$helper_pid"
wait "$helper_pid" 2>/dev/null || true
for _ in $(seq 1 50); do
  if ! is_live_process "$child_pid"; then
    break
  fi
  sleep 0.05
done
if is_live_process "$child_pid"; then
  echo "isolated child survived helper termination" >&2
  kill -KILL "$child_pid" 2>/dev/null || true
  exit 1
fi

if [[ -e /opt/Paseo ]]; then
  echo "refusing to modify an existing /opt/Paseo during helper install-hook test" >&2
  exit 1
fi
package_install_created=1
sudo install -D -m 0755 "$helper" /opt/Paseo/resources/network-helper/paseo-network-helper
sudo "$desktop_root/scripts/linux-network-helper-after-install.sh"
installed_metadata="$(
  stat -c '%U:%G:%a' /opt/Paseo/resources/network-helper/paseo-network-helper
)"
if [[ "$installed_metadata" != "root:root:4755" ]]; then
  echo "unexpected installed helper ownership/mode: $installed_metadata" >&2
  exit 1
fi
sudo chmod 0755 /opt/Paseo/resources/network-helper/paseo-network-helper
sudo "$desktop_root/scripts/linux-network-helper-after-install.sh"
upgrade_metadata="$(
  stat -c '%U:%G:%a' /opt/Paseo/resources/network-helper/paseo-network-helper
)"
if [[ "$upgrade_metadata" != "root:root:4755" ]]; then
  echo "upgrade did not restore helper ownership/mode: $upgrade_metadata" >&2
  exit 1
fi

echo "Linux network helper escape tests passed."
