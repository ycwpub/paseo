import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      ["x", "models", "--json", "--codex", "--timeout", "15000"],
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
      ["x", "models", "--json", "--claude", "--timeout", "15000"],
      expect.any(Object),
    );
  });

  it("shows an actionable message when Aiden authentication fails", async () => {
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
      status: "unavailable",
      error: null,
      details: [
        {
          id: "aiden-login-required",
          value: "Aiden 登录状态不可用，请先在终端完成 Aiden 登录后重试。",
          tone: "warning",
        },
      ],
    });
  });

  it("treats missing quota data as neutral instead of claiming that Aiden has no models", async () => {
    const runCommand: UsageCommandRunner = vi.fn(async () => {
      const error = new Error("command failed") as Error & { stderr: string };
      error.stderr =
        "Command failed: aiden x models --json --claude --timeout 15000 - Aiden aiproxy models API returned an empty model list for claudecode.";
      throw error;
    });
    const provider = new AidenClaudeQuotaProvider({
      logger: createTestLogger(),
      runCommand,
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      providerId: "aiden-claude",
      status: "unavailable",
      sourceLabel: "Aiden X",
      error: null,
      details: [],
    });
  });

  it("keeps the last successful usage when a later refresh fails", async () => {
    const runCommand: UsageCommandRunner = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          fetched_at: "2026-08-29T00:00:00.000Z",
          models: [
            {
              id: "gpt-5.6",
              quota: { available_percent: 75 },
              ptu: null,
              capacity: null,
            },
          ],
        }),
        stderr: "",
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("command failed"), {
          stderr: "Aiden aiproxy models API returned an empty model list for codex.",
        }),
      );
    const provider = new AidenCodexQuotaProvider({
      logger: createTestLogger(),
      runCommand,
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      status: "available",
      windows: [{ id: "quota:gpt-5.6", usedPct: 25 }],
    });
    await expect(provider.fetchUsage()).resolves.toMatchObject({
      status: "available",
      sourceLabel: "Aiden X（缓存）",
      windows: [{ id: "quota:gpt-5.6", usedPct: 25 }],
      details: [
        {
          id: "aiden-cache-status",
          label: "数据状态",
          value: "暂时显示最近一次成功获取的数据",
          tone: "warning",
        },
      ],
      error: null,
    });
  });

  it("handles a successful response with no models as unavailable quota data", async () => {
    const provider = new AidenCodexQuotaProvider({
      logger: createTestLogger(),
      runCommand: commandReturning({ models: [] }),
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      status: "unavailable",
      error: null,
      details: [],
    });
  });

  it("does not report a usable model without quota fields as a provider failure", async () => {
    const provider = new AidenCodexQuotaProvider({
      logger: createTestLogger(),
      runCommand: commandReturning({
        fetched_at: "2026-08-30T01:00:00.000Z",
        models: [
          {
            id: "[custom]gpt-5.5",
            quota: null,
            ptu: null,
            capacity: null,
          },
        ],
      }),
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      providerId: "aiden-codex",
      status: "unavailable",
      sourceLabel: "Aiden X",
      fetchedAt: "2026-08-30T01:00:00.000Z",
      error: null,
      details: [],
    });
  });

  it("persists the last successful usage and restores it after a daemon restart", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "paseo-aiden-usage-"));
    const cacheFilePath = join(tempRoot, "aiden-codex.json");
    try {
      const firstProvider = new AidenCodexQuotaProvider({
        logger: createTestLogger(),
        cacheFilePath,
        runCommand: commandReturning({
          fetched_at: "2026-08-29T03:00:00.000Z",
          models: [
            {
              id: "gpt-5.6",
              quota: { available_percent: 60 },
              ptu: null,
              capacity: null,
            },
          ],
        }),
      });

      await expect(firstProvider.fetchUsage()).resolves.toMatchObject({
        status: "available",
        windows: [{ id: "quota:gpt-5.6", usedPct: 40 }],
      });
      await expect(readFile(cacheFilePath, "utf8")).resolves.toContain('"version": 1');

      const secondProvider = new AidenCodexQuotaProvider({
        logger: createTestLogger(),
        cacheFilePath,
        runCommand: vi.fn(async () => {
          throw Object.assign(new Error("command failed"), {
            stderr: "Interactive ByteCloud Auth login is required but no TTY is available.",
          });
        }),
      });

      await expect(secondProvider.fetchUsage()).resolves.toMatchObject({
        status: "available",
        sourceLabel: "Aiden X（缓存）",
        fetchedAt: "2026-08-29T03:00:00.000Z",
        windows: [{ id: "quota:gpt-5.6", usedPct: 40 }],
        details: [
          {
            id: "aiden-cache-status",
            value: "暂时显示最近一次成功获取的数据",
          },
        ],
        error: null,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not reuse a cache file belonging to the other Aiden provider", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "paseo-aiden-usage-"));
    const cacheFilePath = join(tempRoot, "aiden.json");
    try {
      const codexProvider = new AidenCodexQuotaProvider({
        logger: createTestLogger(),
        cacheFilePath,
        runCommand: commandReturning({
          models: [
            {
              id: "gpt-5.6",
              quota: { available_percent: 60 },
              ptu: null,
              capacity: null,
            },
          ],
        }),
      });
      await codexProvider.fetchUsage();

      const claudeProvider = new AidenClaudeQuotaProvider({
        logger: createTestLogger(),
        cacheFilePath,
        runCommand: vi.fn(async () => {
          throw Object.assign(new Error("command failed"), {
            stderr: "Aiden aiproxy models API returned an empty model list for claudecode.",
          });
        }),
      });

      await expect(claudeProvider.fetchUsage()).resolves.toMatchObject({
        providerId: "aiden-claude",
        status: "unavailable",
        details: [],
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
