import { describe, expect, it } from "vitest";

import type { AgentStreamEvent } from "./agent-sdk-types.js";
import { shouldPublishWhileForegroundRunIsPending } from "./pending-run-event-policy.js";

describe("shouldPublishWhileForegroundRunIsPending", () => {
  it("publishes compaction progress before the foreground turn starts", () => {
    expect(
      shouldPublishWhileForegroundRunIsPending({
        type: "timeline",
        provider: "codex",
        item: { type: "compaction", status: "loading", trigger: "auto" },
      }),
    ).toBe(true);
  });

  it("keeps ordinary turn events staged", () => {
    const event: AgentStreamEvent = {
      type: "timeline",
      provider: "codex",
      item: { type: "assistant_message", text: "not ready yet" },
    };
    expect(shouldPublishWhileForegroundRunIsPending(event)).toBe(false);
  });
});
