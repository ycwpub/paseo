// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import React, { useCallback, useRef, type ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useExpandedMarkdownDraft } from "./use-expanded-markdown-draft";

function appendTemplate(current: string): string {
  return `${current}\n模板内容`;
}

function ExpandedDraftHarness({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const draft = useExpandedMarkdownDraft({ value, onCommit });
  const { isOpen, initialValue, resetKey, updateDraft, open, commitAndClose } = draft;
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateDraft(event.currentTarget.value);
    },
    [updateDraft],
  );
  const handleDone = useCallback(() => {
    commitAndClose(inputRef.current?.value);
  }, [commitAndClose]);
  return (
    <>
      <button type="button" onClick={open}>
        打开
      </button>
      {isOpen ? (
        <textarea
          key={resetKey}
          ref={inputRef}
          defaultValue={initialValue}
          onChange={handleChange}
          data-testid="expanded-draft-input"
        />
      ) : null}
      <button type="button" onClick={handleDone}>
        完成
      </button>
    </>
  );
}

describe("useExpandedMarkdownDraft", () => {
  it("keeps an in-progress IME draft native-owned across external composer refreshes", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useExpandedMarkdownDraft({ value, onCommit }),
      { initialProps: { value: "原始内容" } },
    );

    act(() => {
      result.current.open();
      result.current.updateDraft("shu");
    });

    const resetKey = result.current.resetKey;
    rerender({ value: "服务端刷新后的旧内容" });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.initialValue).toBe("原始内容");
    expect(result.current.resetKey).toBe(resetKey);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.updateDraft("输入中文");
    });
    act(() => {
      result.current.commitAndClose();
    });

    expect(onCommit).toHaveBeenCalledWith("输入中文");
    expect(result.current.isOpen).toBe(false);
  });

  it("discards an unfinished draft and reloads the latest value when reopened", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useExpandedMarkdownDraft({ value, onCommit }),
      { initialProps: { value: "第一次内容" } },
    );

    act(() => {
      result.current.open();
      result.current.updateDraft("未完成内容");
      result.current.dismiss();
    });
    rerender({ value: "最新内容" });
    act(() => {
      result.current.open();
    });

    expect(result.current.initialValue).toBe("最新内容");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("resets the native editor only for explicit draft replacements", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useExpandedMarkdownDraft({ value: "已有内容", onCommit }));

    act(() => {
      result.current.open();
      result.current.updateDraft("输入中的内容");
    });
    const resetKey = result.current.resetKey;

    act(() => {
      result.current.replaceDraft(appendTemplate);
    });

    expect(result.current.initialValue).toBe("输入中的内容\n模板内容");
    expect(result.current.resetKey).toBe(resetKey + 1);

    act(() => {
      result.current.commitAndClose();
    });
    expect(onCommit).toHaveBeenCalledWith("输入中的内容\n模板内容");
  });

  it("does not replace the browser textarea value while Chinese IME composition is active", () => {
    const onCommit = vi.fn();
    const view = render(<ExpandedDraftHarness value="原始内容" onCommit={onCommit} />);

    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    const input = screen.getByTestId("expanded-draft-input") as HTMLTextAreaElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "shu" } });
    view.rerender(<ExpandedDraftHarness value="外部刷新的旧内容" onCommit={onCommit} />);

    expect(input).toHaveProperty("value", "shu");
    expect(onCommit).not.toHaveBeenCalled();

    input.value = "输";
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: "输" } });
    fireEvent.click(screen.getByRole("button", { name: "完成" }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("输");
  });
});
