import { describe, expect, it } from "vitest";
import { FileExplorerRequestError } from "@getpaseo/client";
import { isMissingFileExplorerRootError } from "./use-file-explorer-actions";

describe("isMissingFileExplorerRootError", () => {
  it("marks only a missing configured root as unavailable", () => {
    const error = new FileExplorerRequestError("Directory does not exist", "not_found");

    expect(isMissingFileExplorerRootError(".", error)).toBe(true);
    expect(isMissingFileExplorerRootError("nested", error)).toBe(false);
    expect(isMissingFileExplorerRootError(".", new Error("Connection closed"))).toBe(false);
  });
});
