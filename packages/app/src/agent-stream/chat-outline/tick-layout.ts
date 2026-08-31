const RESTING_PILL_HEIGHT = 2;
const RESTING_PILL_WIDTH = 10;
const ACTIVE_PILL_WIDTH = 22;

export function resolveChatOutlineTickDimensions({
  isActive,
}: {
  isActive: boolean;
  hasAttention: boolean;
}): {
  width: number;
  height: number;
} {
  return {
    width: isActive ? ACTIVE_PILL_WIDTH : RESTING_PILL_WIDTH,
    height: RESTING_PILL_HEIGHT,
  };
}
