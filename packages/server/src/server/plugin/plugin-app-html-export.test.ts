import { describe, expect, it } from "vitest";
import { renderPluginAppHtml } from "./plugin-app-html-export";

describe("renderPluginAppHtml", () => {
  it("renders a standalone escaped HTML preview", () => {
    const html = renderPluginAppHtml({
      version: 1,
      title: "计算器 <测试>",
      description: "输入数字并计算。",
      components: [
        {
          id: "left",
          type: "number_input",
          label: "第一个数字",
          defaultValue: 1,
        },
        {
          id: "submit",
          type: "button",
          label: "计算",
          action: { type: "http_service", serviceName: "processor" },
        },
        { id: "result", type: "result", label: "计算结果" },
      ],
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>计算器 &lt;测试&gt;</title>");
    expect(html).toContain('input type="number"');
    expect(html).toContain("计算结果");
    expect(html).not.toContain("<script");
  });
});
