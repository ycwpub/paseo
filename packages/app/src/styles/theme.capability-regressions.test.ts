import { describe, expect, it } from "vitest";
import { FONT_SIZE } from "./theme";
describe("Typography scale", () => {
    it("names 14px as the default interface tier", () => {
        expect(FONT_SIZE).toEqual({
            code: 12,
            content: 15,
            sm: 12,
            base: 14,
            lg: 16,
            xl: 18,
            "2xl": 20,
            "3xl": 22,
            "4xl": 26,
        });
    });
});
