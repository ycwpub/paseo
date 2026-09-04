import type { StoredLarkChannelConfig } from "./lark-channel-store.js";
import type { LarkChannelClientAdapter, LarkThreadReplyResult } from "./lark-client-adapter.js";
import type { LarkSubstituteTrigger } from "./lark-message-format.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

export class LarkSubstituteReplySender {
  constructor(
    private readonly adapter: Pick<
      LarkChannelClientAdapter,
      | "replyToMessageInThread"
      | "replyToMessageInThreadAsUser"
      | "replyInThread"
      | "replyInThreadAsUser"
    >,
    private readonly userOAuthService: Pick<LarkUserOAuthService, "getValidUserAccessToken"> | null,
  ) {}

  replyToMessageInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
    trigger: LarkSubstituteTrigger | null,
  ): Promise<LarkThreadReplyResult> {
    if (trigger?.replyIdentity !== "user") {
      return this.adapter.replyToMessageInThread(config, messageId, text);
    }
    return this.replyAsUser(config, messageId, text, this.adapter.replyToMessageInThreadAsUser);
  }

  replyInThread(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
    trigger: LarkSubstituteTrigger | null,
  ): Promise<LarkThreadReplyResult> {
    if (trigger?.replyIdentity !== "user") {
      return this.adapter.replyInThread(config, messageId, text);
    }
    return this.replyAsUser(config, messageId, text, this.adapter.replyInThreadAsUser);
  }

  private async replyAsUser(
    config: StoredLarkChannelConfig,
    messageId: string,
    text: string,
    sender:
      | ((
          config: StoredLarkChannelConfig,
          messageId: string,
          text: string,
          userAccessToken: string,
        ) => Promise<LarkThreadReplyResult>)
      | undefined,
  ): Promise<LarkThreadReplyResult> {
    if (!config.appId || !this.userOAuthService || !sender) {
      throw new Error("替身模式使用用户身份回复前，需要先完成飞书用户 OAuth 授权");
    }
    const token = await this.userOAuthService.getValidUserAccessToken(config.appId);
    return sender.call(this.adapter, config, messageId, text, token);
  }
}
