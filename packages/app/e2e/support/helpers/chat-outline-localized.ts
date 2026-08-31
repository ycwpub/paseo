import { expect, type Page } from "@playwright/test";
import { openSettings } from "./app";
import {
  chatOutlineRail,
  clickChatOutlineRowEdge,
  expectChatOutlinePrompts,
  expectChatOutlinePromptToRemainBare,
  expectNoChatOutline,
  expectNoChatOutlinePreview,
  expectNoChatOutlinePreviewWhileCrossingToSidebar,
  expectOneActiveChatOutlinePrompt,
  focusChatOutlinePrompt,
  hoverChatOutlinePrompt,
  movePointerOffChatOutline,
  pointAtChatOutlineRowEdge,
  pressEnterOnFocusedPrompt,
  splitCurrentPanelRight,
} from "./chat-outline";
import { openSettingsSection } from "./settings";

export {
  chatOutlineRail,
  clickChatOutlineRowEdge,
  expectChatOutlinePrompts,
  expectChatOutlinePromptToRemainBare,
  expectNoChatOutline,
  expectNoChatOutlinePreview,
  expectNoChatOutlinePreviewWhileCrossingToSidebar,
  expectOneActiveChatOutlinePrompt,
  focusChatOutlinePrompt,
  hoverChatOutlinePrompt,
  movePointerOffChatOutline,
  pointAtChatOutlineRowEdge,
  pressEnterOnFocusedPrompt,
  splitCurrentPanelRight,
};

export async function disableChatOutlineFromAppearance(page: Page): Promise<void> {
  const timelineUrl = page.url();
  await openSettings(page);
  await openSettingsSection(page, "appearance");
  await page.getByRole("switch", { name: "Prompt history navigation" }).click();
  await page.goto(timelineUrl);
}

export async function expectChatOutlinePreview(page: Page, preview: string): Promise<void> {
  await expect(page.getByTestId("chat-outline-preview")).toContainText(preview);
}

export async function expectActiveChatOutlinePrompt(page: Page, position: number): Promise<void> {
  await expect(chatOutlineRail(page).getByRole("tab", { selected: true })).toHaveAccessibleName(
    new RegExp(`^${position}/`),
  );
}

export async function expectActiveChatOutlinePromptMovedFrom(
  page: Page,
  position: number,
): Promise<void> {
  const activePrompt = chatOutlineRail(page).getByRole("tab", { selected: true });
  await expect(activePrompt).toHaveCount(1);
  await expect(activePrompt).not.toHaveAccessibleName(new RegExp(`^${position}/`));
}

export async function expectLiveTurnPromptAboveFoldAndActive(
  page: Page,
  prompt: string,
  position: number,
): Promise<void> {
  const timeline = page.locator('[data-testid="agent-chat-scroll"]:visible').first();
  const promptRow = timeline.getByTestId("user-message").filter({ hasText: prompt });
  const activeTick = chatOutlineRail(page).getByRole("tab", { selected: true });
  await expect
    .poll(
      async () => {
        const [timelineBox, promptBox, activeLabel] = await Promise.all([
          timeline.boundingBox(),
          promptRow.boundingBox(),
          activeTick.getAttribute("aria-label"),
        ]);
        return Boolean(
          timelineBox &&
          promptBox &&
          promptBox.y + promptBox.height < timelineBox.y &&
          activeLabel?.startsWith(`${position}/`),
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}
