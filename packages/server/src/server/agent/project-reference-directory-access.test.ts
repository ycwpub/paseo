import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findProjectDirectoryAccessConflict,
  inferReadOnlyProjectDirectoriesFromSystemPrompt,
  normalizeReadOnlyProjectDirectories,
} from "./project-reference-directory-access.js";

describe("project reference directory access", () => {
  it("normalizes and de-duplicates read-only directories", () => {
    expect(
      normalizeReadOnlyProjectDirectories([" /repo/reference ", "/repo/reference", "~/docs"]),
    ).toEqual(["/repo/reference", path.join(process.env.HOME ?? "", "docs")]);
  });

  it("detects overlap in either direction", () => {
    expect(
      findProjectDirectoryAccessConflict({
        writableDirectories: ["/repo/app"],
        readOnlyDirectories: ["/repo/app/reference"],
      }),
    ).toEqual({
      writableDirectory: "/repo/app",
      readOnlyDirectory: "/repo/app/reference",
    });
    expect(
      findProjectDirectoryAccessConflict({
        writableDirectories: ["/repo/reference/generated"],
        readOnlyDirectories: ["/repo/reference"],
      }),
    ).toEqual({
      writableDirectory: "/repo/reference/generated",
      readOnlyDirectory: "/repo/reference",
    });
  });

  it("extracts reference directories from persisted Project context prompts", () => {
    expect(
      inferReadOnlyProjectDirectoriesFromSystemPrompt(`
<paseo_project_context>
Reference directories (read-only; read on demand):
- /repo/legacy
- /repo/examples

Knowledge directories (mandatory instructions):
- None configured
</paseo_project_context>`),
    ).toEqual(["/repo/legacy", "/repo/examples"]);
  });
});
