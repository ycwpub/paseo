import { describe, expect, it } from "vitest";
import { applyClaudeProjectDirectoryAccess } from "./project-directory-access.js";

describe("applyClaudeProjectDirectoryAccess", () => {
  it("adds writable and read-only Project roots as additional directories", () => {
    expect(
      applyClaudeProjectDirectoryAccess({
        options: { additionalDirectories: ["/repo/shared"] },
        cwd: "/repo/app",
        writableDirectories: ["/repo/app", "/repo/facade"],
        readOnlyDirectories: ["/reference/legacy"],
      }).additionalDirectories,
    ).toEqual(["/repo/shared", "/repo/facade", "/reference/legacy"]);
  });

  it("forces the native sandbox to deny writes under reference directories", () => {
    expect(
      applyClaudeProjectDirectoryAccess({
        options: {
          sandbox: {
            enabled: false,
            allowUnsandboxedCommands: true,
            filesystem: {
              disabled: true,
              denyWrite: ["/repo/generated"],
            },
          },
        },
        cwd: "/repo/app",
        writableDirectories: ["/repo/app"],
        readOnlyDirectories: ["/reference/legacy", "/reference/examples"],
      }).sandbox,
    ).toEqual({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        disabled: false,
        denyWrite: ["/repo/generated", "/reference/legacy", "/reference/examples"],
      },
    });
  });
});
