import { describe, expect, it } from "vitest";
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { i18n } from "@/i18n/i18next";
import {
  buildSelectableProviderSelectorProviders,
  resolveSubmissionReadiness,
} from "./provider-selection";
describe("combined model selector data", () => {
  const codexModel: AgentModelDefinition = {
    provider: "codex",
    id: "gpt-5.4",
    label: "GPT-5.4",
  };
  function snapshotEntry(
    overrides: Partial<ProviderSnapshotEntry> & Pick<ProviderSnapshotEntry, "provider">,
  ): ProviderSnapshotEntry {
    return {
      ...overrides,
      provider: overrides.provider,
      status: overrides.status ?? "ready",
      enabled: overrides.enabled ?? true,
      label: overrides.label ?? overrides.provider,
      description: overrides.description ?? `${overrides.provider} provider`,
      defaultModeId: overrides.defaultModeId ?? "default",
      modes: overrides.modes ?? [],
      models: overrides.models ?? [codexModel],
    };
  }
  it("uses the active app language for utility labels", async () => {
    await i18n.changeLanguage("zh-CN");
    try {
      const providers = buildSelectableProviderSelectorProviders([
        snapshotEntry({
          provider: "deepseek-tui",
          label: "DeepSeek TUI",
          models: [],
        }),
        snapshotEntry({
          provider: "unavailable-provider",
          status: "unavailable",
          models: [],
        }),
      ]);
      expect(getAllModelLabels(providers)).toContain("默认");
      expect(providers[1]?.modelSelection).toEqual({
        kind: "error",
        message: "不可用",
      });
      expect(
        resolveSubmissionReadiness({
          text: "",
          allowsEmptyAutoSubmit: false,
          providerCount: 1,
          selection: {
            provider: "codex",
            modelId: "gpt-5.4",
            availableModels: [codexModel],
            isModelLoading: false,
          },
          autoSubmitConfig: null,
          workspaceDirectory: "/repo",
          hasClient: true,
        }),
      ).toEqual({ ok: false, reason: "初始提示词必填" });
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
function getAllModelLabels(providers: ReturnType<typeof buildSelectableProviderSelectorProviders>) {
  return providers.flatMap((provider) =>
    provider.modelSelection.kind === "models"
      ? provider.modelSelection.rows.map((row) => row.modelLabel)
      : [],
  );
}
