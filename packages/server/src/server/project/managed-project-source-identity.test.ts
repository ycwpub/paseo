import { describe, expect, test } from "vitest";

import { getManagedProjectIdForSourceDirectory } from "./managed-project-source-identity.js";

describe("getManagedProjectIdForSourceDirectory", () => {
  test("recognizes a host-managed Project source directory", () => {
    expect(
      getManagedProjectIdForSourceDirectory(
        "/Users/test/.paseo",
        "/Users/test/.paseo/projects/prj_0123456789abcdef",
      ),
    ).toBe("prj_0123456789abcdef");
  });

  test("rejects nested and ordinary directories", () => {
    expect(
      getManagedProjectIdForSourceDirectory(
        "/Users/test/.paseo",
        "/Users/test/.paseo/projects/prj_0123456789abcdef/repos/app",
      ),
    ).toBeNull();
    expect(
      getManagedProjectIdForSourceDirectory("/Users/test/.paseo", "/Users/test/code/app"),
    ).toBeNull();
  });
});
