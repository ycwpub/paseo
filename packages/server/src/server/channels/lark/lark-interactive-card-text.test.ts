import { describe, expect, it } from "vitest";
import { parseLarkInteractiveCardText } from "./lark-interactive-card-text.js";

describe("parseLarkInteractiveCardText", () => {
  it("reads json_card cards that store text and links under property nodes", () => {
    const text = parseLarkInteractiveCardText(
      JSON.stringify({
        json_card: JSON.stringify({
          body: {
            elements: [
              {
                tag: "markdown",
                property: {
                  elements: [
                    {
                      tag: "plain_text",
                      property: { content: "告警详情" },
                    },
                    {
                      tag: "a",
                      property: {
                        content: "查看",
                        url: "https://bamboo.bytedance.net/result-manage/6276?id=19562663",
                      },
                    },
                  ],
                },
              },
            ],
          },
          header: {
            tag: "card_header",
            property: {
              title: {
                tag: "plain_text",
                property: {
                  content:
                    "【数据监控-bamboo-NOTICE】【bamboo通知】分账-已开通结算规则，但分账未初始化",
                },
              },
            },
          },
        }),
        json_attachment: {},
        card_schema: 1,
      }),
    );

    expect(text).toContain("【数据监控-bamboo-NOTICE】");
    expect(text).toContain("告警详情");
    expect(text).toContain("id=19562663");
  });
});
