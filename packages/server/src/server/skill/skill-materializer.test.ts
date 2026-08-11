import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { Skill } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { SkillMaterializer } from "./skill-materializer.js";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  const timestamp = Date.now();
  return {
    id: "skill-review",
    name: "review",
    description: "Review code changes",
    source: "user",
    enabled: true,
    content: "---\nname: old-name\ndescription: old desc\n---\nOriginal body.",
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function realLinkTarget(linkPath: string): string {
  return path.resolve(path.dirname(linkPath), readlinkSync(linkPath));
}

describe("SkillMaterializer", () => {
  test("materializes enabled skills and links them into shared provider skill dirs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paseo-skill-materializer-"));
    const paseoHome = path.join(root, "paseo-home");
    const homeDir = path.join(root, "home");
    const codexHome = path.join(root, "codex-home");
    const materializer = new SkillMaterializer({
      paseoHome,
      homeDir,
      codexHome,
      logger: createTestLogger(),
    });

    materializer.sync([makeSkill()]);

    const sourceSkillPath = path.join(
      paseoHome,
      "skills-materialized",
      "review-skill-review",
      "SKILL.md",
    );
    expect(readFileSync(sourceSkillPath, "utf8")).toContain('name: "review"');
    expect(readFileSync(sourceSkillPath, "utf8")).toContain('description: "Review code changes"');
    expect(readFileSync(sourceSkillPath, "utf8")).toContain("Original body.");

    for (const targetDir of [
      path.join(homeDir, ".agents", "skills"),
      path.join(codexHome, "skills"),
      path.join(homeDir, ".claude", "skills"),
      path.join(homeDir, ".trae", "skills"),
    ]) {
      const linkPath = path.join(targetDir, "review");
      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(realLinkTarget(linkPath)).toBe(path.dirname(sourceSkillPath));
    }
  });

  test("keeps native provider roots available before an agent starts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paseo-skill-materializer-empty-"));
    const homeDir = path.join(root, "home");
    const codexHome = path.join(root, "codex-home");
    const materializer = new SkillMaterializer({
      paseoHome: path.join(root, "paseo-home"),
      homeDir,
      codexHome,
      logger: createTestLogger(),
    });

    materializer.sync([], { ensureNativeDirs: true });

    expect(existsSync(path.join(homeDir, ".agents", "skills"))).toBe(true);
    expect(existsSync(path.join(codexHome, "skills"))).toBe(true);
    expect(existsSync(path.join(homeDir, ".claude", "skills"))).toBe(true);
    expect(existsSync(path.join(homeDir, ".trae", "skills"))).toBe(true);
  });

  test("removes stale Paseo-managed symlinks but never clobbers user entries", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paseo-skill-materializer-cleanup-"));
    const paseoHome = path.join(root, "paseo-home");
    const homeDir = path.join(root, "home");
    const codexHome = path.join(root, "codex-home");
    const materializer = new SkillMaterializer({
      paseoHome,
      homeDir,
      codexHome,
      logger: createTestLogger(),
    });

    materializer.sync([makeSkill()]);
    const targetDir = path.join(homeDir, ".agents", "skills");
    const userEntry = path.join(targetDir, "review-user-owned");
    mkdirSync(userEntry, { recursive: true });
    writeFileSync(path.join(userEntry, "SKILL.md"), "user-owned");

    materializer.sync([makeSkill({ enabled: false })]);

    expect(existsSync(path.join(targetDir, "review"))).toBe(false);
    expect(existsSync(userEntry)).toBe(true);
    expect(existsSync(path.join(paseoHome, "skills-materialized", "review-skill-review"))).toBe(
      false,
    );
  });
  test("links only selected skills into workspace provider dirs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paseo-skill-materializer-workspace-"));
    const paseoHome = path.join(root, "paseo-home");
    const workspace = path.join(root, "workspace");
    const materializer = new SkillMaterializer({
      paseoHome,
      homeDir: path.join(root, "home"),
      codexHome: path.join(root, "codex-home"),
      logger: createTestLogger(),
    });

    materializer.syncForWorkspace(
      workspace,
      [makeSkill(), makeSkill({ id: "skill-test", name: "test" })],
      ["skill-test"],
    );

    for (const targetDir of [
      path.join(workspace, ".agents", "skills"),
      path.join(workspace, ".codex", "skills"),
      path.join(workspace, ".claude", "skills"),
      path.join(workspace, ".trae", "skills"),
    ]) {
      expect(existsSync(path.join(targetDir, "review"))).toBe(false);
      const linkPath = path.join(targetDir, "test");
      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(realLinkTarget(linkPath)).toBe(
        path.join(paseoHome, "skills-materialized", "test-skill-test"),
      );
    }

    materializer.syncForWorkspace(workspace, [makeSkill({ id: "skill-test", name: "test" })], []);
    expect(existsSync(path.join(workspace, ".agents", "skills", "test"))).toBe(false);
  });
});
