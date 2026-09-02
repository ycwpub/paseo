import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("collapsed process history window wiring", () => {
  it("calculates the mounted window from the same visible tail that is rendered", () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, "view.tsx"), "utf8");

    expect(source).toContain("items: processVisibility.tail");
    expect(source).toContain("tail: processVisibility.tail");
  });
});
