import { describe, expect, it } from "vitest";
import { PaseoProjectConfigSchema } from "./paseo-config-schema.js";

describe("PaseoProjectConfigSchema larkGroups", () => {
  it("accepts optional Project Lark group bindings", () => {
    expect(
      PaseoProjectConfigSchema.parse({
        larkGroups: [
          {
            id: "support",
            botId: "bot-1",
            chatId: "oc_support",
            enabled: true,
            messageLimit: 50,
          },
        ],
      }).larkGroups,
    ).toEqual([
      {
        id: "support",
        botId: "bot-1",
        chatId: "oc_support",
        enabled: true,
        messageLimit: 50,
      },
    ]);
  });
});
