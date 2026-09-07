import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { buildDraftPanelDescriptor } from "@/panels/draft-panel-descriptor";
function TestIcon() {
  return null;
}
describe("buildDraftPanelDescriptor", () => {
  it("uses the active language for draft descriptor chrome", async () => {
    await i18n.changeLanguage("zh-CN");
    const idleDescriptor = buildDraftPanelDescriptor({
      isCreating: false,
      icon: TestIcon,
    });
    const creatingDescriptor = buildDraftPanelDescriptor({
      isCreating: true,
      pendingPrompt: "   ",
      icon: TestIcon,
    });
    expect(idleDescriptor).toMatchObject({
      label: "新建智能体",
      subtitle: "新建智能体",
    });
    expect(creatingDescriptor).toMatchObject({
      label: "新建智能体",
      subtitle: "正在创建智能体",
    });
    await i18n.changeLanguage("en");
  });
});
