import { test, expect } from "../support/fixtures";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import {
  openSettingsSection,
  expectSettingsHeader,
  openAddHostFlow,
  selectHostConnectionType,
  toggleHostAdvanced,
  clickSettingsBackToWorkspace,
  verifyLegacyHostSettingsRedirect,
  expectAddHostMethodOptions,
  fillDirectHostUri,
  expectDirectHostFormValues,
  expectDirectHostSslEnabled,
  expectDirectHostUriValue,
  expectDirectHostUriHidden,
  expectDiagnosticsContent,
  expectAboutContent,
  expectGeneralContent,
  expectAppearanceContent,
  openSettingsHostSection,
} from "../support/helpers/settings";
import { openFeatureSettingsHostSection } from "../support/helpers/feature-settings";
import { getServerId } from "../support/helpers/server-id";
import { expectAppRoute } from "../support/helpers/route-assertions";
async function getScrollTop(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((element) => element.scrollTop);
}
test.describe("Settings sidebar navigation", () => {
  test("clicking a sidebar section updates the URL and renders the section", async ({ page }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await openSettingsSection(page, "diagnostics");
    await expectSettingsHeader(page, "Diagnostics");
    await expectDiagnosticsContent(page);
    await openSettingsSection(page, "about");
    await expectSettingsHeader(page, "About");
    await expectAboutContent(page);
    await openSettingsSection(page, "general");
    await expectSettingsHeader(page, "General");
    await expectGeneralContent(page);
    await openSettingsSection(page, "appearance");
    await expectSettingsHeader(page, "Appearance");
    await expectAppearanceContent(page);
  });
  test("keeps the desktop sidebar position when opening a lower host section", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 600 });
    await gotoAppShell(page);
    await openSettings(page);
    const sidebarScroll = page.getByTestId("settings-sidebar-scroll-body");
    const terminalsButton = page.getByTestId("settings-host-section-terminals");
    await terminalsButton.scrollIntoViewIfNeeded();
    await expect(terminalsButton).toBeVisible();
    const scrollTopBeforeNavigation = await getScrollTop(sidebarScroll);
    expect(scrollTopBeforeNavigation).toBeGreaterThan(0);
    await terminalsButton.click();
    await expectAppRoute(page, buildSettingsHostSectionRoute(getServerId(), "terminals"));
    await expect
      .poll(() => getScrollTop(sidebarScroll))
      .toBeGreaterThan(scrollTopBeforeNavigation / 2);
    await expect(terminalsButton).toBeVisible();
  });
  test("opens the standalone knowledge manager from the host sidebar", async ({ page }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await openFeatureSettingsHostSection(page, getServerId(), "knowledge");
    await expect(page.getByTestId("knowledge-management-section")).toBeVisible();
    await expect(page.getByTestId("knowledge-scope-global")).toBeVisible();
    await expect(page.getByTestId("knowledge-scope-assistant")).toBeVisible();
    await page.getByTestId("knowledge-scope-project").click();
    await expect(page.getByTestId("knowledge-project-selector")).toBeVisible();
  });
  test("opens plugin management without an incorrect host upgrade warning", async ({ page }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await openSettingsHostSection(page, getServerId(), "plugins");
    await expect(page.getByTestId("host-page-plugins")).toBeVisible();
    await expect(page.getByTestId("plugin-management-page")).toBeVisible();
    await expect(page.getByTestId("plugin-management-upgrade-warning")).toHaveCount(0);
  });
  test("/h/[serverId]/settings redirects to the host connections section", async ({ page }) => {
    await gotoAppShell(page);
    await verifyLegacyHostSettingsRedirect(page);
  });
  test("the + Add host button opens the add-host method modal", async ({ page }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await openAddHostFlow(page);
    await expectAddHostMethodOptions(page);
  });
  test("direct connection advanced URI round-trips SSL and password into the form", async ({
    page,
  }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await openAddHostFlow(page);
    await selectHostConnectionType(page, "direct");
    await toggleHostAdvanced(page);
    await fillDirectHostUri(page, "tcp://example.paseo.test:7443?ssl=true&password=shared-secret");
    await toggleHostAdvanced(page);
    await expectDirectHostFormValues(page, {
      host: "example.paseo.test",
      port: "7443",
      password: "shared-secret",
    });
    await expectDirectHostSslEnabled(page);
    await expectDirectHostUriHidden(page);
    await toggleHostAdvanced(page);
    await expectDirectHostUriValue(
      page,
      "tcp://example.paseo.test:7443?ssl=true&password=shared-secret",
    );
    await toggleHostAdvanced(page);
    await expectDirectHostUriHidden(page);
  });
  test("sidebar shows a Back to workspace row that leaves /settings", async ({ page }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await clickSettingsBackToWorkspace(page);
    await expect(page).not.toHaveURL(/\/settings(\/|$)/);
  });
  test("pressing Escape closes settings", async ({ page }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/\/settings(\/|$)/);
  });
  test("Escape lets settings dropdowns and modals close before leaving settings", async ({
    page,
  }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await test.step("a dropdown owns Escape", async () => {
      await openSettingsSection(page, "appearance");
      await page.getByLabel(/Theme:/).click();
      await expect(page.getByRole("menuitem", { name: "System", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menuitem", { name: "System", exact: true })).toHaveCount(0);
      await expect(page).toHaveURL(/\/settings(\/|$)/);
    });
    await test.step("a modal owns Escape", async () => {
      await openAddHostFlow(page);
      await expect(page.getByText("Add connection", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByText("Add connection", { exact: true })).toHaveCount(0);
      await expect(page).toHaveURL(/\/settings(\/|$)/);
    });
  });
});
