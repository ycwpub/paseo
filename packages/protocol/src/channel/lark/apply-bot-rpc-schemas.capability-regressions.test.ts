import { describe, expect, test } from "vitest";
import { LarkChannelApplyBotRequestSchema } from "./rpc-schemas.js";

describe("Lark apply bot RPC schema", () => {
  test("keeps the legacy create request compatible", () => {
    expect(
      LarkChannelApplyBotRequestSchema.parse({
        type: "channel.lark.apply_bot.request",
        requestId: "request-create",
        name: "Paseo 机器人",
      }),
    ).toEqual({
      type: "channel.lark.apply_bot.request",
      requestId: "request-create",
      name: "Paseo 机器人",
    });
  });

  test("accepts an existing application when updating bot permissions", () => {
    expect(
      LarkChannelApplyBotRequestSchema.parse({
        type: "channel.lark.apply_bot.request",
        requestId: "request-update",
        appId: "cli_existing",
        botId: "bot-existing",
      }),
    ).toEqual({
      type: "channel.lark.apply_bot.request",
      requestId: "request-update",
      appId: "cli_existing",
      botId: "bot-existing",
    });
  });
});
