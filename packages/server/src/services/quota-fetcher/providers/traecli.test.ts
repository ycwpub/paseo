import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { UsageCommandRunner } from "../command.js";
import { TraeCliQuotaProvider } from "./traecli.js";

describe("TRAE CLI provider usage", () => {
  it("extracts model quota percentages from the model catalog", async () => {
    const runCommand: UsageCommandRunner = vi.fn(async () => ({
      stdout: JSON.stringify([
        {
          name: "openrouter-3o",
          description: "Context window: 936k, Queue heat: 8%, Quota: 12.5% used, resets weekly",
        },
        {
          name: "GPT-5.6",
          description: "Context window: 240k, Queue heat: 55%",
        },
      ]),
      stderr: "keyring warning",
    }));
    const provider = new TraeCliQuotaProvider({
      logger: createTestLogger(),
      runCommand,
    });

    await expect(provider.fetchUsage()).resolves.toMatchObject({
      providerId: "traecli",
      displayName: "TRAE CLI",
      status: "available",
      sourceLabel: "TRAE CLI",
      windows: [
        {
          id: "quota:openrouter-3o",
          label: "openrouter-3o · weekly",
          usedPct: 12.5,
          remainingPct: 87.5,
        },
      ],
      details: [
        { id: "models", value: "2" },
        { id: "quota_models", value: "1" },
      ],
    });
    expect(runCommand).toHaveBeenCalledWith("traecli", ["models", "--json"], expect.any(Object));
  });
});
