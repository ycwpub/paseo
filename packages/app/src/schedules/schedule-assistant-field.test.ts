import { describe, expect, it } from "vitest";
import { shouldShowScheduleAssistantField } from "./schedule-assistant-field";

describe("shouldShowScheduleAssistantField", () => {
  it("shows the assistant selector for new-agent schedules with a selected host", () => {
    expect(
      shouldShowScheduleAssistantField({
        targetKind: "new-agent",
        selectedServerId: "host-a",
      }),
    ).toBe(true);
  });

  it.each(["agent", "bash"] as const)(
    "hides the assistant selector for %s schedules",
    (targetKind) => {
      expect(
        shouldShowScheduleAssistantField({
          targetKind,
          selectedServerId: "host-a",
        }),
      ).toBe(false);
    },
  );

  it("hides the assistant selector until a host is selected", () => {
    expect(
      shouldShowScheduleAssistantField({
        targetKind: "new-agent",
        selectedServerId: null,
      }),
    ).toBe(false);
  });
});
