import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replyLarkSubstitute = vi.fn(async () => ({
  requestId: "req-1",
  reply: {
    agentId: "agent-1",
    taskId: "task-1",
    modeId: "mode-1",
    projectId: "project-1",
    botId: "bot-1",
    chatId: "oc-relay",
    threadId: "omt-topic",
    messageId: "om-reply",
  },
  error: null,
}));
const close = vi.fn(async () => undefined);

vi.mock("../../utils/client.js", () => ({
  buildDaemonConnectionCommandError: vi.fn(({ error }: { error: unknown }) => error),
  connectToDaemon: vi.fn(async () => ({
    replyLarkSubstitute,
    close,
  })),
}));

import { createSubstituteCommand } from "./index.js";
import {
  resolveSubstituteReplyAgentId,
  resolveSubstituteReplyText,
  runSubstituteReplyCommand,
} from "./reply.js";

const temporaryDirectories: string[] = [];
const originalAgentId = process.env.PASEO_AGENT_ID;

beforeEach(() => {
  process.env.PASEO_AGENT_ID = "agent-1";
  vi.clearAllMocks();
});

afterEach(async () => {
  if (originalAgentId === undefined) {
    delete process.env.PASEO_AGENT_ID;
  } else {
    process.env.PASEO_AGENT_ID = originalAgentId;
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("substitute reply command", () => {
  it("registers the reply subcommand", () => {
    expect(createSubstituteCommand().commands.map((command) => command.name())).toEqual(["reply"]);
  });

  it("reads the current Agent identity from Paseo-managed environment", () => {
    expect(resolveSubstituteReplyAgentId({ PASEO_AGENT_ID: " agent-1 " })).toBe("agent-1");
    expect(() => resolveSubstituteReplyAgentId({})).toThrow(
      expect.objectContaining({ code: "MISSING_AGENT_CONTEXT" }),
    );
  });

  it("accepts either inline text or one message file", async () => {
    expect(await resolveSubstituteReplyText(" 最终答复 ", undefined)).toBe("最终答复");

    const directory = await mkdtemp(path.join(tmpdir(), "paseo-substitute-reply-"));
    temporaryDirectories.push(directory);
    const messageFile = path.join(directory, "reply.txt");
    await writeFile(messageFile, " 文件中的最终答复 \n");
    expect(await resolveSubstituteReplyText(undefined, messageFile)).toBe("文件中的最终答复");

    await expect(resolveSubstituteReplyText("答复", messageFile)).rejects.toMatchObject({
      code: "INVALID_OPTIONS",
    });
  });

  it("sends the optimized answer using the current substitute Agent", async () => {
    const result = await runSubstituteReplyCommand(" 优化后的答案 ", {}, {} as never);

    expect(replyLarkSubstitute).toHaveBeenCalledWith({
      agentId: "agent-1",
      text: "优化后的答案",
    });
    expect(result.data).toMatchObject({
      agentId: "agent-1",
      taskId: "task-1",
      projectId: "project-1",
      chatId: "oc-relay",
      threadId: "omt-topic",
      messageId: "om-reply",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("surfaces the server rejection and still closes the daemon connection", async () => {
    replyLarkSubstitute.mockResolvedValueOnce({
      requestId: "req-2",
      reply: null,
      error: "当前 Agent 不属于替身任务",
    });

    await expect(runSubstituteReplyCommand("优化后的答案", {}, {} as never)).rejects.toMatchObject({
      code: "SUBSTITUTE_REPLY_FAILED",
      message: expect.stringContaining("当前 Agent 不属于替身任务"),
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
