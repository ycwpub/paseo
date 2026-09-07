import type { LarkChannelBotInfo } from "./lark-client-adapter.js";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

export const MAX_LARK_SUBSTITUTE_BOT_REPLIES = 5;

const BOT_REPLY_CHAIN_TTL_MS = 24 * 60 * 60 * 1_000;

interface BotReplyChainState {
  count: number;
  updatedAt: number;
}

export interface LarkSubstituteBotReplyClaim {
  allowed: boolean;
  count: number;
  maxReplies: number;
}

export function isLarkBotAuthoredMessage(event: NormalizedLarkMessageEvent): boolean {
  const senderType = event.senderType?.trim().toLocaleLowerCase();
  return senderType === "app" || senderType === "bot";
}

export function isLarkMessageFromCurrentBot(
  event: NormalizedLarkMessageEvent,
  bot: Pick<LarkChannelBotInfo, "openId" | "appId"> | null,
  configuredAppId: string | null,
): boolean {
  if (!isLarkBotAuthoredMessage(event)) return false;
  const currentAppId = configuredAppId?.trim() || bot?.appId?.trim() || null;
  if (currentAppId && event.senderAppId) {
    return currentAppId === event.senderAppId;
  }
  return Boolean(bot?.openId && event.openId && bot.openId === event.openId);
}

function getBotReplyChainKey(event: NormalizedLarkMessageEvent): string {
  return `${event.chatId}:${event.rootMessageId ?? event.messageId}`;
}

export class LarkSubstituteBotLoopGuard {
  private readonly chains = new Map<string, BotReplyChainState>();

  resetForHumanMessage(event: NormalizedLarkMessageEvent): void {
    if (isLarkBotAuthoredMessage(event)) return;
    this.chains.delete(getBotReplyChainKey(event));
  }

  claimBotReply(
    event: NormalizedLarkMessageEvent,
    now: number = Date.now(),
  ): LarkSubstituteBotReplyClaim {
    this.deleteExpired(now);
    const key = getBotReplyChainKey(event);
    const current = this.chains.get(key)?.count ?? 0;
    if (current >= MAX_LARK_SUBSTITUTE_BOT_REPLIES) {
      return {
        allowed: false,
        count: current,
        maxReplies: MAX_LARK_SUBSTITUTE_BOT_REPLIES,
      };
    }
    const count = current + 1;
    this.chains.set(key, { count, updatedAt: now });
    return {
      allowed: true,
      count,
      maxReplies: MAX_LARK_SUBSTITUTE_BOT_REPLIES,
    };
  }

  private deleteExpired(now: number): void {
    for (const [key, state] of this.chains) {
      if (now - state.updatedAt > BOT_REPLY_CHAIN_TTL_MS) {
        this.chains.delete(key);
      }
    }
  }
}
