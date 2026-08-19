import { describe, expect, test } from "vitest";
import {
  ReasoningTranslateRequestSchema,
  ReasoningTranslateResponseSchema,
} from "./rpc-schemas.js";

describe("reasoning translation RPC schemas", () => {
  test("accepts a correlated Aiden reasoning translation request", () => {
    expect(
      ReasoningTranslateRequestSchema.parse({
        type: "reasoning.translate.request",
        requestId: "request-1",
        agentId: "agent-1",
        text: "Inspect the repository.",
      }),
    ).toMatchObject({
      agentId: "agent-1",
      text: "Inspect the repository.",
    });
  });

  test("accepts a Chinese translation response", () => {
    expect(
      ReasoningTranslateResponseSchema.parse({
        type: "reasoning.translate.response",
        payload: {
          requestId: "request-1",
          translatedText: "检查代码仓库。",
          error: null,
        },
      }),
    ).toMatchObject({
      payload: { translatedText: "检查代码仓库。" },
    });
  });
});
