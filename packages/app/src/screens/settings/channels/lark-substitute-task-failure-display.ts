import type { LarkSubstituteTaskFailureStage } from "@getpaseo/protocol/messages";

export function larkSubstituteFailureStageLabel(
  stage: LarkSubstituteTaskFailureStage | null,
): string {
  switch (stage) {
    case "listener":
      return "消息监听";
    case "group_scan":
      return "群消息扫描";
    case "private_scan":
      return "私聊扫描";
    case "processing":
      return "Agent 处理";
    case "reply":
      return "飞书回复";
    default:
      return "任务处理";
  }
}

export function larkSubstituteFailureAdvice(
  stage: LarkSubstituteTaskFailureStage | null,
  error: string,
): string {
  if (
    error.includes("99991400") ||
    error.includes("request trigger frequency limit") ||
    error.includes("请求过于频繁") ||
    error.includes("HTTP 429")
  ) {
    return "飞书接口触发限流，系统已自动限速并重试。请稍后点击“立刻执行一次扫描”，无需重新授权。";
  }
  if (
    error.includes("OAuth") ||
    error.includes("权限") ||
    error.includes("99991679") ||
    error.includes("重新授权")
  ) {
    return "请检查飞书用户 OAuth 权限，并点击下方“立即授权”完成授权后再次扫描。";
  }
  switch (stage) {
    case "listener":
      return "请检查机器人连接和事件订阅状态，修复后等待下一条消息或重新发送。";
    case "group_scan":
      return "请检查群聊读取权限、群白名单和机器人可见范围，修复后点击“立刻执行一次扫描”。";
    case "private_scan":
      return "请检查私聊搜索与消息读取权限，重新授权后点击“立刻执行一次扫描”。";
    case "processing":
      return "请检查 Provider、模型、助手或团队配置，并在修复后重新触发该消息。";
    case "reply":
      return "请检查机器人是否已加入群聊及消息发送权限，修复后重新触发该消息。";
    default:
      return "请根据错误详情修复配置后重新触发任务。";
  }
}
