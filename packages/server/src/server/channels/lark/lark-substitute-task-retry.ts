import type {
  LarkSubstituteTask,
  LarkSubstituteTaskFailureStage,
} from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

export function isLarkSubstituteOperationalFailure(task: LarkSubstituteTask): boolean {
  return (
    (task.failureStage === "group_scan" || task.failureStage === "private_scan") &&
    task.messageId.startsWith(`${task.source}-failure:`)
  );
}

export function createLarkSubstituteRetryEvent(
  task: LarkSubstituteTask,
): NormalizedLarkMessageEvent {
  return {
    eventId: `substitute-retry:${task.id}`,
    messageId: task.messageId,
    chatId: task.chatId,
    chatType: task.source === "private_scan" ? "p2p" : "group",
    messageType: "text",
    threadId: null,
    rootMessageId: null,
    openId: task.senderOpenId,
    unionId: null,
    displayName: task.senderName ?? "",
    topicName: task.chatName ?? task.modeName,
    text: task.content,
    createTime: Date.parse(task.createdAt),
    mentions: undefined,
  };
}

export function retryFailureStage(task: LarkSubstituteTask): LarkSubstituteTaskFailureStage {
  return task.failureStage ?? (task.source === "private_scan" ? "private_scan" : "processing");
}
