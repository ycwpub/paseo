import { describe, expect, it } from "vitest";
import { usageCommandError } from "./command.js";

describe("usage command errors", () => {
  it("redacts bearer tokens and JWTs", () => {
    const error = new Error("fallback") as Error & { stderr: string };
    error.stderr =
      "failed with Bearer secret-token and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature";

    expect(usageCommandError(error)).toBe("failed with Bearer [REDACTED] and [REDACTED_JWT]");
  });
});
