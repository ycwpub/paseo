import { describe, expect, it } from "vitest";
import { isProjectDirectoryTimeout } from "./load-error";

describe("isProjectDirectoryTimeout", () => {
  it("recognizes daemon message timeouts without hiding other errors", () => {
    expect(isProjectDirectoryTimeout("Timeout waiting for message (60000ms)")).toBe(true);
    expect(isProjectDirectoryTimeout("Host disconnected")).toBe(false);
  });
});
