import { describe, expect, test } from "vitest";

import {
  normalizeMutableRelayPatch,
  resolveEnabledRelayEndpoints,
} from "./daemon-relay-config-patch.js";

const disabledRelay = {
  enabled: false,
  endpoints: [],
  pairingBaseUrls: [],
  local: { enabled: false, listen: "0.0.0.0:6769" },
};

describe("normalizeMutableRelayPatch", () => {
  test("maps an explicit legacy enable patch to the hosted Relay", () => {
    expect(normalizeMutableRelayPatch(disabledRelay, { enabled: true })).toEqual({
      enabled: true,
      endpoints: [{ endpoint: "relay.paseo.sh:443", useTls: true }],
    });
  });

  test("preserves a configured endpoint while disabled and re-enables it", () => {
    const current = {
      ...disabledRelay,
      endpoints: [{ endpoint: "127.0.0.1:9", useTls: false }],
    };

    expect(normalizeMutableRelayPatch(current, { enabled: true })).toEqual({
      enabled: true,
    });
  });

  test("derives the legacy enabled summary from an endpoint patch", () => {
    expect(
      normalizeMutableRelayPatch(disabledRelay, {
        endpoints: [{ endpoint: "127.0.0.1:9", useTls: false }],
      }),
    ).toEqual({
      enabled: true,
      endpoints: [{ endpoint: "127.0.0.1:9", useTls: false }],
    });
    expect(normalizeMutableRelayPatch(disabledRelay, { endpoints: [] })).toEqual({
      enabled: false,
      endpoints: [],
    });
  });
});

describe("resolveEnabledRelayEndpoints", () => {
  test("retains configured endpoints while legacy Relay is disabled", () => {
    const relay = {
      ...disabledRelay,
      endpoints: [{ endpoint: "127.0.0.1:9", useTls: false }],
    };

    expect(resolveEnabledRelayEndpoints(relay)).toEqual([]);
    expect(resolveEnabledRelayEndpoints({ ...relay, enabled: true })).toEqual(relay.endpoints);
  });
});
