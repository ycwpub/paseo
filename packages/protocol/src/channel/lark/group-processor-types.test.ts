import { describe, expect, test } from "vitest";

import {
  DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT,
  DEFAULT_LARK_GROUP_PROCESSOR_DELAY_SECONDS,
  LarkGroupMessageProcessorCreateInputSchema,
} from "./group-processor-types.js";

describe("Lark group message processor types", () => {
  test("applies realtime, scan, context, and archive defaults", () => {
    const processor = LarkGroupMessageProcessorCreateInputSchema.parse({
      name: "研发群自动答疑",
      enabled: true,
      botId: "bot-1",
      filters: [],
      aiFilterPrompt: "",
      replyPrompt: "结合上下文回答工作问题",
      target: {
        kind: "workspace",
        cwd: "/tmp/project",
        workspaceId: null,
        projectId: null,
      },
    });

    expect(processor.realtime).toEqual({
      enabled: true,
      delaySeconds: DEFAULT_LARK_GROUP_PROCESSOR_DELAY_SECONDS,
    });
    expect(processor.scan).toEqual({
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    });
    expect(processor.context).toEqual({
      previousMessageCount: DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT,
      followingMessageCount: DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT,
    });
    expect(processor.autoArchiveAgent).toBe(true);
  });

  test("rejects unsupported operators for a filter field", () => {
    expect(() =>
      LarkGroupMessageProcessorCreateInputSchema.parse({
        name: "研发群自动答疑",
        enabled: true,
        botId: "bot-1",
        filters: [
          {
            id: "filter-1",
            effect: "include",
            field: "sender_open_id",
            operator: "contains",
            value: "ou_123",
          },
        ],
        aiFilterPrompt: "",
        replyPrompt: "回答问题",
        target: {
          kind: "workspace",
          cwd: "/tmp/project",
          workspaceId: null,
          projectId: null,
        },
      }),
    ).toThrow();
  });
});
