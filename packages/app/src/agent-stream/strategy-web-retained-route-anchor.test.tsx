/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetainedPanelActivity } from "@/components/retained-panel";
import type { StreamItem } from "@/types/stream";
import type { StreamRenderInput, StreamSegmentRenderers, StreamViewportHandle } from "./strategy";
import { createWebStreamStrategy } from "./strategy-web";

const VIRTUAL_ROW_STYLE = { height: 24 };

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: "",
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }),
  });
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  withUnistyles: (Component: React.ComponentType) => Component,
}));

function userMessage(index: number): StreamItem {
  return {
    kind: "user_message",
    id: `message-${index}`,
    text: `Message ${index}`,
    timestamp: new Date(`2026-09-02T00:00:${String(index % 60).padStart(2, "0")}.000Z`),
  };
}

function createRenderers(): StreamSegmentRenderers {
  return {
    renderHistoryVirtualizedRow: (item) => <div style={VIRTUAL_ROW_STYLE}>{item.id}</div>,
    renderHistoryMountedRow: (item) => <div>{item.id}</div>,
    renderLiveHeadRow: (item) => <div>{item.id}</div>,
    renderLiveAuxiliary: () => null,
  };
}

async function flushAnimationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  }
}

describe("web retained route bottom anchoring", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let originalScrollTo: HTMLElement["scrollTo"] | undefined;
  let originalOffsetHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "ResizeObserver", {
      value: class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
      configurable: true,
    });
    originalScrollTo = HTMLElement.prototype.scrollTo;
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 24;
      },
    });
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    root = null;
    container?.remove();
    container = null;
    if (originalScrollTo) {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    }
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
    }
    vi.restoreAllMocks();
  });

  it("restores the newest message when a detached retained conversation is entered again", async () => {
    let scrollTop = 0;
    let scrollHeight = 1800;
    const scrollTo = vi.fn(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      const requestedTop = typeof options === "object" ? (options.top ?? 0) : (y ?? 0);
      scrollTop = Math.min(requestedTop, Math.max(0, scrollHeight - this.clientHeight));
    });
    HTMLElement.prototype.scrollTo = scrollTo;

    const strategy = createWebStreamStrategy({ isMobileBreakpoint: true });
    const viewportRef = React.createRef<StreamViewportHandle>();
    const onNearHistoryStart = vi.fn().mockReturnValue(true);
    const historyVirtualized = Array.from({ length: 120 }, (_, index) => userMessage(index));
    const baseInput: StreamRenderInput = {
      agentId: "agent",
      segments: {
        historyVirtualized,
        historyMounted: [userMessage(121)],
        liveHead: [],
      },
      boundary: {
        hasVirtualizedHistory: true,
        hasMountedHistory: true,
        hasLiveHead: false,
      },
      renderers: createRenderers(),
      listEmptyComponent: null,
      viewportRef,
      routeBottomAnchorRequest: {
        agentId: "agent",
        reason: "resume",
        requestKey: "server:agent:resume:activation-1",
      },
      isAuthoritativeHistoryReady: true,
      onNearBottomChange: vi.fn(),
      onNearHistoryStart,
      isLoadingOlderHistory: false,
      hasOlderHistory: true,
      olderHistoryProgressKey: "history-120",
      scrollEnabled: true,
      listStyle: null,
      baseListContentContainerStyle: null,
      forwardListContentContainerStyle: null,
    };
    const renderWithActivity = (active: boolean, input = baseInput) => (
      <RetainedPanelActivity active={active}>{strategy.render(input)}</RetainedPanelActivity>
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(renderWithActivity(true)));

    const scrollContainer = container.querySelector('[data-testid="agent-chat-scroll"]');
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error("Expected agent chat scroll container");
    }
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });

    await flushAnimationFrames(4);
    expect(scrollTop).toBe(1300);

    act(() => {
      scrollContainer.dispatchEvent(new WheelEvent("wheel", { deltaY: -400 }));
      scrollTop = 200;
      scrollContainer.dispatchEvent(new Event("scroll"));
    });
    expect(scrollTop).toBe(200);

    act(() => root?.render(renderWithActivity(false)));
    scrollTo.mockClear();
    onNearHistoryStart.mockClear();
    scrollHeight = 2600;

    act(() =>
      root?.render(
        renderWithActivity(true, {
          ...baseInput,
          routeBottomAnchorRequest: {
            agentId: "agent",
            reason: "resume",
            requestKey: "server:agent:resume:activation-2",
          },
        }),
      ),
    );
    await flushAnimationFrames(4);

    expect(scrollTop).toBe(2100);
    expect(scrollTo).toHaveBeenCalled();
    expect(onNearHistoryStart).not.toHaveBeenCalled();
  });
});
