import type {
  LarkGroupMessageProcessor,
  LarkGroupMessageProcessorFilter,
} from "@getpaseo/protocol/messages";

import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

function isBotMessage(event: NormalizedLarkMessageEvent): boolean {
  const senderType = event.senderType?.trim().toLowerCase();
  return senderType === "app" || senderType === "bot";
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function filterValue(
  filter: LarkGroupMessageProcessorFilter,
  event: NormalizedLarkMessageEvent,
  chatName: string | null,
): string {
  switch (filter.field) {
    case "group_chat_id":
      return event.chatId;
    case "group_name":
      return chatName ?? "";
    case "sender_open_id":
      return event.openId ?? "";
    case "sender_name":
      return event.displayName;
    case "message_content":
      return event.text;
  }
}

function matchesFilter(
  filter: LarkGroupMessageProcessorFilter,
  event: NormalizedLarkMessageEvent,
  chatName: string | null,
): boolean {
  const actual = filterValue(filter, event, chatName);
  if (filter.operator === "equals") {
    return normalize(actual) === normalize(filter.value);
  }
  if (filter.operator === "contains") {
    return normalize(actual).includes(normalize(filter.value));
  }
  try {
    return new RegExp(filter.value, "iu").test(actual);
  } catch {
    return false;
  }
}

export function matchLarkGroupMessageProcessor(input: {
  processor: LarkGroupMessageProcessor;
  event: NormalizedLarkMessageEvent;
  chatName: string | null;
}): boolean {
  if (
    !input.processor.enabled ||
    input.event.chatType?.trim().toLowerCase() === "p2p" ||
    isBotMessage(input.event)
  ) {
    return false;
  }
  const excludes = input.processor.filters.filter((filter) => filter.effect === "exclude");
  if (excludes.some((filter) => matchesFilter(filter, input.event, input.chatName))) {
    return false;
  }
  const includesByField = new Map<
    LarkGroupMessageProcessorFilter["field"],
    LarkGroupMessageProcessorFilter[]
  >();
  for (const filter of input.processor.filters) {
    if (filter.effect !== "include") continue;
    const fieldFilters = includesByField.get(filter.field) ?? [];
    fieldFilters.push(filter);
    includesByField.set(filter.field, fieldFilters);
  }
  for (const filters of includesByField.values()) {
    if (!filters.some((filter) => matchesFilter(filter, input.event, input.chatName))) {
      return false;
    }
  }
  return true;
}
