import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import type {
  CommandError,
  CommandOptions,
  OutputSchema,
  SingleResult,
} from "../../output/index.js";
import { buildDaemonConnectionCommandError, connectToDaemon } from "../../utils/client.js";

export interface SubstituteReplyOptions extends CommandOptions {
  messageFile?: string;
}

export interface SubstituteReplyResult {
  agentId: string;
  taskId: string;
  modeId: string;
  projectId: string;
  botId: string;
  chatId: string;
  threadId: string;
  messageId: string | null;
}

export const substituteReplySchema: OutputSchema<SubstituteReplyResult> = {
  idField: "taskId",
  columns: [
    { header: "MESSAGE ID", field: "messageId" },
    { header: "TASK ID", field: "taskId" },
    { header: "MODE ID", field: "modeId" },
    { header: "PROJECT ID", field: "projectId" },
    { header: "CHAT ID", field: "chatId" },
    { header: "THREAD ID", field: "threadId" },
    { header: "AGENT ID", field: "agentId" },
    { header: "BOT ID", field: "botId" },
  ],
};

export function resolveSubstituteReplyAgentId(
  env: { PASEO_AGENT_ID?: string } = process.env,
): string {
  const agentId = env.PASEO_AGENT_ID?.trim();
  if (agentId) return agentId;
  throw {
    code: "MISSING_AGENT_CONTEXT",
    message: "当前命令只能由替身任务 Agent 调用",
    details: "Paseo 会自动向替身任务 Agent 注入 PASEO_AGENT_ID，无需手动设置。",
  } satisfies CommandError;
}

export async function resolveSubstituteReplyText(
  message: string | undefined,
  messageFile: string | undefined,
  readTextFile: (filePath: string) => Promise<string> = (filePath) => readFile(filePath, "utf8"),
): Promise<string> {
  const inlineMessage = message?.trim() ?? "";
  const filePath = messageFile?.trim() ?? "";
  if (inlineMessage && filePath) {
    throw {
      code: "INVALID_OPTIONS",
      message: "不能同时传入消息正文和 --message-file",
    } satisfies CommandError;
  }
  if (!inlineMessage && !filePath) {
    throw {
      code: "MISSING_MESSAGE",
      message: "请传入回复正文，或使用 --message-file 指定正文文件",
    } satisfies CommandError;
  }
  if (inlineMessage) return inlineMessage;

  const absolutePath = path.resolve(filePath);
  let contents: string;
  try {
    contents = await readTextFile(absolutePath);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    throw {
      code: "MESSAGE_FILE_READ_FAILED",
      message: `无法读取回复文件：${absolutePath}`,
      details: messageText,
    } satisfies CommandError;
  }
  const trimmed = contents.trim();
  if (!trimmed) {
    throw {
      code: "EMPTY_MESSAGE",
      message: `回复文件为空：${absolutePath}`,
    } satisfies CommandError;
  }
  return trimmed;
}

export async function runSubstituteReplyCommand(
  message: string | undefined,
  options: SubstituteReplyOptions,
  _command: Command,
): Promise<SingleResult<SubstituteReplyResult>> {
  const agentId = resolveSubstituteReplyAgentId();
  const text = await resolveSubstituteReplyText(message, options.messageFile);
  const client = await connectToDaemon({ host: options.host }).catch((error: unknown) => {
    throw buildDaemonConnectionCommandError({ host: options.host, error });
  });

  try {
    const payload = await client.replyLarkSubstitute({ agentId, text });
    if (payload.error) {
      throw new Error(payload.error);
    }
    if (!payload.reply) {
      throw new Error("服务端未返回替身回复结果");
    }
    return {
      type: "single",
      data: payload.reply,
      schema: substituteReplySchema,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    const messageText = error instanceof Error ? error.message : String(error);
    throw {
      code: "SUBSTITUTE_REPLY_FAILED",
      message: `重新发送替身回复失败：${messageText}`,
    } satisfies CommandError;
  } finally {
    await client.close().catch(() => undefined);
  }
}
