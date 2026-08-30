import type { ViewStyle } from "react-native";
import { describe, expect, it } from "vitest";
import { buildDesktopFrameStyle } from "./combobox-frame-style";
describe("buildDesktopFrameStyle", () => {
    it("clamps a fixed-height popover to the visible viewport height", () => {
        const [, heightStyle] = buildDesktopFrameStyle({
            desktopMinWidth: 420,
            desktopLockWidth: true,
            referenceWidth: 420,
            desktopFixedHeight: 400,
            desktopPositionStyle: { left: 0, top: 500 },
            shouldHideDesktopContent: false,
            availableHeight: 220,
        }) as ViewStyle[];
        expect(heightStyle).toEqual({ minHeight: 220, maxHeight: 220 });
    });
    it("preserves the requested fixed height when the viewport has enough room", () => {
        const [, heightStyle] = buildDesktopFrameStyle({
            desktopMinWidth: 420,
            desktopLockWidth: true,
            referenceWidth: 420,
            desktopFixedHeight: 320,
            desktopPositionStyle: { left: 0, top: 100 },
            shouldHideDesktopContent: false,
            availableHeight: 500,
        }) as ViewStyle[];
        expect(heightStyle).toEqual({ minHeight: 320, maxHeight: 320 });
    });
});
