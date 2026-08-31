import { describe, expect, it } from "vitest";
import {
  PaseoConfigRawSchema,
  resolvePaseoProjectDirectoryEntries,
} from "./paseo-config-schema.js";
import {
  inferGitRepositoryDirectoryName,
  resolveGitRepositoryManagedPath,
} from "./project-git-resource.js";

describe("Project Git resources", () => {
  it("derives safe managed repository paths from common Git remotes", () => {
    expect(inferGitRepositoryDirectoryName("https://example.com/team/service.git")).toBe("service");
    expect(inferGitRepositoryDirectoryName("git@example.com:team/service.git")).toBe("service");
    expect(
      resolveGitRepositoryManagedPath({
        repository: "https://example.com/team/service.git",
        directory: "payments-service",
      }),
    ).toBe("{{projectRoot}}/repos/payments-service");
  });

  it("parses and resolves Git-backed Project and knowledge directories", () => {
    const config = PaseoConfigRawSchema.parse({
      project: {
        directories: {
          project: [
            {
              type: "git-repository",
              repository: "git@example.com:team/service.git",
              branch: "feature/payment",
              directory: "service-feature",
            },
          ],
        },
        knowledge: {
          general: [
            {
              type: "git-repository",
              source: "https://example.com/docs/runbooks.git",
              branch: "main",
            },
          ],
        },
      },
    });

    expect(resolvePaseoProjectDirectoryEntries(config.project?.directories).project).toEqual([
      {
        type: "git-repository",
        path: "{{projectRoot}}/repos/service-feature",
        repository: "git@example.com:team/service.git",
        branch: "feature/payment",
        directory: "service-feature",
        enabled: true,
      },
    ]);
    expect(config.project?.knowledge?.general?.[0]).toMatchObject({
      type: "git-repository",
      source: "https://example.com/docs/runbooks.git",
      branch: "main",
    });
  });
});
