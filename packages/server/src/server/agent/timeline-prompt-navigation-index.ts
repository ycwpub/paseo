import type { AgentTimelineRow } from "./agent-timeline-store-types.js";
import {
  buildTimelinePromptIndex,
  type TimelinePromptIndex,
  type TimelinePromptIndexEntry,
} from "./timeline-prompt-index.js";

const ANSWER_PREVIEW_MAX_LENGTH = 240;

export interface TimelinePromptNavigationIndexEntry extends TimelinePromptIndexEntry {
  answerPreview?: string;
}

export interface TimelinePromptNavigationIndex extends TimelinePromptIndex {
  prompts: TimelinePromptNavigationIndexEntry[];
}

function buildAnswerPreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= ANSWER_PREVIEW_MAX_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, ANSWER_PREVIEW_MAX_LENGTH - 1)}…`;
}

export function buildTimelinePromptNavigationIndex(
  epoch: string,
  rows: readonly AgentTimelineRow[],
): TimelinePromptNavigationIndex {
  const base = buildTimelinePromptIndex(epoch, rows);
  const answersByPromptSeq = new Map<number, string>();
  let currentPromptSeq: number | null = null;

  for (const row of rows) {
    if (row.item.type === "user_message") {
      currentPromptSeq = row.seq;
      continue;
    }
    if (currentPromptSeq !== null && row.item.type === "assistant_message") {
      answersByPromptSeq.set(
        currentPromptSeq,
        `${answersByPromptSeq.get(currentPromptSeq) ?? ""}${row.item.text}`,
      );
    }
  }

  return {
    ...base,
    prompts: base.prompts.map((prompt) => {
      const preview = buildAnswerPreview(answersByPromptSeq.get(prompt.seq) ?? "");
      return preview ? Object.assign({}, prompt, { answerPreview: preview }) : prompt;
    }),
  };
}
