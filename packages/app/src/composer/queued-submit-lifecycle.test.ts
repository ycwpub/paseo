import { describe, expect, it, vi } from "vitest";
import { completeQueuedSubmit } from "./queued-submit-lifecycle";

describe("completeQueuedSubmit", () => {
  it("clears the persisted and visible draft after queue insertion", () => {
    const clearDraft = vi.fn();
    const clearInput = vi.fn();
    const clearAttachments = vi.fn();
    const resetSuppression = vi.fn();

    expect(
      completeQueuedSubmit({
        queued: true,
        clearDraft,
        clearInput,
        clearAttachments,
        resetSuppression,
      }),
    ).toBe(true);
    expect(clearDraft).toHaveBeenCalledWith("sent");
    expect(clearInput).toHaveBeenCalledOnce();
    expect(clearAttachments).toHaveBeenCalledOnce();
    expect(resetSuppression).toHaveBeenCalledOnce();
  });

  it("keeps the draft when no queue entry was created", () => {
    const clearDraft = vi.fn();
    const clearInput = vi.fn();
    const clearAttachments = vi.fn();
    const resetSuppression = vi.fn();

    expect(
      completeQueuedSubmit({
        queued: false,
        clearDraft,
        clearInput,
        clearAttachments,
        resetSuppression,
      }),
    ).toBe(false);
    expect(clearDraft).not.toHaveBeenCalled();
    expect(clearInput).not.toHaveBeenCalled();
    expect(clearAttachments).not.toHaveBeenCalled();
    expect(resetSuppression).not.toHaveBeenCalled();
  });
});
