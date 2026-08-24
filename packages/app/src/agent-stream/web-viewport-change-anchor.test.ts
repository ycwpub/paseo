/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureWebViewportChangeAnchor,
  restoreWebViewportChangeAnchor,
} from "./web-viewport-change-anchor";

function rect(top: number): DOMRect {
  return {
    bottom: top + 32,
    height: 32,
    left: 0,
    right: 320,
    top,
    width: 320,
    x: 0,
    y: top,
    toJSON: () => {},
  } as DOMRect;
}

describe("web viewport change anchor", () => {
  let scrollContainer: HTMLDivElement;
  let contentNode: HTMLDivElement;
  let anchor: HTMLButtonElement;
  let scrollTop: number;
  let anchorDocumentTop: number;

  beforeEach(() => {
    scrollTop = 400;
    anchorDocumentTop = 620;
    scrollContainer = document.createElement("div");
    contentNode = document.createElement("div");
    anchor = document.createElement("button");
    anchor.dataset.streamViewportAnchorId = "turn-1";
    contentNode.append(anchor);
    scrollContainer.append(contentNode);
    document.body.append(scrollContainer);

    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    scrollContainer.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      scrollTop = typeof options === "object" ? (options.top ?? scrollTop) : (y ?? scrollTop);
    });
    scrollContainer.getBoundingClientRect = () => rect(40);
    anchor.getBoundingClientRect = () => rect(40 + anchorDocumentTop - scrollTop);
  });

  it("keeps the disclosure at the same viewport position when content expands above it", () => {
    const snapshot = captureWebViewportChangeAnchor({
      scrollContainer,
      contentNode,
      anchorId: "turn-1",
    });
    expect(snapshot).toEqual({ anchorId: "turn-1", viewportTop: 220 });

    anchorDocumentTop = 980;
    const result = restoreWebViewportChangeAnchor({
      scrollContainer,
      contentNode,
      snapshot: snapshot!,
    });

    expect(result).toEqual({ found: true, delta: 360, scrollTop: 760 });
    expect(scrollContainer.scrollTop).toBe(760);
    expect(anchor.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top).toBe(
      220,
    );
  });

  it("keeps the disclosure at the same viewport position when content collapses above it", () => {
    const snapshot = captureWebViewportChangeAnchor({
      scrollContainer,
      contentNode,
      anchorId: "turn-1",
    });
    anchorDocumentTop = 300;

    const result = restoreWebViewportChangeAnchor({
      scrollContainer,
      contentNode,
      snapshot: snapshot!,
    });

    expect(result).toEqual({ found: true, delta: -320, scrollTop: 80 });
    expect(scrollContainer.scrollTop).toBe(80);
    expect(anchor.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top).toBe(
      220,
    );
  });
});
