import { afterEach, describe, expect, test } from "vitest";

import { normalizeAidenProviderRuntimeSettings } from "./provider-command-compat.js";

const originalAidenBin = process.env.AIDEN_BIN;

afterEach(() => {
  if (originalAidenBin === undefined) {
    delete process.env.AIDEN_BIN;
  } else {
    process.env.AIDEN_BIN = originalAidenBin;
  }
});

describe("Aiden provider command compatibility", () => {
  test("replaces a Linux Aiden Claude wrapper with the PATH-resolved Aiden command", () => {
    expect(
      normalizeAidenProviderRuntimeSettings("aiden-claude", {
        command: {
          mode: "replace",
          argv: ["/home/user/paseo/bin/aiden-x-claude-paseo"],
        },
      }),
    ).toEqual({
      command: {
        mode: "replace",
        argv: ["aiden", "x", "claude"],
      },
    });
  });

  test("preserves wrapper arguments and honors an explicitly configured Aiden binary", () => {
    expect(
      normalizeAidenProviderRuntimeSettings("aiden-claude", {
        command: {
          mode: "replace",
          argv: ["/home/user/paseo/bin/aiden-x-claude-paseo", "--gateway-mode", "direct"],
        },
        env: {
          AIDEN_BIN: "/opt/aiden/bin/aiden",
        },
      }),
    ).toEqual({
      command: {
        mode: "replace",
        argv: ["/opt/aiden/bin/aiden", "x", "claude", "--gateway-mode", "direct"],
      },
      env: {
        AIDEN_BIN: "/opt/aiden/bin/aiden",
      },
    });
  });

  test("provides the direct launcher when an Aiden provider has no command", () => {
    process.env.AIDEN_BIN = "/home/user/.local/bin/aiden";

    expect(normalizeAidenProviderRuntimeSettings("aiden-codex", undefined)).toEqual({
      command: {
        mode: "replace",
        argv: ["/home/user/.local/bin/aiden", "x", "codex"],
      },
    });
  });

  test("does not replace a user-owned custom launcher", () => {
    const runtimeSettings = {
      command: {
        mode: "replace" as const,
        argv: ["/opt/company/run-aiden-claude"],
      },
    };

    expect(normalizeAidenProviderRuntimeSettings("aiden-claude", runtimeSettings)).toBe(
      runtimeSettings,
    );
  });

  test("does not change non-Aiden providers", () => {
    const runtimeSettings = {
      command: {
        mode: "replace" as const,
        argv: ["/opt/company/claude"],
      },
    };

    expect(normalizeAidenProviderRuntimeSettings("claude", runtimeSettings)).toBe(runtimeSettings);
  });
});
