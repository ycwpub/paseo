import { describe, expect, test } from "vitest";

import {
  LarkGroupMessageProcessorCreateRequestSchema,
  LarkGroupMessageProcessorTaskScanRequestSchema,
} from "./group-processor-rpc-schemas.js";

describe("Lark group message processor RPC schemas", () => {
  test("accepts processor creation requests", () => {
    expect(
      LarkGroupMessageProcessorCreateRequestSchema.parse({
        type: "channel.lark.group_processor.create.request",
        requestId: "request-1",
        processor: {
          name: "研发群自动答疑",
          enabled: true,
          botId: "bot-1",
          filters: [],
          aiFilterPrompt: "仅处理明确的工作问题",
          replyPrompt: "直接回答问题",
          target: {
            kind: "workspace",
            cwd: "/tmp/project",
            workspaceId: null,
            projectId: null,
          },
        },
      }).type,
    ).toBe("channel.lark.group_processor.create.request");
  });

  test("accepts a manual compensation scan range", () => {
    expect(
      LarkGroupMessageProcessorTaskScanRequestSchema.parse({
        type: "channel.lark.group_processor_task.scan.request",
        requestId: "request-2",
        processorId: "processor-1",
        scanRange: {
          lookbackMinutes: 120,
          excludeRecentMinutes: 1,
        },
      }).scanRange,
    ).toEqual({
      lookbackMinutes: 120,
      excludeRecentMinutes: 1,
    });
  });
});
