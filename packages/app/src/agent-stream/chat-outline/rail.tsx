import type { ActivePromptSource, ChatOutlinePrompt } from "./model";

export interface ChatOutlineRailProps {
  prompts: ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  model: string | null;
  onJumpToPrompt: (seq: number) => void;
}

// The outline is a wide-layout pointer affordance. Native navigates the transcript by
// scrolling, so there is no rail to render.
export function ChatOutlineRail(_props: ChatOutlineRailProps): null {
  return null;
}
