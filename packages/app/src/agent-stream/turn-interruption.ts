import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";

import { i18n } from "@/i18n/i18next";

type TurnCanceledEvent = Extract<AgentStreamEventPayload, { type: "turn_canceled" }>;

export function getTurnInterruptionMessage(_event: TurnCanceledEvent): string {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return language.startsWith("zh")
    ? "本次执行已中断，尚未完成。如果不是你主动中断，请继续或重新发送指令。"
    : "This run was interrupted before it finished. If you did not stop it, continue or resend the instruction.";
}
