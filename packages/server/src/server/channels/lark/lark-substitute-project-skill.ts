import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";
import type pino from "pino";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import { writePrivateFileAtomicSync } from "../../private-files.js";
import { resolveLarkTargetProjectId } from "./lark-project-target.js";

const SKILL_NAME = "lark-substitute-reply";
const MANAGED_MARKER = "<!-- paseo-managed:lark-substitute-reply -->";
const PROVIDER_SKILL_ROOTS = [".agents", ".codex", ".claude", ".trae"] as const;

export function buildLarkSubstituteReplySkill(): string {
  return [
    "---",
    `name: ${SKILL_NAME}`,
    "description: 当被替身用户要求优化、修正或重新发送替身回答时，将最终答案回复到原飞书话题。",
    "---",
    "",
    MANAGED_MARKER,
    "",
    "# 重新发送替身回答",
    "",
    "仅在当前 Agent 来自替身任务，且用户明确要求修正或重发答案时使用。",
    "",
    "1. 完成答案优化，只保留要发给原用户的最终内容。",
    "2. 将最终内容写入临时文本文件。",
    "3. 执行：",
    "",
    "```bash",
    "paseo substitute reply --message-file /absolute/path/to/final-reply.txt",
    "```",
    "",
    "`paseo` 会读取当前进程的 `PASEO_AGENT_ID`，校验 Agent、替身任务、Project、机器人和原话题的绑定关系，然后在原话题中 @ 原发送方。",
    "",
    "- 不传递或输出飞书 Token、App Secret。",
    "- 不要用普通消息发送命令替代此命令。",
    "- 命令失败时原样报告错误，不自动循环重试。",
    "",
  ].join("\n");
}

function resolveLinkTarget(linkPath: string): string {
  return path.resolve(path.dirname(linkPath), readlinkSync(linkPath));
}

function isUsableProjectCwd(cwd: string): boolean {
  try {
    return statSync(cwd).isDirectory();
  } catch {
    return false;
  }
}

export class LarkSubstituteProjectSkillSync {
  private readonly paseoHome: string;
  private readonly logger: pino.Logger;
  private readonly sourceDirectory: string;

  constructor(options: { paseoHome: string; logger: pino.Logger }) {
    this.paseoHome = options.paseoHome;
    this.logger = options.logger.child({ module: "lark-substitute-project-skill" });
    this.sourceDirectory = path.join(this.paseoHome, "channels", "generated-skills", SKILL_NAME);
  }

  sync(modes: readonly LarkSubstituteMode[], additionalCwds: readonly string[] = []): void {
    const desiredCwds = new Set(
      modes.flatMap((mode) => {
        const cwd = mode.target.cwd?.trim();
        const projectId = resolveLarkTargetProjectId(mode.target, this.paseoHome);
        return cwd && projectId && isUsableProjectCwd(cwd) ? [path.resolve(cwd)] : [];
      }),
    );
    if (desiredCwds.size > 0) {
      writePrivateFileAtomicSync(
        path.join(this.sourceDirectory, "SKILL.md"),
        buildLarkSubstituteReplySkill(),
      );
    }

    for (const cwd of desiredCwds) {
      this.ensureProjectLinks(cwd);
    }
    for (const cwd of additionalCwds) {
      const resolved = path.resolve(cwd);
      if (!desiredCwds.has(resolved)) {
        this.removeProjectLinks(resolved);
      }
    }
  }

  private ensureProjectLinks(cwd: string): void {
    for (const providerRoot of PROVIDER_SKILL_ROOTS) {
      const skillRoot = path.join(cwd, providerRoot, "skills");
      const linkPath = path.join(skillRoot, SKILL_NAME);
      mkdirSync(skillRoot, { recursive: true });
      if (existsSync(linkPath)) {
        const existing = lstatSync(linkPath);
        if (existing.isSymbolicLink() && resolveLinkTarget(linkPath) === this.sourceDirectory) {
          continue;
        }
        this.logger.warn({ cwd, linkPath }, "未覆盖 Project 中已有的同名替身回复 Skill");
        continue;
      }
      symlinkSync(
        this.sourceDirectory,
        linkPath,
        process.platform === "win32" ? "junction" : "dir",
      );
    }
  }

  private removeProjectLinks(cwd: string): void {
    for (const providerRoot of PROVIDER_SKILL_ROOTS) {
      const linkPath = path.join(cwd, providerRoot, "skills", SKILL_NAME);
      try {
        if (!lstatSync(linkPath).isSymbolicLink()) continue;
        if (resolveLinkTarget(linkPath) !== this.sourceDirectory) continue;
        rmSync(linkPath, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          this.logger.warn({ err: error, linkPath }, "清理替身回复 Skill 链接失败");
        }
      }
    }
  }
}
