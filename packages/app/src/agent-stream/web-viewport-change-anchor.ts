import { STREAM_VIEWPORT_ANCHOR_ATTRIBUTE } from "./viewport-change-anchor";

export interface WebViewportChangeAnchorSnapshot {
  anchorId: string;
  viewportTop: number;
}

export interface WebViewportChangeAnchorRestoreResult {
  found: boolean;
  delta: number;
  scrollTop: number;
}

function findAnchorElement(contentNode: HTMLElement, anchorId: string): HTMLElement | null {
  for (const element of contentNode.querySelectorAll<HTMLElement>(
    `[${STREAM_VIEWPORT_ANCHOR_ATTRIBUTE}]`,
  )) {
    if (element.dataset.streamViewportAnchorId === anchorId) {
      return element;
    }
  }
  return null;
}

function measureViewportTop(scrollContainer: HTMLElement, element: HTMLElement): number {
  return element.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
}

export function captureWebViewportChangeAnchor(input: {
  scrollContainer: HTMLElement;
  contentNode: HTMLElement;
  anchorId: string;
}): WebViewportChangeAnchorSnapshot | null {
  const element = findAnchorElement(input.contentNode, input.anchorId);
  if (!element) {
    return null;
  }
  return {
    anchorId: input.anchorId,
    viewportTop: measureViewportTop(input.scrollContainer, element),
  };
}

export function restoreWebViewportChangeAnchor(input: {
  scrollContainer: HTMLElement;
  contentNode: HTMLElement;
  snapshot: WebViewportChangeAnchorSnapshot;
}): WebViewportChangeAnchorRestoreResult {
  const element = findAnchorElement(input.contentNode, input.snapshot.anchorId);
  if (!element) {
    return {
      found: false,
      delta: 0,
      scrollTop: input.scrollContainer.scrollTop,
    };
  }

  const delta = measureViewportTop(input.scrollContainer, element) - input.snapshot.viewportTop;
  const scrollTop = Math.max(0, input.scrollContainer.scrollTop + delta);
  if (Math.abs(delta) > 0.5) {
    input.scrollContainer.scrollTo({ top: scrollTop, behavior: "auto" });
  }
  return { found: true, delta, scrollTop };
}
