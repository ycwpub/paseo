import { describe, expect, it } from "vitest";
import { createInMemoryKeyValueStorage } from "./fakes";
import {
  applyProductAppSettingsDefaults,
  createProductAppSettingsStorage,
} from "./product-defaults";
import { APP_SETTINGS_KEY, DEFAULT_CLIENT_SETTINGS } from "./storage";

describe("product app settings defaults", () => {
  it("uses Simplified Chinese without changing the upstream settings defaults", () => {
    expect(DEFAULT_CLIENT_SETTINGS.language).toBe("system");
    expect(applyProductAppSettingsDefaults(DEFAULT_CLIENT_SETTINGS).language).toBe("zh-CN");
  });

  it("injects the product default only when no valid language preference exists", async () => {
    const storage = createInMemoryKeyValueStorage();
    const productStorage = createProductAppSettingsStorage(storage, APP_SETTINGS_KEY);

    expect(JSON.parse((await productStorage.getItem(APP_SETTINGS_KEY)) ?? "{}")).toMatchObject({
      language: "zh-CN",
    });

    await storage.setItem(APP_SETTINGS_KEY, JSON.stringify({ language: "system" }));
    expect(JSON.parse((await productStorage.getItem(APP_SETTINGS_KEY)) ?? "{}")).toMatchObject({
      language: "system",
    });

    await storage.setItem(APP_SETTINGS_KEY, JSON.stringify({ language: "unknown" }));
    expect(JSON.parse((await productStorage.getItem(APP_SETTINGS_KEY)) ?? "{}")).toMatchObject({
      language: "zh-CN",
    });
  });
});
