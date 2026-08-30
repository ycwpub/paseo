import { describe, expect, test } from "vitest";
import { deriveModesFromACP } from "./acp-agent.js";
describe("deriveModesFromACP", () => {
    test("enriches advertised ACP modes with fallback permission metadata", () => {
        const result = deriveModesFromACP([
            {
                id: "bypass_permissions",
                label: "Bypass Permissions",
                description: "Run tools without approval prompts.",
                icon: "ShieldOff",
                colorTier: "dangerous",
                isUnattended: true,
            },
        ], {
            availableModes: [
                {
                    id: "bypass_permissions",
                    name: "Accept All Tools",
                    description: "",
                },
            ],
            currentModeId: "bypass_permissions",
        }, []);
        expect(result).toEqual({
            modes: [
                {
                    id: "bypass_permissions",
                    label: "Accept All Tools",
                    description: "Run tools without approval prompts.",
                    icon: "ShieldOff",
                    colorTier: "dangerous",
                    isUnattended: true,
                },
            ],
            currentModeId: "bypass_permissions",
        });
    });
});
