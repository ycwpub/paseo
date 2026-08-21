import { describe, expect, it } from "vitest";
import {
  DESKTOP_PLUGIN_MAIN_CONTENT_MIN_WIDTH,
  resolveDesktopPluginPanelWidth,
} from "./desktop-panel-layout";

describe("resolveDesktopPluginPanelWidth", () => {
  it("keeps the current page visible beside a development plugin", () => {
    expect(
      resolveDesktopPluginPanelWidth({
        availableWidth: 1160,
        isDevelopmentPanel: true,
      }),
    ).toBe(719);
  });

  it("shrinks the plugin panel before taking over the current page", () => {
    const availableWidth = 820;
    const panelWidth = resolveDesktopPluginPanelWidth({
      availableWidth,
      isDevelopmentPanel: true,
    });

    expect(panelWidth).toBe(460);
    expect(availableWidth - panelWidth).toBe(DESKTOP_PLUGIN_MAIN_CONTENT_MIN_WIDTH);
  });

  it("uses a narrower panel for regular plugin applications", () => {
    expect(
      resolveDesktopPluginPanelWidth({
        availableWidth: 1200,
        isDevelopmentPanel: false,
      }),
    ).toBe(552);
  });
});
