import { describe, expect, it, vi } from "vitest";
import { createWebRouteBottomAnchorDriver } from "./web-route-bottom-anchor";

function createFrameScheduler() {
  let nextFrame = 1;
  const callbacks = new Map<number, () => void>();
  return {
    requestFrame(callback: () => void) {
      const frame = nextFrame;
      nextFrame += 1;
      callbacks.set(frame, callback);
      return frame;
    },
    cancelFrame(frame: number) {
      callbacks.delete(frame);
    },
    flushFrame() {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pending) {
        callback();
      }
    },
    get size() {
      return callbacks.size;
    },
  };
}

describe("createWebRouteBottomAnchorDriver", () => {
  it("keeps re-anchoring virtualized history until late row measurements stabilize", () => {
    const scheduler = createFrameScheduler();
    const geometry = {
      clientHeight: 500,
      scrollHeight: 1200,
      scrollTop: 0,
    };
    let pendingMeasurements = true;
    const settledChanges: boolean[] = [];
    const stickToBottom = vi.fn(() => {
      geometry.scrollTop = geometry.scrollHeight - geometry.clientHeight;
    });
    const driver = createWebRouteBottomAnchorDriver({
      getIsActive: () => true,
      getIsReady: () => true,
      getShouldFollowOutput: () => true,
      getHasPendingMeasurements: () => pendingMeasurements,
      getGeometry: () => geometry,
      stickToBottom,
      onSettledChange: (settled) => settledChanges.push(settled),
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
    });

    driver.applyRequest({ requestKey: "route-1", isVirtualized: true });
    scheduler.flushFrame();
    expect(geometry.scrollTop).toBe(700);

    geometry.scrollHeight = 1800;
    scheduler.flushFrame();
    expect(geometry.scrollTop).toBe(1300);

    geometry.scrollHeight = 2600;
    pendingMeasurements = false;
    scheduler.flushFrame();
    expect(geometry.scrollTop).toBe(2100);
    expect(settledChanges).toEqual([false]);

    scheduler.flushFrame();
    scheduler.flushFrame();

    expect(geometry.scrollTop).toBe(2100);
    expect(settledChanges).toEqual([false, true]);
    expect(scheduler.size).toBe(0);
    expect(stickToBottom).toHaveBeenCalledTimes(5);
  });

  it("stops restoring the bottom after the user intentionally scrolls upward", () => {
    const scheduler = createFrameScheduler();
    const geometry = {
      clientHeight: 500,
      scrollHeight: 1800,
      scrollTop: 0,
    };
    const stickToBottom = vi.fn(() => {
      geometry.scrollTop = geometry.scrollHeight - geometry.clientHeight;
    });
    const driver = createWebRouteBottomAnchorDriver({
      getIsActive: () => true,
      getIsReady: () => true,
      getShouldFollowOutput: () => true,
      getHasPendingMeasurements: () => false,
      getGeometry: () => geometry,
      stickToBottom,
      onSettledChange: vi.fn(),
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
    });

    driver.applyRequest({ requestKey: "route-1", isVirtualized: true });
    scheduler.flushFrame();
    expect(geometry.scrollTop).toBe(1300);

    driver.cancelByUser();
    geometry.scrollTop = 400;
    geometry.scrollHeight = 2400;
    scheduler.flushFrame();

    expect(geometry.scrollTop).toBe(400);
    expect(stickToBottom).toHaveBeenCalledOnce();
    expect(scheduler.size).toBe(0);
  });
});
