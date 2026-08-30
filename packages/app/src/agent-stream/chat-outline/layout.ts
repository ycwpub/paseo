export const CHAT_OUTLINE_MIN_PANEL_WIDTH = 640;
export const CHAT_OUTLINE_RAIL_LEFT = 8;
export const CHAT_OUTLINE_RAIL_WIDTH = 36;
export const CHAT_OUTLINE_CONTENT_GAP = 12;
export const CHAT_OUTLINE_CONTENT_INSET =
  CHAT_OUTLINE_RAIL_LEFT + CHAT_OUTLINE_RAIL_WIDTH + CHAT_OUTLINE_CONTENT_GAP;

export function shouldReserveChatOutlineContentInset(input: {
  enabled: boolean;
  hasPrompts: boolean;
  isPanelNarrow: boolean;
  isWeb: boolean;
}): boolean {
  return input.isWeb && input.enabled && input.hasPrompts && !input.isPanelNarrow;
}
