import { describe, expect, it, vi } from "vitest";

import { createDesktopAttentionController } from "./app-attention";

function createHarness() {
  let focused = false;
  const showAttentionIcon = vi.fn();
  const showNormalIcon = vi.fn();
  const bounceDock = vi.fn();
  const playSound = vi.fn();
  const controller = createDesktopAttentionController({
    isAppFocused: () => focused,
    showAttentionIcon,
    showNormalIcon,
    bounceDock,
    playSound,
  });

  return {
    controller,
    showAttentionIcon,
    showNormalIcon,
    bounceDock,
    playSound,
    setFocused(value: boolean) {
      focused = value;
    },
  };
}

describe("desktop app attention", () => {
  it("bounces, plays sound, and changes the icon while the app is unfocused", () => {
    const harness = createHarness();

    expect(harness.controller.signal(0.75)).toBe(true);
    expect(harness.showAttentionIcon).toHaveBeenCalledOnce();
    expect(harness.bounceDock).toHaveBeenCalledOnce();
    expect(harness.playSound).toHaveBeenCalledWith(0.75);
    expect(harness.controller.isActive()).toBe(true);
  });

  it("alerts for every completed turn while keeping the attention icon active", () => {
    const harness = createHarness();

    harness.controller.signal(0.5);
    harness.controller.signal(0.5);

    expect(harness.showAttentionIcon).toHaveBeenCalledOnce();
    expect(harness.bounceDock).toHaveBeenCalledTimes(2);
    expect(harness.playSound).toHaveBeenCalledTimes(2);

    harness.controller.clear();
    expect(harness.showNormalIcon).toHaveBeenCalledOnce();
    expect(harness.controller.isActive()).toBe(false);
  });

  it("does not alert or play muted sound while the app is focused", () => {
    const harness = createHarness();
    harness.setFocused(true);

    expect(harness.controller.signal(0)).toBe(false);
    expect(harness.showAttentionIcon).not.toHaveBeenCalled();
    expect(harness.bounceDock).not.toHaveBeenCalled();
    expect(harness.playSound).not.toHaveBeenCalled();
  });
});
