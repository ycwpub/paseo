import { describe, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { buildProviderRegistry } from "./provider-registry.js";

describe("TraeX provider registration", () => {
  test("registers TraeX as an optional built-in ACP provider", () => {
    const logger = createTestLogger();
    const registry = buildProviderRegistry(logger);

    expect(registry.traex).toMatchObject({
      id: "traex",
      label: "TraeX",
      enabled: false,
      derivedFromProviderId: null,
      defaultModeId: "default",
    });
    expect(registry.traex.modes).toEqual([
      expect.objectContaining({ id: "default" }),
      expect.objectContaining({ id: "auto" }),
      expect.objectContaining({ id: "plan" }),
      expect.objectContaining({ id: "bypass_permissions", isUnattended: true }),
    ]);
    expect(registry.traex.createClient(logger).provider).toBe("traex");
  });

  test("can be enabled through the normal built-in provider override", () => {
    const registry = buildProviderRegistry(createTestLogger(), {
      providerOverrides: {
        traex: {
          enabled: true,
        },
      },
    });

    expect(registry.traex.enabled).toBe(true);
  });
});
