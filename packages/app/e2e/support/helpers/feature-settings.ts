import type { Page } from "@playwright/test";
import { buildSettingsHostSectionRoute } from "@/utils/host-feature-routes";
import { expectAppRoute } from "./route-assertions";

export type FeatureHostSection = "assistants" | "channels" | "knowledge";

export async function openFeatureSettingsHostSection(
  page: Page,
  serverId: string,
  section: FeatureHostSection,
): Promise<void> {
  await page.getByTestId(`settings-host-section-${section}`).click();
  await expectAppRoute(page, buildSettingsHostSectionRoute(serverId, section));
}
