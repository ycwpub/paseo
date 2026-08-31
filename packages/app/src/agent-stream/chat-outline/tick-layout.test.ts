import { describe, expect, it } from "vitest";
import { resolveChatOutlineTickDimensions } from "./tick-layout";

describe("chat outline tick layout", () => {
  it.each([false, true])("keeps an inactive tick fixed when attention is %s", (hasAttention) => {
    expect(resolveChatOutlineTickDimensions({ isActive: false, hasAttention })).toEqual({
      width: 10,
      height: 2,
    });
  });

  it.each([false, true])("keeps the active tick fixed when attention is %s", (hasAttention) => {
    expect(resolveChatOutlineTickDimensions({ isActive: true, hasAttention })).toEqual({
      width: 22,
      height: 2,
    });
  });
});
