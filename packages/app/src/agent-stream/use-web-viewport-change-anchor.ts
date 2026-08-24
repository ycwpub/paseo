import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useStableEvent } from "@/hooks/use-stable-event";
import {
  captureWebViewportChangeAnchor,
  restoreWebViewportChangeAnchor,
  type WebViewportChangeAnchorSnapshot,
} from "./web-viewport-change-anchor";

const SETTLE_FRAMES = 8;
const REQUIRED_STABLE_FRAMES = 2;

interface PendingViewportChangeAnchor {
  snapshot: WebViewportChangeAnchorSnapshot;
  remainingFrames: number;
  stableFrames: number;
}

interface UseWebViewportChangeAnchorInput {
  active: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  onPrepare: () => void;
  onRestore: (scrollTop: number) => void;
  onSettle: () => void;
}

export function useWebViewportChangeAnchor(input: UseWebViewportChangeAnchorInput) {
  const pendingRef = useRef<PendingViewportChangeAnchor | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  const activeRef = useRef(input.active);
  activeRef.current = input.active;

  const onPrepare = useStableEvent(input.onPrepare);
  const onRestore = useStableEvent(input.onRestore);
  const onSettle = useStableEvent(input.onSettle);

  const cancel = useCallback(() => {
    const pendingFrame = pendingFrameRef.current;
    if (pendingFrame !== null) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrameRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const settle = useStableEvent(() => {
    pendingFrameRef.current = null;
    const pending = pendingRef.current;
    const scrollContainer = input.scrollContainerRef.current;
    const contentNode = input.contentRef.current;
    if (!pending || !scrollContainer || !contentNode || !activeRef.current) {
      pendingRef.current = null;
      return;
    }

    const result = restoreWebViewportChangeAnchor({
      scrollContainer,
      contentNode,
      snapshot: pending.snapshot,
    });
    if (result.found) {
      onRestore(result.scrollTop);
      pending.stableFrames = Math.abs(result.delta) <= 0.5 ? pending.stableFrames + 1 : 0;
    } else {
      pending.stableFrames = 0;
    }
    pending.remainingFrames -= 1;

    if (pending.remainingFrames <= 0 || pending.stableFrames >= REQUIRED_STABLE_FRAMES) {
      pendingRef.current = null;
      onSettle();
      return;
    }
    pendingFrameRef.current = window.requestAnimationFrame(settle);
  });

  const schedule = useStableEvent(() => {
    if (pendingFrameRef.current !== null || !pendingRef.current) {
      return;
    }
    pendingFrameRef.current = window.requestAnimationFrame(settle);
  });

  const prepare = useStableEvent((anchorId: string): boolean => {
    const scrollContainer = input.scrollContainerRef.current;
    const contentNode = input.contentRef.current;
    if (!scrollContainer || !contentNode || !activeRef.current) {
      return false;
    }
    const snapshot = captureWebViewportChangeAnchor({
      scrollContainer,
      contentNode,
      anchorId,
    });
    if (!snapshot) {
      return false;
    }

    cancel();
    onPrepare();
    pendingRef.current = {
      snapshot,
      remainingFrames: SETTLE_FRAMES,
      stableFrames: 0,
    };
    return true;
  });

  const hasPending = useStableEvent(() => pendingRef.current !== null);

  useEffect(() => {
    if (!input.active) {
      cancel();
    }
  }, [cancel, input.active]);
  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ hasPending, prepare, schedule }), [hasPending, prepare, schedule]);
}
