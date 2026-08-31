import type { AgentTimelineItem } from "./agent-types.js";

export type ReasoningTimelineSource = "thinking" | "text";

type ReasoningTimelineItem = Extract<AgentTimelineItem, { type: "reasoning" }>;

export type SourcedReasoningTimelineItem = ReasoningTimelineItem & {
  source?: ReasoningTimelineSource;
};

export function createSourcedReasoningTimelineItem(
  text: string,
  source: ReasoningTimelineSource,
): SourcedReasoningTimelineItem {
  return { type: "reasoning", text, source };
}

export function getReasoningTimelineSource(
  item: ReasoningTimelineItem,
): ReasoningTimelineSource | undefined {
  const source = (item as SourcedReasoningTimelineItem).source;
  return source === "thinking" || source === "text" ? source : undefined;
}
