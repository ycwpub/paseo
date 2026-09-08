import { describe, expect, it } from "vitest";
import { parseBambooTroubleshooterCompletion } from "./bamboo-troubleshooter-completion.js";

describe("Bamboo troubleshooter completion", () => {
  it("accepts a validated succeeded result", () => {
    expect(
      parseBambooTroubleshooterCompletion(
        '```json\n{"status":"succeeded","summary":"排查完成","feishu_doc_url":"https://example.com/wiki/doc"}\n```',
      ),
    ).toMatchObject({ status: "succeeded", summary: "排查完成" });
  });

  it("rejects an agent exit without a structured result", () => {
    expect(() => parseBambooTroubleshooterCompletion("任务已完成")).toThrow("最终结果不符合契约");
  });
});
