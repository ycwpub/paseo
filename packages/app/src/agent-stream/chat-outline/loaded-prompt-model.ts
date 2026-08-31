import type { AgentTimelinePromptIndexPayload } from "@getpaseo/client/internal/daemon-client";
import type { StreamItem } from "@/types/stream";

export type LoadedChatOutlinePrompt = AgentTimelinePromptIndexPayload["prompts"][number] & {
  answerPreview?: string;
};

export type PresentedChatOutlinePrompt = LoadedChatOutlinePrompt & {
  model?: string | null;
};

const PROMPT_PREVIEW_MAX_LENGTH = 120;
const ANSWER_PREVIEW_MAX_LENGTH = 240;

function textPreview(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1)}…`;
}

/**
 * Builds a best-effort prompt index from rows already loaded by the client.
 * The daemon index still supplies prompts outside the loaded history window.
 */
export function buildLoadedChatOutlinePrompts(
  items: readonly StreamItem[],
  timelineEpoch: string | null,
): LoadedChatOutlinePrompt[] {
  const prompts = new Map<number, LoadedChatOutlinePrompt>();
  let currentPrompt: LoadedChatOutlinePrompt | null = null;
  let currentAnswer = "";
  const orderedItems = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        !item.timelineCursor ||
        timelineEpoch === null ||
        item.timelineCursor.epoch === timelineEpoch,
    )
    .sort(
      (left, right) =>
        (left.item.timelineCursor?.seq ?? Number.MAX_SAFE_INTEGER) -
          (right.item.timelineCursor?.seq ?? Number.MAX_SAFE_INTEGER) || left.index - right.index,
    );

  const flushAnswer = () => {
    if (!currentPrompt) return;
    const answerPreview = textPreview(currentAnswer, ANSWER_PREVIEW_MAX_LENGTH);
    if (!answerPreview) return;
    const completedPrompt = { ...currentPrompt, answerPreview };
    prompts.set(completedPrompt.seq, completedPrompt);
    currentPrompt = completedPrompt;
  };

  for (const { item } of orderedItems) {
    if (item.kind === "user_message" && item.timelineCursor) {
      flushAnswer();
      currentAnswer = "";
      currentPrompt = {
        seq: item.timelineCursor.seq,
        timestamp: item.timestamp.toISOString(),
        preview: textPreview(item.text, PROMPT_PREVIEW_MAX_LENGTH),
      };
      prompts.set(currentPrompt.seq, currentPrompt);
      continue;
    }
    if (
      currentPrompt &&
      item.kind === "assistant_message" &&
      (!item.timelineCursor ||
        timelineEpoch === null ||
        item.timelineCursor.epoch === timelineEpoch)
    ) {
      currentAnswer += item.text;
    }
  }
  flushAnswer();
  return [...prompts.values()].sort((left, right) => left.seq - right.seq);
}

export function mergeChatOutlinePrompts(
  indexedPrompts: readonly LoadedChatOutlinePrompt[],
  loadedPrompts: readonly LoadedChatOutlinePrompt[],
): LoadedChatOutlinePrompt[] {
  const prompts = new Map<number, LoadedChatOutlinePrompt>();
  for (const prompt of indexedPrompts) prompts.set(prompt.seq, prompt);
  for (const prompt of loadedPrompts) {
    const indexed = prompts.get(prompt.seq);
    prompts.set(
      prompt.seq,
      indexed
        ? {
            ...prompt,
            ...indexed,
            answerPreview: prompt.answerPreview ?? indexed.answerPreview,
          }
        : prompt,
    );
  }
  return [...prompts.values()].sort((left, right) => left.seq - right.seq);
}

export function presentChatOutlinePrompts(
  prompts: readonly LoadedChatOutlinePrompt[],
  model: string | null,
): PresentedChatOutlinePrompt[] {
  return prompts.map((prompt) => ({ ...prompt, model }));
}

export function readChatOutlinePromptPresentation(
  prompt: AgentTimelinePromptIndexPayload["prompts"][number],
): Pick<PresentedChatOutlinePrompt, "answerPreview" | "model"> {
  const presented = prompt as PresentedChatOutlinePrompt;
  return {
    answerPreview: presented.answerPreview,
    model: presented.model,
  };
}
