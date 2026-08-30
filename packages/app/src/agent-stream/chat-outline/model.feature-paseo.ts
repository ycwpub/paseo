import type { AgentTimelinePromptIndexPayload } from "@getpaseo/client/internal/daemon-client";
import type { StreamItem } from "@/types/stream";

export type ChatOutlinePrompt = AgentTimelinePromptIndexPayload["prompts"][number] & {
  answerPreview?: string;
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
 * Builds a best-effort prompt index from the rows already loaded by the client.
 *
 * Newer daemons provide a complete prompt index, including unloaded history. Keeping this
 * local fallback means the message rail still appears while capabilities are connecting or
 * when Paseo is attached to an older daemon; only jumps into unloaded history need the newer
 * server API.
 */
export function buildLoadedChatOutlinePrompts(
  items: readonly StreamItem[],
  timelineEpoch: string | null,
): ChatOutlinePrompt[] {
  const prompts = new Map<number, ChatOutlinePrompt>();
  let currentPrompt: ChatOutlinePrompt | null = null;
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
  indexedPrompts: readonly ChatOutlinePrompt[],
  loadedPrompts: readonly ChatOutlinePrompt[],
): ChatOutlinePrompt[] {
  const prompts = new Map<number, ChatOutlinePrompt>();
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

export function shouldAcceptPromptIndexEpoch(
  timelineEpoch: string | null,
  indexEpoch: string,
): boolean {
  return timelineEpoch === null || timelineEpoch === indexEpoch;
}

/**
 * Slots further than this from the pointer keep their resting size, so a long rail
 * magnifies a local band instead of swelling the whole column.
 */
export const OUTLINE_MAGNIFY_RADIUS = 3;

/**
 * Dock-style falloff: 1 under the pointer, easing to 0 at the radius. The raised cosine
 * has no corner at either end, so sweeping the rail reads as one bulge travelling with
 * the pointer rather than a band switching on and off.
 */
export function promptTickMagnification(slotDistance: number): number {
  const distance = Math.abs(slotDistance);
  if (!Number.isFinite(distance) || distance >= OUTLINE_MAGNIFY_RADIUS) {
    return 0;
  }
  return (1 + Math.cos((Math.PI * distance) / OUTLINE_MAGNIFY_RADIUS)) / 2;
}

/**
 * The prompt whose turn the reader is inside: the last indexed prompt at or before the
 * timeline position under the top of the viewport. It reads the complete daemon index,
 * so a prompt outside the loaded window still lights up while its turn is on screen.
 */
export function resolveActivePromptSeq(
  prompts: readonly ChatOutlinePrompt[],
  anchorSeq: number | null,
): number | null {
  if (anchorSeq === null) {
    return null;
  }
  let activeSeq: number | null = null;
  for (const prompt of prompts) {
    if (prompt.seq > anchorSeq) {
      break;
    }
    activeSeq = prompt.seq;
  }
  return activeSeq;
}

export interface ActivePromptSource {
  subscribe: (listener: () => void) => () => void;
  getActiveSeq: () => number | null;
}

export interface ActivePromptPublisher extends ActivePromptSource {
  publish: (seq: number | null) => void;
}

/**
 * The transcript reports its reading position on every scroll frame, far more often than
 * it re-renders. Keeping the active prompt outside React lets the rail subscribe to it
 * without dragging the transcript through a render on each frame.
 */
export function createActivePromptPublisher(): ActivePromptPublisher {
  const listeners = new Set<() => void>();
  let activeSeq: number | null = null;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getActiveSeq: () => activeSeq,
    publish(seq) {
      if (seq === activeSeq) {
        return;
      }
      activeSeq = seq;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
