import { describe, expect, it } from "vitest";
import { buildByteDevelopmentFixedFormValues } from "./project-context-model";

describe("byte development project context", () => {
  it("injects the selected Project id, repository and document links", () => {
    expect(
      buildByteDevelopmentFixedFormValues({
        projectId: "project-1",
        repositoryPath: "/workspace/project-1",
        larkDocumentLinks: [
          "https://example.feishu.cn/wiki/architecture",
          "https://example.larksuite.com/docx/prd",
        ],
      }),
    ).toEqual({
      projectId: "project-1",
      repository_path: "/workspace/project-1",
      lark_document_links: [
        "https://example.feishu.cn/wiki/architecture",
        "https://example.larksuite.com/docx/prd",
      ],
    });
  });

  it("does not create runnable values without a Project directory", () => {
    expect(
      buildByteDevelopmentFixedFormValues({
        projectId: "project-1",
        repositoryPath: null,
        larkDocumentLinks: [],
      }),
    ).toEqual({});
  });
});
