import { describe, expect, test } from "vitest";
import pino from "pino";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import { MemorySession, type MemoryController } from "./memory-session.js";

function state(enabled: boolean): PaseoMemoryState {
  return {
    settings: {
      enabled,
      autoExtract: true,
      maxInjectedChars: 8_000,
      maxRetrievedDetails: 3,
    },
    summary: "",
    summaryPath: "/tmp/summary.md",
    details: [],
    stats: {
      detailCount: 0,
      pendingExtractions: 0,
      lastExtractedAt: null,
      lastExtractionError: null,
    },
  };
}

describe("MemorySession", () => {
  test("returns updated memory through the correlated RPC response", async () => {
    let current = state(false);
    const controller: MemoryController = {
      getState: () => current,
      update: (input) => {
        current = { ...current, settings: input.settings ?? current.settings };
        return current;
      },
      clear: () => current,
    };
    const messages: unknown[] = [];
    const session = new MemorySession({
      emit: (message) => messages.push(message),
      service: controller,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "memory.update_state.request",
      requestId: "request-1",
      update: { settings: { ...current.settings, enabled: true } },
    });

    expect(messages).toEqual([
      {
        type: "memory.update_state.response",
        payload: {
          requestId: "request-1",
          memory: state(true),
          error: null,
        },
      },
    ]);
  });
});
