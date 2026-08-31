import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESKTOP_SETTINGS_EXTENSIONS,
  parseDesktopSettingsExtensions,
} from "./desktop-settings-extensions";

describe("parseDesktopSettingsExtensions", () => {
  it("parses notification, attention, and island preferences", () => {
    expect(
      parseDesktopSettingsExtensions({
        notifications: { enabled: false },
        attention: { soundVolume: 0.75 },
        island: { enabled: false, showWhenFocused: false },
      }),
    ).toEqual({
      notifications: { enabled: false },
      attention: { soundVolume: 0.75 },
      island: { enabled: false, showWhenFocused: false },
    });
  });

  it("uses safe defaults and clamps the sound volume", () => {
    expect(parseDesktopSettingsExtensions({ attention: { soundVolume: 2 } })).toEqual({
      ...DEFAULT_DESKTOP_SETTINGS_EXTENSIONS,
      attention: { soundVolume: 1 },
    });
  });
});
