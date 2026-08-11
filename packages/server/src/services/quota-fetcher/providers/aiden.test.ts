import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { UsageCommandRunner } from "../command.js";
import { AidenClaudeQuotaProvider, AidenCodexQuotaProvider } from "./aiden.js";

function commandReturning(payload: unknown): UsageCommandRunner {
  return vi.fn(async () => ({
    stdout: JSON.stringify(payload),
    stderr: "",
  }));
}

describe("Aiden provider usage", () => {
  it("reads Codex model quotas from the Aiden JSON command", async () => {
    const runCommand = commandReturning({
      schema_version: 1,
      fetched_at: "2026-07-31T01:00:00.000Z",
      models: [
        {
          cli_type: "codex",
          id: "gpt-5.6",
          quota: {
            available_tokens: 800,
            available_percent: 80,
            reset_time: "2026-08-01T00:00:00Z",
          },
          ptu: null,
          capacity: { occupancy_percent: 42 },
        },
      ],
    });
    const provider = new AidenCodexQuotaProvider({
      logger: createTestLogger(),
      runCommand,
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      providerId: "aiden-codex",
      displayName: "Aiden Codex",
      status: "available",
      sourceLabel: "Aiden X",
      fetchedAt: "2026-07-31T01:00:00.000Z",
      windows: [
        {
          id: "quota:gpt-5.6",
          label: "gpt-5.6",
          usedPct: 20,
          remainingPct: 80,
          resetsAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      balances: [
        {
          id: "tokens:gpt-5.6",
          remaining: 800,
          unit: "tokens",
        },
      ],
      details: [
        {
          id: "capacity:gpt-5.6",
          value: "42%",
        },
      ],
    });
    expect(runCommand).toHaveBeenCalledWith(
      "aiden",
      ["x", "models", "--json", "--codex", "--no-cache", "--timeout", "15000"],
      expect.any(Object),
    );
  });

  it("uses the Claude filter and exposes PTU availability", async () => {
    const runCommand = commandReturning({
      models: [
        {
          id: "aiden-d1s",
          quota: null,
          ptu: { available_percent: 65, occupancy_percent: 35 },
          capacity: null,
        },
      ],
    });
    const provider = new AidenClaudeQuotaProvider({
      logger: createTestLogger(),
      runCommand,
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      providerId: "aiden-claude",
      windows: [
        {
          id: "ptu:aiden-d1s",
          label: "aiden-d1s · PTU",
          usedPct: 35,
          remainingPct: 65,
        },
      ],
    });
    expect(runCommand).toHaveBeenCalledWith(
      "aiden",
      ["x", "models", "--json", "--claude", "--no-cache", "--timeout", "15000"],
      expect.any(Object),
    );
  });

  it("keeps the provider visible when Aiden authentication fails", async () => {
    const runCommand: UsageCommandRunner = vi.fn(async () => {
      const error = new Error("command failed") as Error & { stderr: string };
      error.stderr = "Login required";
      throw error;
    });
    const provider = new AidenCodexQuotaProvider({
      logger: createTestLogger(),
      runCommand,
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      providerId: "aiden-codex",
      status: "error",
      error: "Login required",
    });
  });
});
