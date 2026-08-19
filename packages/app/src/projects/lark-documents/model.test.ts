import { describe, expect, it } from "vitest";
import {
  normalizeProjectLarkDocumentLinks,
  projectLarkDocumentLinks,
  projectLarkDocumentLinksError,
  validateProjectLarkDocumentLink,
} from "./model";

describe("project Lark documents", () => {
  it("normalizes whitespace and duplicates", () => {
    expect(
      normalizeProjectLarkDocumentLinks([
        " https://example.feishu.cn/docx/abc ",
        "",
        "https://example.feishu.cn/docx/abc",
        "https://example.larksuite.com/wiki/def",
      ]),
    ).toEqual(["https://example.feishu.cn/docx/abc", "https://example.larksuite.com/wiki/def"]);
  });

  it("reads document links from project configuration", () => {
    expect(
      projectLarkDocumentLinks({
        project: {
          larkDocumentLinks: [
            "https://example.feishu.cn/wiki/abc",
            " https://example.feishu.cn/docx/def ",
          ],
        },
      }),
    ).toEqual(["https://example.feishu.cn/wiki/abc", "https://example.feishu.cn/docx/def"]);
  });

  it("accepts Feishu and Lark HTTPS links only", () => {
    expect(validateProjectLarkDocumentLink("https://example.feishu.cn/docx/abc")).toBe(true);
    expect(validateProjectLarkDocumentLink("https://example.larksuite.com/wiki/abc")).toBe(true);
    expect(validateProjectLarkDocumentLink("http://example.feishu.cn/docx/abc")).toBe(false);
    expect(validateProjectLarkDocumentLink("https://example.com/docx/abc")).toBe(false);
  });

  it("reports the invalid row", () => {
    expect(
      projectLarkDocumentLinksError(["https://example.feishu.cn/docx/abc", "not-a-link"]),
    ).toBe("第 2 个链接不是有效的飞书或 Lark HTTPS 地址。");
  });
});
