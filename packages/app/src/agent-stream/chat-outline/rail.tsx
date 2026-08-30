import type { LoadedChatOutlinePrompt } from "./loaded-prompt-model";
import type { ActivePromptSource } from "./model";

export interface ChatOutlineRailProps {
  prompts: LoadedChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  model: string | null;
  onJumpToPrompt: (seq: number) => void;
}

// The outline is a wide-layout pointer affordance. Native navigates the transcript by
// scrolling, so there is no rail to render.
export function ChatOutlineRail(_props: ChatOutlineRailProps): null {
  return null;
}
