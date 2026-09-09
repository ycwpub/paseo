import { describe, expect, test } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import {
  getLarkSubstituteManualScanRangeDefaults,
  parseLarkSubstituteManualScanRange,
} from "./lark-substitute-manual-scan-range";

function mode(): LarkSubstituteMode {
  return {
    id: "mode-1",
    name: "工作替身",
    enabled: true,
    botId: "bot-1",
    privateScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    },
    groupScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 120,
      excludeRecentMinutes: 20,
    },
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "",
    delaySeconds: 600,
    autoArchiveAgent: false,
    activeTimeRanges: [],
    audienceAllowlist: [],
    audienceDenylist: [],
    questionAllowlist: [],
    questionDenylist: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "aiden_codex",
      model: null,
      cwd: "/repo",
      workspaceId: null,
    },
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

describe("Lark substitute manual scan range", () => {
  test("defaults to the enabled private scan configuration", () => {
    expect(getLarkSubstituteManualScanRangeDefaults(mode())).toEqual({
      lookbackMinutes: "60",
      excludeRecentMinutes: "10",
    });
  });

  test("parses a compensation range such as 120 minutes ago through 1 minute ago", () => {
    expect(
      parseLarkSubstituteManualScanRange({
        lookbackMinutes: "120",
        excludeRecentMinutes: "1",
      }),
    ).toEqual({
      ok: true,
      value: {
        lookbackMinutes: 120,
        excludeRecentMinutes: 1,
      },
    });
  });

  test("rejects an exclusion that consumes the whole scan window", () => {
    expect(
      parseLarkSubstituteManualScanRange({
        lookbackMinutes: "120",
        excludeRecentMinutes: "120",
      }),
    ).toEqual({
      ok: false,
      error: "排除最近必须是非负整数，并且小于扫描范围。",
    });
  });
});
