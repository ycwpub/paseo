import { describe, expect, it } from "vitest";
import {
  developmentPrdSourceFromInput,
  parseDevelopmentMeegoItems,
  parseResolvedDevelopmentPrd,
  serializeDevelopmentPrdSource,
} from "./development-prd-source-model";

describe("development PRD source model", () => {
  it("restores and serializes a Meego-backed PRD", () => {
    const source = developmentPrdSourceFromInput({
      prd: "需求正文",
      meego_url: "https://meego.example.com/demo/story/detail/123",
      meego_project_key: "demo",
      meego_work_item_id: "123",
      meego_title: "登录优化",
    });

    expect(source.type).toBe("meego");
    expect(serializeDevelopmentPrdSource(source)).toEqual({
      prd_source: "meego",
      prd: "需求正文",
      meego_url: "https://meego.example.com/demo/story/detail/123",
      meego_project_key: "demo",
      meego_work_item_id: "123",
      meego_title: "登录优化",
    });
  });

  it("normalizes Meego list and resolve workflow results", () => {
    expect(
      parseDevelopmentMeegoItems({
        data: {
          items: [
            {
              id: "demo:123",
              title: "登录优化",
              url: "https://meego.example.com/demo/story/detail/123",
              projectKey: "demo",
              workItemId: "123",
              status: "处理中",
              workItemType: "story",
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "demo:123",
        title: "登录优化",
        url: "https://meego.example.com/demo/story/detail/123",
        projectKey: "demo",
        workItemId: "123",
        status: "处理中",
        workItemType: "story",
      },
    ]);
    expect(
      parseResolvedDevelopmentPrd({
        data: {
          prd: "# 登录优化\n\n需求正文",
          title: "登录优化",
          url: "https://meego.example.com/demo/story/detail/123",
          projectKey: "demo",
          workItemId: "123",
        },
      }),
    ).toEqual({
      prd: "# 登录优化\n\n需求正文",
      meegoTitle: "登录优化",
      meegoUrl: "https://meego.example.com/demo/story/detail/123",
      meegoProjectKey: "demo",
      meegoWorkItemId: "123",
    });
  });
});
