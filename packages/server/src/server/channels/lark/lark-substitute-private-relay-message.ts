import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

function escapeLarkMentionAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function buildLarkSubstitutePrivateRelayMessage(event: NormalizedLarkMessageEvent): string {
  const sender = event.openId
    ? `<at user_id="${escapeLarkMentionAttribute(event.openId)}"></at>`
    : event.displayName.trim() || "飞书用户";
  return [`【替身私聊转发】${sender}`, event.text, "", `来源消息：${event.messageId}`].join("\n");
}
