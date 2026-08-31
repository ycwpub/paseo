import path from "node:path";
import { existsSync } from "node:fs";
import { test, expect, type Page } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import {
  addProjectFlowInput,
  chooseAddProjectMethod,
  openAddProjectFlow,
} from "../support/helpers/add-project-flow";
import {
  connectSeedClient,
  seedWorkspace,
  type SeedDaemonClient,
} from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import { projectEquivalenceViewKey } from "../support/helpers/project-view-key";
import { projectPlacementViewKey } from "../support/helpers/project-view-key";
import { createTempGitRepo } from "../support/helpers/workspace";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";
function workspaceRowTestId(workspaceId: string): string {
  return `sidebar-workspace-row-${getServerId()}:${workspaceId}`;
}

type DirectorylessProjectSeedClient = SeedDaemonClient & {
  createDirectorylessProject(input: { name: string }): Promise<{
    project: {
      projectId: string;
      projectKey?: string | null;
      projectDisplayName: string;
      projectRootPath: string;
    } | null;
    error: string | null;
  }>;
};

async function archiveWorkspaceFromSidebar(page: Page, workspaceId: string): Promise<void> {
  const serverId = getServerId();
  const row = page.getByTestId(workspaceRowTestId(workspaceId));
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.hover();
  const kebab = page.getByTestId(`sidebar-workspace-kebab-${serverId}:${workspaceId}`);
  await expect(kebab).toBeVisible({ timeout: 10000 });
  await kebab.click();
  const archiveItem = page.getByTestId(`sidebar-workspace-menu-archive-${serverId}:${workspaceId}`);
  await expect(archiveItem).toBeVisible({ timeout: 10000 });
  await archiveItem.click();
}
async function addProjectFromPicker(page: Page, projectPath: string): Promise<string> {
  await openAddProjectFlow(page);
  await chooseAddProjectMethod(page, "directory-search");
  const input = addProjectFlowInput(page);
  await input.fill(projectPath);
  await page.keyboard.press("Enter");
  const projectRow = page
    .locator('[data-testid^="sidebar-project-row-"]')
    .filter({ hasText: path.basename(projectPath) })
    .first();
  await expect(projectRow).toBeVisible({ timeout: 30000 });
  const testId = await projectRow.getAttribute("data-testid");
  expect(testId).not.toBeNull();
  return testId!.replace("sidebar-project-row-", "");
}
async function waitForSidebarProjectListReady(page: Page): Promise<void> {
  await page
    .locator('[data-testid="sidebar-project-empty-state"], [data-testid^="sidebar-project-row-"]')
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
}
// Projects are parents in the sidebar. Archiving the last workspace leaves the
// project row in place with a ghost "+ New workspace" child row.
test.describe("Project with no workspaces persists", () => {
  test("a directoryless Project exposes Workspace creation", async ({ page }) => {
    const client = (await connectSeedClient()) as DirectorylessProjectSeedClient;
    const created = await client.createDirectorylessProject({
      name: `Directoryless ${Date.now()}`,
    });
    const project = created.project;
    expect(created.error).toBeNull();
    expect(project).not.toBeNull();
    if (!project) {
      throw new Error("Directoryless Project was not created");
    }
    const projectViewKey = project.projectKey
      ? projectEquivalenceViewKey(project.projectKey)
      : projectPlacementViewKey(getServerId(), project.projectId);
    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      const projectRow = page.getByTestId(`sidebar-project-row-${projectViewKey}`);
      await expect(projectRow).toBeVisible({ timeout: 30000 });
      await projectRow.hover();
      await expect(
        page.getByTestId(`sidebar-project-new-worktree-${projectViewKey}`),
      ).toBeVisible();
      await expect(
        page.getByTestId(`sidebar-project-new-workspace-row-${projectViewKey}`),
      ).toBeVisible();
    } finally {
      await client.removeProject(project.projectId).catch(() => undefined);
      await client.close().catch(() => undefined);
    }
  });
  test("adding a project starts with only a new-workspace child row", async ({ page }) => {
    const repo = await createTempGitRepo("empty-project-add-");
    const client = await connectSeedClient();
    let projectId: string | null = null;
    try {
      await gotoAppShell(page);
      await waitForSidebarProjectListReady(page);
      projectId = await addProjectFromPicker(page, repo.path);
      const projectRow = page.getByTestId(`sidebar-project-row-${projectId}`);
      await expect(projectRow).toBeVisible({ timeout: 30000 });
      await expect(projectRow).toContainText(path.basename(repo.path));
      await expect(page.getByTestId(`sidebar-workspace-list-${projectId}`)).toHaveCount(0);
      const newWorkspaceRow = page.getByTestId(`sidebar-project-new-workspace-row-${projectId}`);
      await expect(newWorkspaceRow).toBeVisible({ timeout: 30000 });
      await expect(newWorkspaceRow).toContainText("New workspace");
      const workspaces = await client.fetchWorkspaces({ filter: { projectId } });
      expect(workspaces.entries).toEqual([]);
    } finally {
      if (projectId) {
        await client.removeProject(projectId).catch(() => undefined);
      }
      await client.close().catch(() => undefined);
      await repo.cleanup().catch(() => undefined);
    }
  });
  test("archiving the only workspace keeps the project row with creation still reachable", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "empty-project-persists-" });
    try {
      const projectViewKey = projectEquivalenceViewKey(workspace.projectKey);
      const projectRow = page.getByTestId(`sidebar-project-row-${projectViewKey}`);
      const newWorkspaceRow = page.getByTestId(
        `sidebar-project-new-workspace-row-${projectViewKey}`,
      );
      const globalNewWorkspace = page.getByTestId("sidebar-global-new-workspace");
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await expect(projectRow).toBeVisible({ timeout: 30000 });
      const workspaceRow = page.getByTestId(workspaceRowTestId(workspace.workspaceId));
      await expect(workspaceRow).toBeVisible({
        timeout: 30000,
      });
      await workspaceRow.click();
      await expect(page.getByTestId("changes-primary-cta")).toHaveCount(0);
      await archiveWorkspaceFromSidebar(page, workspace.workspaceId);
      // The workspace row goes away, but its project parent stays and exposes a
      // child row for creating the next workspace.
      await expect(page.getByTestId(workspaceRowTestId(workspace.workspaceId))).toHaveCount(0, {
        timeout: 30000,
      });
      expect(existsSync(workspace.repoPath)).toBe(true);
      await expect(projectRow).toBeVisible({ timeout: 30000 });
      await expect(newWorkspaceRow).toBeVisible({ timeout: 30000 });
      await expect(newWorkspaceRow).toContainText("New workspace");
      await expect(globalNewWorkspace).toBeVisible({ timeout: 30000 });
      // The project survives a reload after its last workspace is archived.
      await page.reload();
      await waitForSidebarHydration(page);
      await expect(projectRow).toBeVisible({ timeout: 30000 });
      await expect(newWorkspaceRow).toBeVisible({ timeout: 30000 });
    } finally {
      await workspace.cleanup();
    }
  });
});
