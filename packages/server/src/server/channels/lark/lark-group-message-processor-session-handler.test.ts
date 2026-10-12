import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import type {
  LarkGroupMessageProcessor,
  LarkGroupMessageProcessorCreateInput,
} from "@getpaseo/protocol/messages";

import type { LarkChannelService } from "./lark-channel-service.js";
import { LarkChannelSession } from "./lark-channel-session.js";

const input: LarkGroupMessageProcessorCreateInput = {
  name: "研发群自动答疑",
  enabled: true,
  botId: "bot-1",
  filters: [],
  aiFilterPrompt: "",
  replyPrompt: "回答问题",
  target: {
    kind: "workspace",
    cwd: "/repo",
    workspaceId: null,
    projectId: null,
    provider: "claude",
    model: null,
  },
};

function processor(value: LarkGroupMessageProcessorCreateInput): LarkGroupMessageProcessor {
  return {
    id: "processor-1",
    ...value,
    realtime: value.realtime ?? { enabled: true, delaySeconds: 60 },
    scan: value.scan ?? {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    },
    context: value.context ?? { previousMessageCount: 10, followingMessageCount: 10 },
    autoArchiveAgent: value.autoArchiveAgent ?? true,
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
}

describe("Lark group message processor session handler", () => {
  test("creates a processor and returns the refreshed list", async () => {
    let processors: LarkGroupMessageProcessor[] = [];
    const service = {
      createGroupMessageProcessor: vi.fn((value: LarkGroupMessageProcessorCreateInput) => {
        const created = processor(value);
        processors = [created];
        return created;
      }),
      listGroupMessageProcessors: vi.fn(() => processors),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.group_processor.create.request",
      requestId: "create",
      processor: input,
    });

    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.group_processor.create.response",
      payload: {
        requestId: "create",
        processor: expect.objectContaining({ id: "processor-1", name: "研发群自动答疑" }),
        processors: [expect.objectContaining({ id: "processor-1" })],
        error: null,
      },
    });
  });
});
