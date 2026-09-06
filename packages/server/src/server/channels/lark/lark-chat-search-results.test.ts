import { describe, expect, test } from "vitest";
import {
  findLarkGroupIdByChatId,
  mapLarkChatSearchResults,
  mapLegacyLarkChatSearchResults,
} from "./lark-chat-search-results.js";

const items = [
  {
    id: "7160881741501267996",
    display_info: "结算研发群",
    meta_data: {
      chat_id: "oc_settlement",
      name: "结算研发群",
    },
  },
];

describe("Lark chat search results", () => {
  test("keeps the numeric group ID separately from chat_id", () => {
    expect(mapLarkChatSearchResults(items)).toEqual([
      {
        groupId: "7160881741501267996",
        chatId: "oc_settlement",
        name: "结算研发群",
      },
    ]);
    expect(findLarkGroupIdByChatId(items, "oc_settlement")).toBe("7160881741501267996");
  });

  test("maps legacy user-visible group results when the upgraded search scope is unavailable", () => {
    expect(
      mapLegacyLarkChatSearchResults([
        { chat_id: "oc_settlement", name: "结算研发群" },
        { chat_id: "", name: "无效群" },
      ]),
    ).toEqual([
      {
        groupId: "oc_settlement",
        chatId: "oc_settlement",
        name: "结算研发群",
      },
    ]);
  });
});
