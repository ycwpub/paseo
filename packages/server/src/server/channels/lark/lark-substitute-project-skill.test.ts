import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import {
  buildLarkSubstituteReplySkill,
  LarkSubstituteProjectSkillSync,
} from "./lark-substitute-project-skill.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function mode(cwd: string): LarkSubstituteMode {
  return {
    id: "mode-1",
    name: "工作替身",
    enabled: true,
    botId: "bot-1",
    privateScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    },
    disclosure: { enabled: true, prompt: "【代答】" },
    customPrompt: "仅回答工作问题",
    delaySeconds: 600,
    autoArchiveAgent: false,
    activeTimeRanges: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "codex",
      cwd,
      workspaceId: "workspace-1",
      projectId: "prj-support",
    },
    createdAt: "2026-09-09T08:00:00.000Z",
    updatedAt: "2026-09-09T08:00:00.000Z",
  };
}

describe("LarkSubstituteProjectSkillSync", () => {
  it("links one managed reply Skill into every supported Project skill root", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paseo-substitute-skill-"));
    temporaryDirectories.push(root);
    const paseoHome = path.join(root, "home");
    const cwd = path.join(root, "project");
    mkdirSync(cwd, { recursive: true });
    const sync = new LarkSubstituteProjectSkillSync({
      paseoHome,
      logger: pino({ level: "silent" }),
    });

    sync.sync([mode(cwd)]);

    for (const providerRoot of [".agents", ".codex", ".claude", ".trae"]) {
      const linkPath = path.join(cwd, providerRoot, "skills", "lark-substitute-reply");
      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(path.resolve(path.dirname(linkPath), readlinkSync(linkPath))).toBe(
        path.join(paseoHome, "channels", "generated-skills", "lark-substitute-reply"),
      );
    }
    expect(
      readFileSync(
        path.join(paseoHome, "channels", "generated-skills", "lark-substitute-reply", "SKILL.md"),
        "utf8",
      ),
    ).toBe(buildLarkSubstituteReplySkill());
  });

  it("does not overwrite a Project-owned skill with the same name", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paseo-substitute-skill-owned-"));
    temporaryDirectories.push(root);
    const paseoHome = path.join(root, "home");
    const cwd = path.join(root, "project");
    const skillPath = path.join(cwd, ".agents", "skills", "lark-substitute-reply");
    mkdirSync(skillPath, { recursive: true });
    writeFileSync(path.join(skillPath, "SKILL.md"), "user-owned");

    new LarkSubstituteProjectSkillSync({
      paseoHome,
      logger: pino({ level: "silent" }),
    }).sync([mode(cwd)]);

    expect(readFileSync(path.join(skillPath, "SKILL.md"), "utf8")).toBe("user-owned");
  });

  it("removes only its own links when the Project is no longer bound", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paseo-substitute-skill-cleanup-"));
    temporaryDirectories.push(root);
    const paseoHome = path.join(root, "home");
    const cwd = path.join(root, "project");
    mkdirSync(cwd, { recursive: true });
    const sync = new LarkSubstituteProjectSkillSync({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    sync.sync([mode(cwd)]);

    sync.sync([], [cwd]);

    expect(exists(path.join(cwd, ".agents", "skills", "lark-substitute-reply"))).toBe(false);
  });
});

function exists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}
