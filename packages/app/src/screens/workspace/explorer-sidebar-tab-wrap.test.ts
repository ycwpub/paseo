import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./explorer-sidebar-tab-rail.tsx", import.meta.url), "utf8");

describe("Explorer sidebar tab wrapping", () => {
  it("wraps tabs onto another row instead of forcing a single horizontal line", () => {
    expect(source).toContain('testID="explorer-sidebar-tabs-wrap"');
    expect(source).toContain('flexWrap: "wrap"');
    expect(source).toContain('layout="wrap"');
    expect(source).not.toContain("<Animated.ScrollView");
  });
});
