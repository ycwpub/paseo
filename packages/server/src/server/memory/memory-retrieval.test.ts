import { describe, expect, test } from "vitest";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { retrieveRelevantMemoryDetails } from "./memory-retrieval.js";

function detail(id: string, title: string, content: string, keywords: string[]): PaseoMemoryDetail {
  return {
    id,
    title,
    category: "other",
    keywords,
    path: `/tmp/${id}.md`,
    charCount: content.length,
    content,
    confidence: 1,
    sourceAgentIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastAccessedAt: null,
  };
}

describe("retrieveRelevantMemoryDetails", () => {
  test("ranks English and Chinese topic details by lexical relevance", () => {
    const details = [
      detail("build", "Build workflow", "Compile and restart Paseo before testing.", [
        "build",
        "restart",
      ]),
      detail("language", "回答偏好", "用户希望使用中文回答，并保持简洁。", ["中文", "简洁"]),
      detail("travel", "Travel", "The user likes window seats.", ["flight"]),
    ];

    expect(
      retrieveRelevantMemoryDetails("请用中文简洁回答", details, { limit: 2 }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["language"]);
    expect(
      retrieveRelevantMemoryDetails("build and restart the Paseo app", details, { limit: 2 }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["build"]);
  });
});
