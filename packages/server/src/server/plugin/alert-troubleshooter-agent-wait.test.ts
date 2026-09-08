import { describe, expect, it, vi } from "vitest";
import { waitForAlertTroubleshooterAgent } from "./alert-troubleshooter-agent-wait.js";

describe("waitForAlertTroubleshooterAgent", () => {
  it("cancels and rejects when the agent exceeds the deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(async () => undefined);
    const result = waitForAlertTroubleshooterAgent({
      agentId: "agent-timeout",
      wait: () => new Promise(() => undefined),
      cancel,
      timeoutMs: 1_000,
    });
    const assertion = expect(result).rejects.toThrow("排查 Agent agent-timeout 超过 1 秒未结束");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
