import { describe, expect, it } from "vitest";
import { resolveSupportedLocale } from "./locales";
describe("resolveSupportedLocale", () => {
    it("falls back to Simplified Chinese for unsupported Portuguese locales", () => {
        expect(resolveSupportedLocale("system", ["pt-PT"])).toBe("zh-CN");
        expect(resolveSupportedLocale("system", ["pt-AO"])).toBe("zh-CN");
    });
    it("falls back to Simplified Chinese for unsupported Traditional Chinese locales", () => {
        expect(resolveSupportedLocale("system", ["zh-TW"])).toBe("zh-CN");
        expect(resolveSupportedLocale("system", ["zh-Hant"])).toBe("zh-CN");
        expect(resolveSupportedLocale("system", ["zh-HK"])).toBe("zh-CN");
    });
    it("maps unsupported or missing system locales to Simplified Chinese", () => {
        expect(resolveSupportedLocale("system", ["de-DE"])).toBe("zh-CN");
        expect(resolveSupportedLocale("system", [])).toBe("zh-CN");
    });
});
