import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readBambooInvestigationResult,
  writeBambooAgentJsonAtomic,
} from "./bamboo-agent-artifact-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("Bamboo agent artifact store", () => {
  it("accepts only an atomically committed final result", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-bamboo-artifact-"));
    temporaryDirectories.push(directory);
    const resultFile = path.join(directory, "result.json");
    const result = {
      version: 1,
      result_id: "19562663",
      status: "succeeded",
      summary: "排查完成",
      writeback_owner: "parent_orchestrator",
    };

    await writeFile(`${resultFile}.tmp`, JSON.stringify(result), "utf8");
    await expect(readBambooInvestigationResult(resultFile)).rejects.toThrow(
      "Agent 尚未完成原子提交",
    );

    await writeBambooAgentJsonAtomic(resultFile, result);
    await expect(readBambooInvestigationResult(resultFile)).resolves.toEqual(result);
  });
});
