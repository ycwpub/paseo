/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkflowEditorGuard } from "./use-workflow-editor-guard";

vi.mock("@/constants/platform", () => ({
  isWeb: true,
}));

function GuardHarness({
  dirty,
  saveEnabled,
  onSave,
}: {
  dirty: boolean;
  saveEnabled: boolean;
  onSave: () => void;
}) {
  useWorkflowEditorGuard({ dirty, saveEnabled, onSave });
  return null;
}

describe("useWorkflowEditorGuard", () => {
  afterEach(cleanup);

  it("saves with the platform shortcut when saving is available", () => {
    const onSave = vi.fn();
    render(<GuardHarness dirty saveEnabled onSave={onSave} />);

    const event = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("does not intercept the browser shortcut when saving is unavailable", () => {
    const onSave = vi.fn();
    render(<GuardHarness dirty={false} saveEnabled={false} onSave={onSave} />);

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("protects dirty drafts from accidental browser navigation", () => {
    const onSave = vi.fn();
    render(<GuardHarness dirty saveEnabled onSave={onSave} />);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
