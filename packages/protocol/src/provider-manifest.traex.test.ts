import { describe, expect, test } from "vitest";

import {
  AGENT_PROVIDER_DEFINITIONS,
  BUILTIN_PROVIDER_IDS,
  getAgentProviderDefinition,
} from "./provider-manifest.js";
import { ProviderOverridesSchema } from "./provider-config.js";

describe("TraeX provider manifest", () => {
  test("exposes TraeX as a disabled built-in provider", () => {
    expect(BUILTIN_PROVIDER_IDS).toContain("traex");
    expect(getAgentProviderDefinition("traex", AGENT_PROVIDER_DEFINITIONS)).toMatchObject({
      id: "traex",
      label: "TraeX",
      enabledByDefault: false,
      defaultModeId: "default",
      modes: [
        expect.objectContaining({ id: "default" }),
        expect.objectContaining({ id: "auto" }),
        expect.objectContaining({ id: "plan" }),
        expect.objectContaining({ id: "bypass_permissions", isUnattended: true }),
      ],
    });
  });

  test("accepts TraeX settings without requiring a custom-provider base", () => {
    expect(
      ProviderOverridesSchema.parse({
        traex: {
          enabled: true,
          command: ["/opt/traex", "acp", "serve"],
        },
      }),
    ).toEqual({
      traex: {
        enabled: true,
        command: ["/opt/traex", "acp", "serve"],
      },
    });
  });
});
