#!/usr/bin/env sh
set -eu

helper="/opt/Paseo/resources/network-helper/paseo-network-helper"
if [ ! -f "$helper" ]; then
  echo "Paseo network helper is missing: $helper" >&2
  exit 1
fi

chown root:root "$helper"
chmod 4755 "$helper"
