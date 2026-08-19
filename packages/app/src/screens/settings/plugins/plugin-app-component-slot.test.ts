import { describe, expect, it, vi } from "vitest";
import { resolvePluginAppComponentSlot } from "./plugin-app-component-slot";

const component = {
  id: "assistant_id",
  type: "text_input" as const,
  label: "助手",
};

describe("plugin app component slots", () => {
  it("passes the current form value and an isolated field updater to render slots", () => {
    const onChange = vi.fn();
    const slot = vi.fn(({ value }) => `selected:${String(value)}`);

    const result = resolvePluginAppComponentSlot(slot, {
      component,
      form: { assistant_id: "assistant-1", memory_assistant: true },
      value: "assistant-1",
      onChange,
    });

    expect(result).toBe("selected:assistant-1");
    expect(slot).toHaveBeenCalledWith({
      component,
      form: { assistant_id: "assistant-1", memory_assistant: true },
      value: "assistant-1",
      onChange,
    });
  });

  it("returns static slot content unchanged", () => {
    expect(
      resolvePluginAppComponentSlot("custom field", {
        component,
        form: {},
        value: undefined,
        onChange: vi.fn(),
      }),
    ).toBe("custom field");
  });
});
