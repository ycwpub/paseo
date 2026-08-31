/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import type { StreamRenderInput, StreamSegmentRenderers, StreamViewportHandle } from "./strategy";
import { createWebStreamStrategy } from "./strategy-web";
import {
  prepareStreamViewportChange,
  scrollStreamViewportToOldest,
} from "./viewport-handle-extensions";
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
    timestamp: new Date(`2026-04-20T00:00:${String(index % 60).padStart(2, "0")}.000Z`),
  };
}
const VIRTUAL_ROW_STYLE = { height: 24 };
function createRenderers(onRowRender: () => void): StreamSegmentRenderers {
  return {
    renderHistoryVirtualizedRow: (item) => {
      onRowRender();
      return <div style={VIRTUAL_ROW_STYLE}>{item.id}</div>;
    },
    renderHistoryMountedRow: (item) => <div>{item.id}</div>,
    renderLiveHeadRow: (item) => <div>{item.id}</div>,
    renderLiveAuxiliary: () => null,
  };
}
describe("createWebStreamStrategy", () => {
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
    HTMLElement.prototype.scrollTo = vi.fn();
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
      act(() => {
        root?.unmount();
      });
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
  it("keeps a user-selected viewport anchor stable while rows are expanded", async () => {
    let scrollTop = 400;
    let expanded = false;
    HTMLElement.prototype.scrollTo = vi.fn(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      scrollTop = typeof options === "object" ? (options.top ?? scrollTop) : (y ?? scrollTop);
    });
    const strategy = createWebStreamStrategy({ isMobileBreakpoint: false });
    const viewportRef = React.createRef<StreamViewportHandle>();
    const collapsedItem = userMessage(1);
    const expandedItem = userMessage(2);
    const renderers: StreamSegmentRenderers = {
      ...createRenderers(vi.fn()),
      renderHistoryMountedRow: (item) => (
        <div data-stream-viewport-anchor-id="turn-1">{item.id}</div>
      ),
    };
    const renderInput: Omit<StreamRenderInput, "segments" | "boundary"> = {
      agentId: "agent",
      renderers,
      listEmptyComponent: null,
      viewportRef,
      routeBottomAnchorRequest: null,
      isAuthoritativeHistoryReady: true,
      onNearBottomChange: vi.fn(),
      onNearHistoryStart: vi.fn().mockReturnValue(true),
      isLoadingOlderHistory: false,
      hasOlderHistory: false,
      olderHistoryProgressKey: null,
      scrollEnabled: true,
      listStyle: null,
      baseListContentContainerStyle: null,
      forwardListContentContainerStyle: null,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        strategy.render({
          ...renderInput,
          segments: { historyVirtualized: [], historyMounted: [collapsedItem], liveHead: [] },
          boundary: {
            hasVirtualizedHistory: false,
            hasMountedHistory: true,
            hasLiveHead: false,
          },
        }),
      );
    });
    const scrollContainer = container.querySelector('[data-testid="agent-chat-scroll"]');
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error("Expected agent chat scroll container");
    }
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1600 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this === scrollContainer) {
          return {
            bottom: 540,
            height: 500,
            left: 0,
            right: 600,
            top: 40,
            width: 600,
            x: 0,
            y: 40,
            toJSON: () => {},
          } as DOMRect;
        }
        if (this.dataset.streamViewportAnchorId === "turn-1") {
          const documentTop = expanded ? 980 : 620;
          return {
            bottom: 72 + documentTop - scrollTop,
            height: 32,
            left: 0,
            right: 320,
            top: 40 + documentTop - scrollTop,
            width: 320,
            x: 0,
            y: 40 + documentTop - scrollTop,
            toJSON: () => {},
          } as DOMRect;
        }
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        } as DOMRect;
      },
    );
    act(() => {
      prepareStreamViewportChange(viewportRef.current, "turn-1");
      expanded = true;
      root?.render(
        strategy.render({
          ...renderInput,
          segments: { historyVirtualized: [], historyMounted: [expandedItem], liveHead: [] },
          boundary: {
            hasVirtualizedHistory: false,
            hasMountedHistory: true,
            hasLiveHead: false,
          },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(scrollTop).toBe(760);
    const anchor = container.querySelector('[data-stream-viewport-anchor-id="turn-1"]');
    if (!(anchor instanceof HTMLElement)) {
      throw new Error("Expected viewport anchor");
    }
    expect(anchor.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top).toBe(
      220,
    );
  });
  it("waits for bottom anchoring before evaluating a delayed initial tail", async () => {
    HTMLElement.prototype.scrollTo = vi.fn(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      const top = typeof options === "object" ? (options.top ?? 0) : (y ?? 0);
      Object.defineProperty(this, "scrollTop", { configurable: true, value: top });
    });
    const strategy = createWebStreamStrategy({ isMobileBreakpoint: true });
    const viewportRef = React.createRef<StreamViewportHandle>();
    const onNearHistoryStart = vi.fn().mockReturnValue(true);
    const renderInput = {
      agentId: "agent",
      boundary: {
        hasVirtualizedHistory: false,
        hasMountedHistory: false,
        hasLiveHead: false,
      },
      renderers: createRenderers(vi.fn()),
      listEmptyComponent: null,
      viewportRef,
      routeBottomAnchorRequest: null,
      isAuthoritativeHistoryReady: true,
      onNearBottomChange: vi.fn(),
      onNearHistoryStart,
      isLoadingOlderHistory: false,
      hasOlderHistory: false,
      olderHistoryProgressKey: null,
      scrollEnabled: true,
      listStyle: null,
      baseListContentContainerStyle: null,
      forwardListContentContainerStyle: null,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        strategy.render({
          ...renderInput,
          segments: { historyVirtualized: [], historyMounted: [], liveHead: [] },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const scrollContainer = container.querySelector('[data-testid="agent-chat-scroll"]');
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error("Expected agent chat scroll container");
    }
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, value: 700 });
    act(() => {
      scrollContainer?.dispatchEvent(new Event("scroll"));
      scrollContainer?.dispatchEvent(new Event("scroll"));
    });
    expect(onNearHistoryStart).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(onNearHistoryStart).not.toHaveBeenCalled();
  });
  it("scrolls directly to the oldest rendered edge through the viewport handle", () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    const strategy = createWebStreamStrategy({ isMobileBreakpoint: false });
    const viewportRef = React.createRef<StreamViewportHandle>();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        strategy.render({
          agentId: "agent",
          segments: {
            historyVirtualized: [],
            historyMounted: [userMessage(1)],
            liveHead: [],
          },
          boundary: {
            hasVirtualizedHistory: false,
            hasMountedHistory: true,
            hasLiveHead: false,
          },
          renderers: createRenderers(vi.fn()),
          listEmptyComponent: null,
          viewportRef,
          routeBottomAnchorRequest: null,
          isAuthoritativeHistoryReady: true,
          onNearBottomChange: vi.fn(),
          onNearHistoryStart: vi.fn(),
          isLoadingOlderHistory: false,
          hasOlderHistory: false,
          olderHistoryProgressKey: null,
          scrollEnabled: true,
          listStyle: null,
          baseListContentContainerStyle: null,
          forwardListContentContainerStyle: null,
        }),
      );
    });
    scrollTo.mockClear();
    act(() => scrollStreamViewportToOldest(viewportRef.current));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
  it("clears the history spinner when a fast request skips the rendered loading flag", async () => {
    const strategy = createWebStreamStrategy({ isMobileBreakpoint: true });
    const viewportRef = React.createRef<StreamViewportHandle>();
    const onNearHistoryStart = vi.fn().mockResolvedValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        strategy.render({
          agentId: "agent",
          segments: {
            historyVirtualized: [],
            historyMounted: [userMessage(1), userMessage(2)],
            liveHead: [],
          },
          boundary: {
            hasVirtualizedHistory: false,
            hasMountedHistory: true,
            hasLiveHead: false,
          },
          renderers: createRenderers(vi.fn()),
          listEmptyComponent: null,
          viewportRef,
          routeBottomAnchorRequest: null,
          isAuthoritativeHistoryReady: true,
          onNearBottomChange: vi.fn(),
          onNearHistoryStart,
          isLoadingOlderHistory: false,
          hasOlderHistory: true,
          olderHistoryProgressKey: "epoch-1:20",
          scrollEnabled: true,
          listStyle: null,
          baseListContentContainerStyle: null,
          forwardListContentContainerStyle: null,
        }),
      );
    });
    const scrollContainer = container.querySelector('[data-testid="agent-chat-scroll"]');
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error("Expected agent chat scroll container");
    }
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
      scrollTop: { configurable: true, writable: true, value: 64 },
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    act(() => {
      scrollContainer.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
      scrollContainer.dispatchEvent(new Event("scroll"));
    });
    expect(onNearHistoryStart).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="load-older-history-spinner"]')).not.toBeNull();

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(container.querySelector('[data-testid="load-older-history-spinner"]')).toBeNull();
  });
  it("preserves the visible history position after older rows are prepended", async () => {
    const scrollTo = vi.fn(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      const top = typeof options === "object" ? (options.top ?? 0) : (y ?? 0);
      Object.defineProperty(this, "scrollTop", {
        configurable: true,
        value: top,
      });
    });
    HTMLElement.prototype.scrollTo = scrollTo;
    const strategy = createWebStreamStrategy({ isMobileBreakpoint: true });
    const viewportRef = React.createRef<StreamViewportHandle>();
    const onNearHistoryStart = vi.fn();
    const initialHistory = Array.from({ length: 20 }, (_, index) => userMessage(index + 20));
    const renderInput = {
      agentId: "agent",
      boundary: {
        hasVirtualizedHistory: false,
        hasMountedHistory: true,
        hasLiveHead: false,
      },
      renderers: createRenderers(vi.fn()),
      listEmptyComponent: null,
      viewportRef,
      routeBottomAnchorRequest: null,
      isAuthoritativeHistoryReady: true,
      onNearBottomChange: vi.fn(),
      onNearHistoryStart,
      isLoadingOlderHistory: false,
      hasOlderHistory: true,
      olderHistoryProgressKey: "epoch-1:20",
      scrollEnabled: true,
      listStyle: null,
      baseListContentContainerStyle: null,
      forwardListContentContainerStyle: null,
    } satisfies Omit<StreamRenderInput, "segments">;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        strategy.render({
          ...renderInput,
          segments: {
            historyVirtualized: [],
            historyMounted: initialHistory,
            liveHead: [],
          },
        }),
      );
    });
    const scrollContainer = container.querySelector('[data-testid="agent-chat-scroll"]');
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error("Expected agent chat scroll container");
    }
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, value: 64 });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, value: 64 });
    scrollTo.mockClear();
    act(() => {
      scrollContainer.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
      scrollContainer.dispatchEvent(new Event("scroll"));
    });
    expect(onNearHistoryStart).toHaveBeenCalledTimes(1);
    const prependedHistory = [
      ...Array.from({ length: 20 }, (_, index) => userMessage(index)),
      ...initialHistory,
    ];
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 2400 });
    act(() => {
      root?.render(
        strategy.render({
          ...renderInput,
          segments: {
            historyVirtualized: [],
            historyMounted: prependedHistory,
            liveHead: [],
          },
          isLoadingOlderHistory: true,
          olderHistoryProgressKey: "epoch-1:0",
        }),
      );
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1264, behavior: "auto" });
    expect(scrollContainer.scrollTop).toBe(1264);
  });
});
