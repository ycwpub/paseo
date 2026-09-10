import type {
  LarkSubstituteMode,
  LarkSubstituteReplyResult,
  LarkSubstituteTask,
} from "@getpaseo/protocol/messages";
import { createRealpathAwarePathMatcher } from "../../../utils/path.js";
import type {
  LarkChannelConversation,
  StoredLarkChannelBot,
  StoredLarkChannelConfig,
} from "./lark-channel-store.js";
import {
  extractLarkUserMentionDirective,
  formatLarkSubstituteReply,
  type LarkSubstituteTrigger,
} from "./lark-message-format.js";
import { resolveLarkTargetProjectId } from "./lark-project-target.js";

export class LarkSubstituteAgentReplyError extends Error {
  constructor(
    public readonly code:
      | "AGENT_NOT_FOUND"
      | "TASK_NOT_FOUND"
      | "MODE_NOT_FOUND"
      | "PROJECT_MISMATCH"
      | "CONVERSATION_NOT_FOUND"
      | "BOT_NOT_FOUND"
      | "SEND_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "LarkSubstituteAgentReplyError";
  }
}

interface LarkSubstituteReplyAgent {
  cwd: string;
}

interface LarkSubstituteReplySendResult {
  threadId: string | null;
  messageId: string | null;
}

export interface LarkSubstituteAgentReplyDependencies {
  paseoHome: string;
  listTasks(): LarkSubstituteTask[];
  getMode(modeId: string): LarkSubstituteMode | null;
  getBots(): StoredLarkChannelBot[];
  getAgent(agentId: string): Promise<LarkSubstituteReplyAgent | null>;
  send(input: {
    botId: string;
    config: StoredLarkChannelConfig;
    replyMessageId: string;
    text: string;
    mentionOpenId: string | null;
  }): Promise<LarkSubstituteReplySendResult | null>;
  markOutbound(input: {
    botId: string;
    agentId: string;
    chatId: string;
    threadId: string;
    outboundAt: string;
  }): void;
}

interface BoundConversation {
  bot: StoredLarkChannelBot;
  conversation: LarkChannelConversation;
}

function latestTaskForAgent(
  tasks: readonly LarkSubstituteTask[],
  agentId: string,
): LarkSubstituteTask | null {
  return (
    tasks
      .filter((task) => task.agentId === agentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  );
}

function latestConversationForAgent(
  bots: readonly StoredLarkChannelBot[],
  agentId: string,
  botId: string,
): BoundConversation | null {
  const bot = bots.find((entry) => entry.id === botId);
  if (!bot) return null;
  const conversation =
    bot.conversations
      .filter((entry) => entry.agentId === agentId)
      .sort((left, right) => right.lastInboundAt.localeCompare(left.lastInboundAt))[0] ?? null;
  return conversation ? { bot, conversation } : null;
}

function substituteTrigger(mode: LarkSubstituteMode, openId: string | null): LarkSubstituteTrigger {
  const resolvedOpenId = openId ?? "unknown";
  return {
    source: "configured_target",
    configuredTarget: {
      openId: resolvedOpenId,
      name: null,
    },
    observedMention: {
      key: null,
      name: null,
      openId: resolvedOpenId,
      userId: null,
      appId: null,
      idType: "open_id",
    },
    modeId: mode.id,
    disclosure: mode.disclosure,
  };
}

function formatOptimizedReply(
  text: string,
  mode: LarkSubstituteMode,
  openId: string | null,
): string {
  const trimmed = extractLarkUserMentionDirective(text).text.trim();
  const disclosure = mode.disclosure.prompt.trim();
  if (mode.disclosure.enabled && disclosure && trimmed.startsWith(disclosure)) {
    return trimmed;
  }
  return formatLarkSubstituteReply(trimmed, substituteTrigger(mode, openId));
}

function mentionOpenId(
  task: LarkSubstituteTask,
  conversation: LarkChannelConversation,
): string | null {
  if (task.senderOpenId) return task.senderOpenId;
  const prefix = "lark-user:";
  return conversation.userId.startsWith(prefix) ? conversation.userId.slice(prefix.length) : null;
}

export async function sendLarkSubstituteAgentReply(
  dependencies: LarkSubstituteAgentReplyDependencies,
  input: { agentId: string; text: string },
): Promise<LarkSubstituteReplyResult> {
  const agent = await dependencies.getAgent(input.agentId);
  if (!agent) {
    throw new LarkSubstituteAgentReplyError(
      "AGENT_NOT_FOUND",
      `找不到当前 Agent：${input.agentId}`,
    );
  }

  const task = latestTaskForAgent(dependencies.listTasks(), input.agentId);
  if (!task) {
    throw new LarkSubstituteAgentReplyError(
      "TASK_NOT_FOUND",
      "当前 Agent 不属于替身任务，不能发送替身回复",
    );
  }
  const mode = dependencies.getMode(task.modeId);
  if (!mode) {
    throw new LarkSubstituteAgentReplyError("MODE_NOT_FOUND", "对应的替身模式已不存在");
  }
  const projectId = resolveLarkTargetProjectId(mode.target, dependencies.paseoHome);
  const targetCwd = mode.target.cwd?.trim();
  if (!projectId || !targetCwd || !createRealpathAwarePathMatcher(targetCwd)(agent.cwd)) {
    throw new LarkSubstituteAgentReplyError(
      "PROJECT_MISMATCH",
      "当前 Agent 不属于该替身模式绑定的 Project",
    );
  }

  const binding = latestConversationForAgent(dependencies.getBots(), input.agentId, task.botId);
  if (!binding) {
    throw new LarkSubstituteAgentReplyError(
      "CONVERSATION_NOT_FOUND",
      "替身任务尚未创建可回复的飞书话题",
    );
  }
  if (!binding.bot.config.enabled) {
    throw new LarkSubstituteAgentReplyError("BOT_NOT_FOUND", "替身模式绑定的飞书机器人未启用");
  }

  const replyMessageId = binding.conversation.rootMessageId ?? binding.conversation.threadId.trim();
  const sent = await dependencies.send({
    botId: binding.bot.id,
    config: binding.bot.config,
    replyMessageId,
    text: formatOptimizedReply(input.text, mode, task.senderOpenId),
    mentionOpenId: mentionOpenId(task, binding.conversation),
  });
  if (!sent) {
    throw new LarkSubstituteAgentReplyError("SEND_FAILED", "发送优化后的替身回复失败");
  }

  const threadId = sent.threadId ?? binding.conversation.threadId;
  dependencies.markOutbound({
    botId: binding.bot.id,
    agentId: input.agentId,
    chatId: binding.conversation.chatId,
    threadId,
    outboundAt: new Date().toISOString(),
  });
  return {
    agentId: input.agentId,
    taskId: task.id,
    modeId: mode.id,
    projectId,
    botId: binding.bot.id,
    chatId: binding.conversation.chatId,
    threadId,
    messageId: sent.messageId,
  };
}
