import { describe, expect, it } from "vitest";
import {
  inferWritableProjectDirectoriesFromSystemPrompt,
  normalizeWritableProjectDirectories,
  resolveAdditionalWritableDirectories,
} from "./project-directory-access.js";

describe("project directory access", () => {
  it("normalizes and deduplicates configured project directories", () => {
    expect(
      normalizeWritableProjectDirectories(["/repo/tool", "/repo/./facade", "/repo/facade", ""]),
    ).toEqual(["/repo/tool", "/repo/facade"]);
  });

  it("preserves Windows absolute paths when recovering cross-platform sessions", () => {
    expect(normalizeWritableProjectDirectories(["C:\\repo\\tool", "C:\\repo\\tool"])).toEqual([
      "C:\\repo\\tool",
    ]);
  });

  it("keeps every repository except the implicit cwd as an additional writable directory", () => {
    expect(
      resolveAdditionalWritableDirectories({
        cwd: "/repo/tool",
        projectDirectories: ["/repo/tool", "/repo/facade"],
        configuredDirectories: ["/repo/shared", "/repo/facade"],
      }),
    ).toEqual(["/repo/shared", "/repo/facade"]);
  });

  it("recovers multi-repository access from persisted legacy Project context", () => {
    expect(
      inferWritableProjectDirectoriesFromSystemPrompt(`
<paseo_project_context>
Primary working directory: /repo/tool

Project directories (read on demand; do not load everything unless needed):
- /repo/tool
- /repo/facade

Knowledge directories (mandatory instructions):
- None configured
</paseo_project_context>`),
    ).toEqual(["/repo/tool", "/repo/facade"]);
  });

  it("recovers Windows repositories from persisted legacy Project context", () => {
    expect(
      inferWritableProjectDirectoriesFromSystemPrompt(`
<paseo_project_context>
Project directories (read on demand; do not load everything unless needed):
- C:\\repo\\tool
- D:\\repo\\facade

Knowledge directories (mandatory instructions):
- None configured
</paseo_project_context>`),
    ).toEqual(["C:\\repo\\tool", "D:\\repo\\facade"]);
  });
});
