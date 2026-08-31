import { expect, type Page } from "@playwright/test";
import type { OutdatedDaemon } from "./daemon-update";
import { gotoAppShell, openSettings } from "./app";
import type { IsolatedHostDaemon } from "./isolated-host-daemon";
import { expectRelayConsent } from "./pair-device";
import { openSettingsHost, openSettingsHostSection, seedSavedSettingsHosts } from "./settings";

interface PairingHostInput {
  serverId: string;
  label: string;
  endpoint: string;
}

export { expectRelayConsent };

export async function preparePairingHost(
  page: Page,
  daemon: IsolatedHostDaemon | OutdatedDaemon,
  additionalHosts: PairingHostInput[] = [],
): Promise<void> {
  await seedSavedSettingsHosts(page, [
    {
      serverId: daemon.serverId,
      label: "Local pairing host",
      endpoint: "port" in daemon ? `127.0.0.1:${daemon.port}` : daemon.endpoint,
    },
    ...additionalHosts,
  ]);
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsHost(page, daemon.serverId);
  await expect(page.getByTestId("host-page-pair-device-row")).toHaveCount(0);
  await openSettingsHostSection(page, daemon.serverId, "pair-device");
  await expect(page.getByTestId("host-page-pair-device-card")).toBeVisible();
}

export async function openPairDeviceModal(page: Page): Promise<void> {
  if ((await page.getByTestId("host-page-pair-device-card").count()) === 0) {
    await page.getByTestId("settings-host-section-pair-device").click();
  }
  await expect(page.getByTestId("host-page-pair-device-card")).toBeVisible();
}
