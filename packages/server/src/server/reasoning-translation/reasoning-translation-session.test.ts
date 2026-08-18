import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import { ReasoningTranslationSession } from "./reasoning-translation-session.js";
import type { ReasoningTranslationService } from "./reasoning-translation-service.js";

describe("ReasoningTranslationSession", () => {
  test("returns translated Chinese through the correlated response", async () => {
    const messages: unknown[] = [];
    const service = {
      translate: vi.fn(async () => "我应该检查代码仓库。"),
    } as unknown as ReasoningTranslationService;
    const session = new ReasoningTranslationSession({
      emit: (message) => messages.push(message),
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "reasoning.translate.request",
      requestId: "request-1",
      agentId: "agent-1",
      text: "I should inspect the repository.",
    });

    expect(messages).toEqual([
      {
        type: "reasoning.translate.response",
        payload: {
          requestId: "request-1",
          translatedText: "我应该检查代码仓库。",
          error: null,
        },
      },
    ]);
  });
});
