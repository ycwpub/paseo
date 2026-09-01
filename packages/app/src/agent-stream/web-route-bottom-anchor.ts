export interface WebRouteBottomAnchorGeometry {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

interface WebRouteBottomAnchorDriverInput {
  getIsActive: () => boolean;
  getIsReady: () => boolean;
  getShouldFollowOutput: () => boolean;
  getHasPendingMeasurements: () => boolean;
  getGeometry: () => WebRouteBottomAnchorGeometry | null;
  stickToBottom: () => void;
  onSettledChange: (settled: boolean) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
}

export interface WebRouteBottomAnchorRequest {
  requestKey: string;
  isVirtualized: boolean;
}

export interface WebRouteBottomAnchorDriver {
  applyRequest: (request: WebRouteBottomAnchorRequest) => void;
  notifyStateChanged: () => void;
  cancelByUser: () => void;
  destroy: () => void;
}

const BOTTOM_TOLERANCE_PX = 1;
const MOUNTED_STABLE_FRAME_COUNT = 1;
const VIRTUALIZED_STABLE_FRAME_COUNT = 2;

function isMeasurable(
  geometry: WebRouteBottomAnchorGeometry | null,
): geometry is WebRouteBottomAnchorGeometry {
  return Boolean(geometry && geometry.clientHeight > 0 && geometry.scrollHeight > 0);
}

function isAtBottom(geometry: WebRouteBottomAnchorGeometry): boolean {
  return geometry.scrollHeight - geometry.clientHeight - geometry.scrollTop <= BOTTOM_TOLERANCE_PX;
}

/**
 * Keeps a route-entry viewport pinned until browser layout and virtual-row measurement have
 * actually stabilized. A fixed timeout is insufficient for long transcripts because row
 * measurement, fonts, images, and retained-panel activation can all grow the document later.
 */
export function createWebRouteBottomAnchorDriver(
  input: WebRouteBottomAnchorDriverInput,
): WebRouteBottomAnchorDriver {
  let currentRequest: WebRouteBottomAnchorRequest | null = null;
  let pending = false;
  let scheduledFrame: number | null = null;
  let previousScrollHeight: number | null = null;
  let stableFrameCount = 0;

  const cancelScheduledFrame = () => {
    if (scheduledFrame === null) {
      return;
    }
    input.cancelFrame(scheduledFrame);
    scheduledFrame = null;
  };

  const settle = () => {
    pending = false;
    cancelScheduledFrame();
    input.onSettledChange(true);
  };

  const schedule = () => {
    if (!pending || scheduledFrame !== null) {
      return;
    }
    scheduledFrame = input.requestFrame(runFrame);
  };

  const runFrame = () => {
    scheduledFrame = null;
    if (!pending || !currentRequest) {
      return;
    }
    if (!input.getShouldFollowOutput()) {
      settle();
      return;
    }
    if (!input.getIsActive() || !input.getIsReady()) {
      return;
    }

    const beforeAnchor = input.getGeometry();
    if (!isMeasurable(beforeAnchor)) {
      schedule();
      return;
    }

    input.stickToBottom();

    const geometry = input.getGeometry();
    if (!isMeasurable(geometry)) {
      stableFrameCount = 0;
      previousScrollHeight = null;
      schedule();
      return;
    }

    const heightStable =
      previousScrollHeight !== null && previousScrollHeight === geometry.scrollHeight;
    const layoutStable = isAtBottom(geometry) && heightStable && !input.getHasPendingMeasurements();
    stableFrameCount = layoutStable ? stableFrameCount + 1 : 0;
    previousScrollHeight = geometry.scrollHeight;

    const requiredStableFrames = currentRequest.isVirtualized
      ? VIRTUALIZED_STABLE_FRAME_COUNT
      : MOUNTED_STABLE_FRAME_COUNT;
    if (stableFrameCount >= requiredStableFrames) {
      settle();
      return;
    }
    schedule();
  };

  return {
    applyRequest(request) {
      if (
        currentRequest?.requestKey === request.requestKey &&
        currentRequest.isVirtualized === request.isVirtualized
      ) {
        schedule();
        return;
      }
      cancelScheduledFrame();
      currentRequest = request;
      pending = true;
      previousScrollHeight = null;
      stableFrameCount = 0;
      input.onSettledChange(false);
      schedule();
    },
    notifyStateChanged() {
      schedule();
    },
    cancelByUser() {
      settle();
    },
    destroy() {
      pending = false;
      currentRequest = null;
      cancelScheduledFrame();
    },
  };
}
