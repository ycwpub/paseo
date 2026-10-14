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
}
trap cleanup EXIT

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
if (status.capability !== "proxy_namespace") throw new Error("unexpected helper capability");
if (status.privilege_active !== true) throw new Error("setuid privilege is not active");
if (status.strict_ready !== false) throw new Error("unwired proxy helper must not claim strict readiness");
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
is_live_process() {
  local pid="$1"
  if [[ ! -r "/proc/$pid/stat" ]]; then
    return 1
  fi
  local state
  state="$(awk '{print $3}' "/proc/$pid/stat")"
  [[ "$state" != "Z" && "$state" != "X" ]]
}
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

echo "Linux network helper escape tests passed."
