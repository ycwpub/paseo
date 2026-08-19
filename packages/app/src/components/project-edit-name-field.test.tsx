import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectEditNameField } from "./project-edit-name-field";

const inputState = vi.hoisted(() => ({
  latestInitialValue: "",
}));

vi.mock("@/components/ui/form-field", async () => {
  const ReactModule = await import("react");
  return {
    Field: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement("div", null, children),
    FormTextInput: (props: { initialValue?: string; testID?: string }) => {
      inputState.latestInitialValue = props.initialValue ?? "";
      return ReactModule.createElement("input", {
        defaultValue: props.initialValue,
        "data-testid": props.testID,
      });
    },
  };
});

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container.remove();
});

function renderNameField(initialName: string) {
  act(() => {
    root?.render(
      <ProjectEditNameField
        initialName={initialName}
        placeholder="默认名称"
        label="项目名称"
        accessibilityLabel="项目名称"
        error={null}
        size="sm"
        disabled={false}
        onChangeText={vi.fn()}
      />,
    );
  });
}

describe("ProjectEditNameField", () => {
  it("keeps the edit-session seed stable when parent state refreshes during IME input", () => {
    renderNameField("douyin");
    expect(inputState.latestInitialValue).toBe("douyin");

    // The external form publishes every intermediate IME value. A changing
    // defaultValue here would interrupt the browser's active composition.
    renderNameField("抖音");

    expect(inputState.latestInitialValue).toBe("douyin");
  });
});
