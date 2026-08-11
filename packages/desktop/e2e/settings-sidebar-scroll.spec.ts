import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { gotoAppShell, openSettings } from "./helpers/app";
import { expectAppRoute } from "./helpers/route-assertions";
import { getServerId } from "./helpers/server-id";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";

async function readSettingsSidebarScrollTop(page: Page): Promise<number> {
  return page.getByTestId("settings-sidebar").evaluate((node) => {
    for (const element of node.querySelectorAll<HTMLElement>("*")) {
      if (element.scrollHeight > element.clientHeight) {
        return element.scrollTop;
      }
    }
    return 0;
  });
}

test.describe("Settings sidebar scrolling", () => {
  test.use({ viewport: { width: 900, height: 260 } });

  test("desktop drag region does not cover the scroll body", async ({ page }) => {
    await page.addInitScript(() => {
      window.paseoDesktop = {
        platform: "darwin",
        events: { on: () => () => {} },
        invoke: async (command: string) => {
          if (command === "get_desktop_settings") {
            return {
              releaseChannel: "stable",
              daemon: { manageBuiltInDaemon: true, keepRunningAfterQuit: true },
            };
          }
          return null;
        },
      };
    });

    await gotoAppShell(page);
    await openSettings(page);

    const sidebar = page.getByTestId("settings-sidebar");
    await expect(sidebar).toBeVisible();

    const geometry = await sidebar.evaluate((node) => {
      let scroller: HTMLElement | null = null;
      for (const element of node.querySelectorAll<HTMLElement>("*")) {
        if (element.scrollHeight > element.clientHeight) {
          scroller = element;
          break;
        }
      }
      if (!scroller) return null;

      const scrollerRect = scroller.getBoundingClientRect();
      const dragRegions = [];
      for (const element of node.querySelectorAll<HTMLElement>("*")) {
        if (getComputedStyle(element).getPropertyValue("-webkit-app-region") === "drag") {
          const rect = element.getBoundingClientRect();
          dragRegions.push({ bottom: rect.bottom });
        }
      }

      return {
        scrollBodyTop: scrollerRect.top,
        dragRegions,
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry!.dragRegions).not.toEqual([]);
    for (const dragRegion of geometry!.dragRegions) {
      expect(dragRegion.bottom).toBeLessThanOrEqual(geometry!.scrollBodyTop + 1);
    }
  });

  test("keeps the sidebar scroll position when selecting a lower section", async ({ page }) => {
    await gotoAppShell(page);
    await openSettings(page);

    const sidebar = page.getByTestId("settings-sidebar");
    const before = await sidebar.evaluate((node) => {
      let scroller: HTMLElement | null = null;
      for (const element of node.querySelectorAll<HTMLElement>("*")) {
        if (element.scrollHeight > element.clientHeight) {
          scroller = element;
          break;
        }
      }
      if (!scroller) return 0;
      scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
      scroller.dispatchEvent(new Event("scroll"));
      return scroller.scrollTop;
    });
    expect(before).toBeGreaterThan(0);

    await page.getByTestId("settings-host-section-providers").click();
    await expectAppRoute(page, buildSettingsHostSectionRoute(getServerId(), "providers"));

    await expect.poll(() => readSettingsSidebarScrollTop(page)).toBeGreaterThanOrEqual(before - 1);
  });
});
