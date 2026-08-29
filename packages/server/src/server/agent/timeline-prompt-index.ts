import type { AgentTimelineRow } from "./agent-timeline-store-types.js";

const PROMPT_PREVIEW_MAX_LENGTH = 120;
const ANSWER_PREVIEW_MAX_LENGTH = 240;

export interface TimelinePromptIndexEntry {
  seq: number;
  timestamp: string;
  preview: string;
  answerPreview?: string;
}

export interface TimelinePromptIndex {
  epoch: string;
  prompts: TimelinePromptIndexEntry[];
}

function textPreview(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1)}…`;
}

export function buildTimelinePromptIndex(
  epoch: string,
  rows: readonly AgentTimelineRow[],
): TimelinePromptIndex {
  const prompts: TimelinePromptIndexEntry[] = [];
  let currentPrompt: TimelinePromptIndexEntry | null = null;
  let currentAnswer = "";

  const flushAnswer = () => {
    if (!currentPrompt) return;
    const answerPreview = textPreview(currentAnswer, ANSWER_PREVIEW_MAX_LENGTH);
    if (answerPreview) currentPrompt.answerPreview = answerPreview;
  };

  for (const row of rows) {
    if (row.item.type === "user_message") {
      flushAnswer();
      currentAnswer = "";
      currentPrompt = {
        seq: row.seq,
        timestamp: row.timestamp,
        preview: textPreview(row.item.text, PROMPT_PREVIEW_MAX_LENGTH),
      };
      prompts.push(currentPrompt);
      continue;
    }
    if (currentPrompt && row.item.type === "assistant_message") {
      currentAnswer += row.item.text;
    }
  }
  flushAnswer();

  return {
    epoch,
    prompts,
  };
}
