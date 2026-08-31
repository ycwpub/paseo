import { describe, expect, it } from "vitest";
import {
  completeHistoryStartPaginationRequest,
  createHistoryStartPaginationState,
  evaluateHistoryStartPagination,
  isHistoryStartLoadingOperation,
  rearmHistoryStartPagination,
  type HistoryStartPaginationInput,
} from "./history-start-pagination";

const visibleHistoryStart: HistoryStartPaginationInput = {
  distanceFromHistoryStart: 0,
  hasOlderHistory: true,
  isLoadingOlderHistory: false,
  isReady: true,
  progressKey: "epoch-1:20",
};

function requestOlderHistory() {
  return evaluateHistoryStartPagination(
    rearmHistoryStartPagination(createHistoryStartPaginationState()),
    visibleHistoryStart,
  );
}

describe("history start pagination completion regressions", () => {
  it("finishes a fast request even when the loading flag was never rendered", () => {
    const requested = requestOlderHistory();
    const completed = completeHistoryStartPaginationRequest(
      requested.state,
      "epoch-1:20",
      visibleHistoryStart,
      true,
    );

    expect(completed).toEqual({
      state: { status: "latched" },
      shouldLoad: false,
    });
    expect(isHistoryStartLoadingOperation(completed.state)).toBe(false);
  });

  it("settles a completed request when its page advanced before loading was rendered", () => {
    const requested = requestOlderHistory();
    const completed = completeHistoryStartPaginationRequest(
      requested.state,
      "epoch-1:20",
      { ...visibleHistoryStart, progressKey: "epoch-1:10" },
      true,
    );

    expect(completed).toEqual({
      state: { status: "settling", loadedProgressKey: "epoch-1:10" },
      shouldLoad: false,
    });
  });
});
