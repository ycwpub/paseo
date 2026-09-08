import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertTroubleshooterConfigSchema } from "@getpaseo/protocol/messages";
import {
  publishBambooTroubleshooterDocument,
  type BambooTroubleshooterPublisherDependencies,
} from "./bamboo-troubleshooter-document-publisher.js";

const temporaryDirectories: string[] = [];

async function workspace(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "paseo-bamboo-publisher-"));
  temporaryDirectories.push(cwd);
  return cwd;
}

function config() {
  return AlertTroubleshooterConfigSchema.parse({
    botId: "bot-1",
    chats: [{ chatId: "oc-1", name: "结算报警群" }],
    target: { kind: "default" },
    troubleshootingSopDoc: "https://example.com/wiki/sop",
    attributionRecordRoot: "https://example.com/wiki/root",
    recordTableUrl: "https://example.com/base/alerts?table=tbl_alerts",
    schedule: {
      enabled: false,
      intervalMinutes: 30,
      lookbackMinutes: 120,
      excludeRecentMinutes: 30,
    },
  });
}

function record() {
  return {
    recordId: "rec-1",
    uniqueId: "19562663",
    resultId: "19562663",
    taskName: "结算账户关系校验",
    taskTime: "2026-09-08T10:00:00.000Z",
    tableDate: "20260908",
    messageId: "om-1",
    chatId: "oc-1",
    chatName: "结算报警群",
    messageText: "Bamboo 对账报警",
    messageTime: "2026-09-08T10:00:00.000Z",
    trigger: "manual" as const,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("publishBambooTroubleshooterDocument", () => {
  it("prefers the fresh agent Markdown over stale files from earlier attempts", async () => {
    const cwd = await workspace();
    const staleMarkdownFile = path.join(
      cwd,
      ".tmp",
      "bamboo-single-19562663",
      "19562663-troubleshooting.md",
    );
    const freshMarkdownFile = path.join(
      cwd,
      ".tmp",
      "bamboo-single-19562663",
      "fresh",
      "19562663-troubleshooting.md",
    );
    await mkdir(path.dirname(freshMarkdownFile), { recursive: true });
    await writeFile(staleMarkdownFile, "# 旧排查结果", "utf8");
    await writeFile(freshMarkdownFile, "# 最新排查结果", "utf8");
    const run = vi.fn<BambooTroubleshooterPublisherDependencies["run"]>(
      async (_executable, args) => {
        const outputFile = args[args.indexOf("--output-file") + 1];
        if (!outputFile) throw new Error("missing output file");
        await writeFile(
          outputFile,
          JSON.stringify({
            success: true,
            feishu_doc_url: "https://bytedance.larkoffice.com/wiki/wiki_result",
            doc_archive_status: "succeeded",
            parent_wiki_token: "daily_node",
            target_space_id: "space_1",
          }),
          "utf8",
        );
        return { stdout: "{}", stderr: "" };
      },
    );

    const result = await publishBambooTroubleshooterDocument(
      {
        config: config(),
        record: record(),
        workspaceCwd: cwd,
        wikiTarget: {
          spaceId: "space_1",
          parentNodeToken: "daily_node",
        },
      },
      {
        resolveRunnerPath: async () => "/runner.mjs",
        run,
      },
    );

    expect(result.markdownFile).toBe(freshMarkdownFile);
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(["--markdown-file", freshMarkdownFile]),
      expect.objectContaining({ cwd }),
    );
  });

  it("publishes the local Markdown under the current daily Base Wiki node", async () => {
    const cwd = await workspace();
    const markdownFile = path.join(cwd, ".tmp", "19562663-troubleshooting.md");
    await mkdir(path.dirname(markdownFile), { recursive: true });
    await writeFile(markdownFile, "# 排查结果\n\n证据完整。", "utf8");
    const run = vi.fn<BambooTroubleshooterPublisherDependencies["run"]>(
      async (_executable, args) => {
        const outputIndex = args.indexOf("--output-file");
        const outputFile = args[outputIndex + 1];
        if (!outputFile) throw new Error("missing output file");
        await writeFile(
          outputFile,
          JSON.stringify({
            success: true,
            feishu_doc_url: "https://bytedance.larkoffice.com/wiki/wiki_result",
            doc_archive_status: "succeeded",
            parent_wiki_token: "daily_node",
            target_space_id: "space_1",
          }),
          "utf8",
        );
        return { stdout: "{}", stderr: "" };
      },
    );

    const result = await publishBambooTroubleshooterDocument(
      {
        config: config(),
        record: record(),
        workspaceCwd: cwd,
        wikiTarget: {
          spaceId: "space_1",
          parentNodeToken: "daily_node",
        },
      },
      {
        resolveRunnerPath: async () => "/package/skills/bamboo/scripts/bamboo-alert-runner.mjs",
        run,
      },
    );

    expect(result.documentUrl).toBe("https://bytedance.larkoffice.com/wiki/wiki_result");
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([
        "publish-troubleshooting-doc",
        "--parent-wiki-token",
        "daily_node",
        "--target-space-id",
        "space_1",
      ]),
      expect.objectContaining({ cwd }),
    );
    expect(JSON.parse(await readFile(result.auditFile, "utf8"))).toMatchObject({
      success: true,
      parent_wiki_token: "daily_node",
    });
  });

  it("publishes the explicitly reviewed Markdown instead of searching legacy locations", async () => {
    const cwd = await workspace();
    const markdownFile = path.join(cwd, ".tmp", "reviewed-run", "report.md");
    await mkdir(path.dirname(markdownFile), { recursive: true });
    await writeFile(markdownFile, "# 已审核排查结果\n\n证据完整。", "utf8");
    const run = vi.fn<BambooTroubleshooterPublisherDependencies["run"]>(
      async (_executable, args) => {
        const outputFile = args[args.indexOf("--output-file") + 1];
        if (!outputFile) throw new Error("missing output file");
        await writeFile(
          outputFile,
          JSON.stringify({
            success: true,
            feishu_doc_url: "https://bytedance.larkoffice.com/wiki/wiki_reviewed",
            doc_archive_status: "succeeded",
            parent_wiki_token: "daily_node",
            target_space_id: "space_1",
          }),
          "utf8",
        );
        return { stdout: "{}", stderr: "" };
      },
    );

    const result = await publishBambooTroubleshooterDocument(
      {
        config: config(),
        record: record(),
        workspaceCwd: cwd,
        wikiTarget: {
          spaceId: "space_1",
          parentNodeToken: "daily_node",
        },
        markdownFile,
      },
      {
        resolveRunnerPath: async () => "/runner.mjs",
        run,
      },
    );

    expect(result.markdownFile).toBe(markdownFile);
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(["--markdown-file", markdownFile]),
      expect.objectContaining({ cwd }),
    );
  });

  it("rejects a runner result that did not produce a Wiki link", async () => {
    const cwd = await workspace();
    const markdownFile = path.join(cwd, ".tmp", "19562663.md");
    await mkdir(path.dirname(markdownFile), { recursive: true });
    await writeFile(markdownFile, "# 排查结果\n\n证据完整。", "utf8");

    await expect(
      publishBambooTroubleshooterDocument(
        {
          config: config(),
          record: record(),
          workspaceCwd: cwd,
          wikiTarget: {
            spaceId: "space_1",
            parentNodeToken: "daily_node",
          },
        },
        {
          resolveRunnerPath: async () => "/runner.mjs",
          run: async (_executable, args) => {
            const outputFile = args[args.indexOf("--output-file") + 1];
            if (!outputFile) throw new Error("missing output file");
            await writeFile(
              outputFile,
              JSON.stringify({
                success: true,
                feishu_doc_url: "https://bytedance.larkoffice.com/docx/doc_result",
                doc_archive_status: "succeeded",
                parent_wiki_token: "daily_node",
                target_space_id: "space_1",
              }),
              "utf8",
            );
            return { stdout: "{}", stderr: "" };
          },
        },
      ),
    ).rejects.toThrow("未返回 Wiki 链接");
  });

  it("fails clearly when the agent did not write a Markdown result", async () => {
    const cwd = await workspace();
    await expect(
      publishBambooTroubleshooterDocument(
        {
          config: config(),
          record: record(),
          workspaceCwd: cwd,
          wikiTarget: {
            spaceId: "space_1",
            parentNodeToken: "daily_node",
          },
        },
        {
          resolveRunnerPath: async () => "/runner.mjs",
          run: async () => ({ stdout: "{}", stderr: "" }),
        },
      ),
    ).rejects.toThrow("未生成 result_id=19562663 的本地 Markdown");
  });
});
