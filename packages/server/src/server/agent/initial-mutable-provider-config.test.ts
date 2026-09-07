import { describe, expect, test } from "vitest";

import { resolveInitialMutableProviderConfig } from "./initial-mutable-provider-config.js";

describe("resolveInitialMutableProviderConfig", () => {
  test("preserves the complete custom provider definition", () => {
    const providers = resolveInitialMutableProviderConfig({
      traecli: {
        extends: "acp",
        label: "TRAE CLI",
        description: "Custom ACP provider",
        command: ["traecli", "acp", "serve"],
        env: { TRAE_ENV: "test" },
        params: { supportsMcpServers: false },
        models: [{ id: "configured", label: "Configured" }],
        additionalModels: [{ id: "extra", label: "Extra" }],
        disallowedTools: ["WebSearch"],
        enabled: true,
        order: 7,
      },
    });

    expect(providers.traecli).toEqual({
      extends: "acp",
      label: "TRAE CLI",
      description: "Custom ACP provider",
      command: ["traecli", "acp", "serve"],
      env: { TRAE_ENV: "test" },
      params: { supportsMcpServers: false },
      models: [{ id: "configured", label: "Configured" }],
      additionalModels: [{ id: "extra", label: "Extra" }],
      disallowedTools: ["WebSearch"],
      enabled: true,
      order: 7,
    });
  });

  test("returns an empty provider map when no overrides are configured", () => {
    expect(resolveInitialMutableProviderConfig(undefined)).toEqual({});
  });
});
