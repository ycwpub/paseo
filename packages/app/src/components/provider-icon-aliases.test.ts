import { describe, expect, test } from "vitest";

import { resolveProviderIconName } from "./provider-icon-name";

describe("provider icon aliases", () => {
  test("reuses the existing TRAE icon for the built-in TraeX provider", () => {
    expect(resolveProviderIconName("traex")).toEqual({
      kind: "catalog",
      id: "traecli",
    });
  });

  test("preserves Aiden provider aliases", () => {
    expect(resolveProviderIconName("aiden-claude")).toEqual({
      kind: "builtin",
      id: "claude",
    });
  });
});
