import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = readFileSync(
  new URL("./use-project-git-repositories.ts", import.meta.url),
  "utf8",
);

describe("project Git repository query policy", () => {
  it("uses a finite stale time accepted by the fetch-query wrapper", () => {
    expect(hookSource).toContain("staleTimeMs: CHECKOUT_STATUS_STALE_TIME");
    expect(hookSource).not.toContain("staleTimeMs: Infinity");
  });
});
