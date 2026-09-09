import { describe, expect, test } from "vitest";
import { PersistedConfigSchema } from "./persisted-config.js";
describe("PersistedConfigSchema Host knowledge config", () => {
  test("accepts general and mandatory standard knowledge", () => {
    const parsed = PersistedConfigSchema.parse({
      daemon: {
        knowledge: {
          general: [
            { type: "local-directory", source: "shared" },
            { type: "cloud-document", source: "https://example.com/background" },
          ],
          standards: [
            { type: "local-document", source: "standards/review.md" },
            { type: "cloud-document", source: "https://example.com/standards" },
          ],
        },
      },
    });
    expect(parsed.daemon?.knowledge).toEqual({
      general: [
        { type: "local-directory", source: "shared" },
        { type: "cloud-document", source: "https://example.com/background" },
      ],
      standards: [
        { type: "local-document", source: "standards/review.md" },
        { type: "cloud-document", source: "https://example.com/standards" },
      ],
    });
  });
});

describe("PersistedConfigSchema removed providers", () => {
  test("drops the removed TraeX built-in while preserving TRAE CLI", () => {
    const parsed = PersistedConfigSchema.parse({
      agents: {
        providers: {
          traex: { enabled: true },
          traecli: {
            extends: "acp",
            label: "TRAE CLI",
            command: ["traecli", "acp", "serve"],
          },
        },
      },
    });

    expect(parsed.agents?.providers).toEqual({
      traecli: {
        extends: "acp",
        label: "TRAE CLI",
        command: ["traecli", "acp", "serve"],
      },
    });
  });
});
