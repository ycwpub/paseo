import { describe, expect, test } from "vitest";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import {
  retrieveRelevantMemoryDetails,
  retrieveRelevantMemoryMatches,
} from "./memory-retrieval.js";

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

  test("isolates scoped memories and excludes expired or disputed entries", () => {
    const details: PaseoMemoryDetail[] = [
      {
        ...detail("project-a", "Build command", "Run npm run build:a.", ["build"]),
        scope: { type: "project", id: "a" },
      },
      {
        ...detail("project-b", "Build command", "Run npm run build:b.", ["build"]),
        scope: { type: "project", id: "b" },
      },
      {
        ...detail("expired", "Build command", "Never use this.", ["build"]),
        status: "expired",
      },
      {
        ...detail("disputed", "Build command", "This is incorrect.", ["build"]),
        status: "disputed",
      },
    ];

    expect(
      retrieveRelevantMemoryDetails("build command", details, {
        limit: 10,
        scopes: [{ type: "global" }, { type: "project", id: "a" }],
      }).map((entry) => entry.id),
    ).toEqual(["project-a"]);
  });

  test("uses explicit origin and feedback to break otherwise similar rankings", () => {
    const automatic = detail("automatic", "Answer format", "Use concise bullets.", ["concise"]);
    const explicit: PaseoMemoryDetail = {
      ...detail("explicit", "Answer format", "Use concise numbered bullets.", ["concise"]),
      origin: "explicit",
      helpfulCount: 4,
      unhelpfulCount: 0,
    };

    const matches = retrieveRelevantMemoryMatches(
      "answer with concise bullets",
      [automatic, explicit],
      {
        limit: 2,
        now: new Date("2026-01-02T00:00:00.000Z").getTime(),
      },
    );

    expect(matches.map((match) => match.detail.id)).toEqual(["explicit", "automatic"]);
    expect(matches[0]?.reasons).toContain("explicit");
  });

  test("includes explicit global preferences as baseline context", () => {
    const preference: PaseoMemoryDetail = {
      ...detail("language", "Response language", "Always answer in Chinese.", ["Chinese"]),
      category: "preference",
      origin: "explicit",
      importance: 1,
      scope: { type: "global" },
    };

    expect(
      retrieveRelevantMemoryMatches("unrelated question", [preference], {
        limit: 3,
        includeBaseline: true,
      }),
    ).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({ id: "language" }),
        reasons: ["baseline"],
      }),
    ]);
  });
});
