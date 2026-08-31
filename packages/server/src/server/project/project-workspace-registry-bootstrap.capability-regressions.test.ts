import { beforeEach, describe, expect, test, vi } from "vitest";

const { bootstrapWorkspaceRegistries, migrateLegacyProjectIds, migrateManagedProjectStorage } =
  vi.hoisted(() => ({
    bootstrapWorkspaceRegistries: vi.fn(),
    migrateLegacyProjectIds: vi.fn(),
    migrateManagedProjectStorage: vi.fn(),
  }));

vi.mock("../workspace-registry-bootstrap.js", () => ({
  bootstrapWorkspaceRegistries,
}));
vi.mock("../migrations/migrate-project-ids.migration.js", () => ({
  migrateLegacyProjectIds,
}));
vi.mock("../migrations/migrate-managed-project-storage.migration.js", () => ({
  migrateManagedProjectStorage,
}));

import { bootstrapProjectWorkspaceRegistries } from "./project-workspace-registry-bootstrap.js";

describe("bootstrapProjectWorkspaceRegistries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bootstrapWorkspaceRegistries.mockResolvedValue(undefined);
    migrateLegacyProjectIds.mockResolvedValue(undefined);
    migrateManagedProjectStorage.mockResolvedValue(undefined);
  });

  test("runs Project migrations after the upstream registry bootstrap", async () => {
    const options = { paseoHome: "/tmp/paseo" };

    await bootstrapProjectWorkspaceRegistries(options as never);

    expect(bootstrapWorkspaceRegistries).toHaveBeenCalledWith(options);
    expect(migrateLegacyProjectIds).toHaveBeenCalledWith(options);
    expect(migrateManagedProjectStorage).toHaveBeenCalledWith(options);
    expect(bootstrapWorkspaceRegistries.mock.invocationCallOrder[0]).toBeLessThan(
      migrateLegacyProjectIds.mock.invocationCallOrder[0]!,
    );
    expect(migrateLegacyProjectIds.mock.invocationCallOrder[0]).toBeLessThan(
      migrateManagedProjectStorage.mock.invocationCallOrder[0]!,
    );
  });
});
