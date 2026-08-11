/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters expose native callbacks. */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/workflows/workflow-text-input", () => ({
  WorkflowTextInput: ({
    onChangeText,
    onContentSizeChange,
    multiline,
    numberOfLines,
    scrollEnabled,
    style,
  }: {
    onChangeText?: (value: string) => void;
    onContentSizeChange?: (event: {
      nativeEvent: { contentSize: { height: number; width: number } };
    }) => void;
    multiline?: boolean;
    numberOfLines?: number;
    scrollEnabled?: boolean;
    style?: unknown;
  }) => (
    <>
      <textarea
        data-testid="workflow-title"
        data-multiline={multiline ? "true" : "false"}
        data-number-of-lines={numberOfLines}
        data-scroll-enabled={scrollEnabled ? "true" : "false"}
        data-style={JSON.stringify(style)}
        onChange={(event) => onChangeText?.(event.target.value)}
      />
      <button
        type="button"
        data-testid="grow-title"
        onClick={() =>
          onContentSizeChange?.({
            nativeEvent: { contentSize: { height: 86, width: 320 } },
          })
        }
      />
      <button
        type="button"
        data-testid="overflow-title"
        onClick={() =>
          onContentSizeChange?.({
            nativeEvent: { contentSize: { height: 180, width: 320 } },
          })
        }
      />
    </>
  ),
}));

import { WorkflowWrappingTitleInput } from "./workflow-wrapping-title-input";

describe("WorkflowWrappingTitleInput", () => {
  afterEach(cleanup);

  it("wraps and grows to show the complete title without internal scrolling", () => {
    render(<WorkflowWrappingTitleInput value="a long workflow title" />);

    const title = screen.getByTestId("workflow-title");
    expect(title.getAttribute("data-multiline")).toBe("true");
    expect(title.getAttribute("data-number-of-lines")).toBe("1");
    expect(title.getAttribute("data-style")).toContain('"height":48');

    fireEvent.click(screen.getByTestId("grow-title"));
    expect(title.getAttribute("data-style")).toContain('"height":94');
    expect(title.getAttribute("data-scroll-enabled")).toBe("false");

    fireEvent.click(screen.getByTestId("overflow-title"));
    expect(title.getAttribute("data-style")).toContain('"height":188');
    expect(title.getAttribute("data-scroll-enabled")).toBe("false");
  });

  it("resets the measured height before remeasuring edited content", () => {
    const onChangeText = vi.fn();
    render(
      <WorkflowWrappingTitleInput value="a long workflow title" onChangeText={onChangeText} />,
    );

    const title = screen.getByTestId("workflow-title");
    fireEvent.click(screen.getByTestId("grow-title"));
    expect(title.getAttribute("data-style")).toContain('"height":94');

    fireEvent.change(title, { target: { value: "short" } });

    expect(onChangeText).toHaveBeenCalledWith("short");
    expect(title.getAttribute("data-style")).toContain('"height":48');
  });
});
