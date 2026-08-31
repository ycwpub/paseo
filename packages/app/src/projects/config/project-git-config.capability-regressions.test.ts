import { describe, expect, it } from "vitest";
import {
  applyDraftToConfig,
  configToDraft,
  projectDirectoryDraftError,
} from "./project-config-editor-model";

describe("Project Git directory configuration", () => {
  it("round-trips repository, branch, target directory, and knowledge Git metadata", () => {
    const base = {
      project: {
        directoryMode: "multiple" as const,
        directories: {
          project: [
            {
              type: "git-repository" as const,
              repository: "git@example.com:team/service.git",
              branch: "feature/payment",
              directory: "service-feature",
            },
          ],
        },
        knowledge: {
          general: [
            {
              type: "git-repository" as const,
              source: "https://example.com/team/runbooks.git",
              branch: "main",
              directory: "runbooks",
            },
          ],
        },
      },
    };

    const draft = configToDraft(base);

    expect(draft.projectDirectories.project[0]).toMatchObject({
      type: "git-repository",
      repository: "git@example.com:team/service.git",
      branch: "feature/payment",
      directory: "service-feature",
    });
    expect(draft.projectKnowledge.general[0]).toMatchObject({
      type: "git-repository",
      source: "https://example.com/team/runbooks.git",
      branch: "main",
      directory: "runbooks",
    });
    expect(applyDraftToConfig({ draft, base })).toMatchObject(base);
  });

  it("rejects ambiguous managed repository destinations before saving", () => {
    const draft = configToDraft({
      project: {
        directoryMode: "multiple",
        directories: {
          project: [
            {
              type: "git-repository",
              repository: "https://example.com/team/first.git",
              directory: "service",
            },
            {
              type: "git-repository",
              repository: "https://example.com/team/second.git",
              directory: "service",
            },
          ],
        },
      },
    });

    expect(projectDirectoryDraftError(draft, "single required")).toContain(
      "会下载到 repos/service",
    );
  });
});
