import { describe, expect, test } from "vitest";
import { createLarkSubstituteScanDispatchOptions } from "./lark-substitute-scan-dispatch.js";

describe("Lark substitute scan dispatch policy", () => {
  test("bypasses realtime debounce while preserving the selected substitute mode", () => {
    expect(createLarkSubstituteScanDispatchOptions("mode-1")).toEqual({
      bypassSubstituteDelay: true,
      modeId: "mode-1",
    });
  });
});
