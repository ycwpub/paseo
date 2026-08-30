export interface CompleteQueuedSubmitInput {
  queued: boolean;
  clearDraft: (lifecycle: "sent") => void;
  clearInput: () => void;
  clearAttachments: () => void;
  resetSuppression: () => void;
}

/**
 * Finalizes composer state only after a message was actually added to the queue.
 * Keeping this outside the generic submit helper lets the queue owner preserve
 * its draft lifecycle without changing the upstream submit contract.
 */
export function completeQueuedSubmit(input: CompleteQueuedSubmitInput): boolean {
  if (!input.queued) {
    return false;
  }
  input.clearDraft("sent");
  input.clearInput();
  input.clearAttachments();
  input.resetSuppression();
  return true;
}
