import { describe, expect, it } from "vitest";
import type { ProviderUsage } from "./types";
import { presentProviderUsage } from "./presentation";

function aidenUsage(overrides: Partial<ProviderUsage>): ProviderUsage {
  return {
    providerId: "aiden-codex",
    displayName: "Aiden Codex",
    status: "unavailable",
    planLabel: null,
    sourceLabel: "Aiden X",
    windows: [],
    balances: [],
    details: [],
    error: null,
    ...overrides,
  };
}

describe("provider usage presentation", () => {
  it("hides the legacy empty-model warning because it only means quota data is unavailable", () => {
    expect(
      presentProviderUsage(
        aidenUsage({
          details: [
            {
              id: "aiden-empty-models",
              label: "状态",
              value: "Aiden 当前未返回可用模型，暂无用量数据，请稍后重试。",
              tone: "warning",
            },
          ],
        }),
      ),
    ).toEqual({
      error: null,
      details: [],
    });
  });

  it("hides an old daemon empty-model error without hiding real Aiden errors", () => {
    expect(
      presentProviderUsage(
        aidenUsage({
          status: "error",
          error: "Aiden aiproxy models API returned an empty model list for codex.",
        }),
      ).error,
    ).toBeNull();

    expect(
      presentProviderUsage(
        aidenUsage({
          status: "error",
          error: "Aiden 登录状态不可用，请重新登录。",
        }),
      ).error,
    ).toBe("Aiden 登录状态不可用，请重新登录。");
  });
});
