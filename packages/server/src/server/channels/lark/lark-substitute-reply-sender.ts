import type { StoredLarkChannelConfig } from "./lark-channel-store.js";
import type { LarkChannelClientAdapter, LarkThreadReplyResult } from "./lark-client-adapter.js";
import type { LarkSubstituteTrigger } from "./lark-message-format.js";

export class LarkSubstituteReplySender {
  constructor(
    private readonly adapter: Pick<
      LarkChannelClientAdapter,
      "replyToMessageInThread" | "replyInThread"
    >,
  ) {}

  replyToMessageInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
    _trigger: LarkSubstituteTrigger | null,
  ): Promise<LarkThreadReplyResult> {
    return this.adapter.replyToMessageInThread(config, messageId, text);
  }

  replyInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
    _trigger: LarkSubstituteTrigger | null,
  ): Promise<LarkThreadReplyResult> {
    return this.adapter.replyInThread(config, messageId, text);
  }
}
