import type { LarkSubstituteTaskSource } from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

export function getLarkSubstituteTaskSource(
  event: NormalizedLarkMessageEvent,
): LarkSubstituteTaskSource {
  if (event.eventId.startsWith("private-scan:")) return "private_scan";
  if (event.eventId.startsWith("group-scan:")) return "group_scan";
  return "group_listener";
}
