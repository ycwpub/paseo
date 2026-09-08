import { describe, expect, it, vi } from "vitest";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import {
  expandLarkMergedForwardMessage,
  resolveLarkMergedForwardMessage,
} from "./lark-merged-forward-message.js";
import { normalizeLarkMessageEvent } from "./lark-message-format.js";

const PARENT_TIME = 1788861543000;

function parentEvent() {
  const event = normalizeLarkMessageEvent({
    event_id: "evt_parent",
    sender: {
      sender_name: "袁昌旺",
      sender_id: { open_id: "ou_sender" },
    },
    message: {
      message_id: "om_parent",
      chat_id: "oc_target",
      chat_type: "group",
      message_type: "merge_forward",
      create_time: String(PARENT_TIME),
      content: "Merged and Forwarded Message",
    },
  });
  if (!event) throw new Error("Expected merged-forward event");
  return event;
}

function childCard() {
  return {
    message_id: "om_child",
    upper_message_id: "om_parent",
    msg_type: "interactive",
    create_time: "1788772367741",
    sender: {
      sender_type: "app",
      sender_name: "Bamboo",
      sender_id: { app_id: "cli_bamboo" },
    },
    body: {
      content: JSON.stringify({
        json_card: JSON.stringify({
          header: {
            property: {
              title: {
                property: {
                  content: "【数据监控-bamboo-NOTICE】【bamboo通知】分账异常",
                },
              },
            },
          },
          body: {
            elements: [
              {
                property: {
                  content: "告警链接：https://bamboo.bytedance.net/result-manage/6276?id=19562663",
                },
              },
            ],
          },
        }),
      }),
    },
  };
}

describe("Lark merged-forward messages", () => {
  it("normalizes merge_forward events so the service can expand them", () => {
    expect(parentEvent()).toMatchObject({
      messageId: "om_parent",
      chatId: "oc_target",
      messageType: "merge_forward",
    });
  });

  it("expands child cards into the target chat using the forwarding time", () => {
    const parent = parentEvent();
    const children = expandLarkMergedForwardMessage(parent, [
      {
        message_id: "om_parent",
        msg_type: "merge_forward",
        body: { content: "Merged and Forwarded Message" },
      },
      childCard(),
    ]);

    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      eventId: "merged-forward:om_parent:om_child",
      messageId: "om_parent:om_child",
      chatId: "oc_target",
      messageType: "interactive",
      createTime: PARENT_TIME,
      senderAppId: "cli_bamboo",
    });
    expect(children[0]?.text).toContain("bamboo-NOTICE");
    expect(children[0]?.text).toContain("id=19562663");
  });

  it("loads all message.get items before expanding a realtime event", async () => {
    const getMessageItems = vi.fn(async () => [childCard()]);
    const adapter = { getMessageItems } as Pick<LarkChannelClientAdapter, "getMessageItems">;
    const config = {
      enabled: true,
      appId: "cli_test",
      appSecret: "secret",
      domain: "feishu" as const,
    } as never;

    const children = await resolveLarkMergedForwardMessage(adapter, config, parentEvent());

    expect(getMessageItems).toHaveBeenCalledWith(config, "om_parent", undefined);
    expect(children).toHaveLength(1);
  });
});
