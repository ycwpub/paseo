import { app } from "electron";

import {
  createExtendedDesktopSettingsStore,
  type ExtendedDesktopSettingsStore,
} from "./desktop-settings-extensions.js";

let extendedDesktopSettingsStore: ExtendedDesktopSettingsStore | null = null;

export function getExtendedDesktopSettingsStore(): ExtendedDesktopSettingsStore {
  extendedDesktopSettingsStore ??= createExtendedDesktopSettingsStore({
    userDataPath: app.getPath("userData"),
  });
  return extendedDesktopSettingsStore;
}
