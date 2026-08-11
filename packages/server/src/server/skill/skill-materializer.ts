import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type pino from "pino";
import type { Skill } from "@getpaseo/protocol/messages";
import { ensurePrivateDirectory, writePrivateFileAtomicSync } from "../private-files.js";

export interface SkillMaterializerSyncOptions {
  /**
   * Create native provider skill roots even when there are no enabled skills.
   * This matches AionUi's Claude watcher rule: the top-level skills directory
   * should exist before an agent process starts, otherwise some providers only
   * notice new skills after a restart.
   */
  ensureNativeDirs?: boolean;
}

export interface SkillMaterializerOptions {
  paseoHome: string;
  logger: pino.Logger;
  homeDir?: string;
  codexHome?: string;
  targetDirs?: string[];
}

interface MaterializedSkill {
  skill: Skill;
  sourceDir: string;
  linkName: string;
}

function canonicalSkillName(name: string): string {
  return name.trim().toLowerCase();
}

function isValidSkillName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !/[\s/]/u.test(trimmed);
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^\w.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return sanitized || "skill";
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function stripFrontMatter(content: string): string {
  const normalized = content.replace(/^\uFEFF/u, "");
  if (!normalized.startsWith("---")) {
    return normalized.trim();
  }
  const match = /^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/u.exec(normalized);
  if (!match) {
    return normalized.trim();
  }
  return normalized.slice(match[0].length).trim();
}

function formatSkillMarkdown(skill: Skill): string {
  const body = stripFrontMatter(skill.content ?? "");
  const description = skill.description?.trim() || "Paseo-managed skill";
  return [
    "---",
    `name: ${yamlQuoted(skill.name.trim())}`,
    `description: ${yamlQuoted(description)}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
}

function pathContains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveSymlinkTarget(linkPath: string, rawTarget: string): string {
  return path.resolve(path.dirname(linkPath), rawTarget);
}

export class SkillMaterializer {
  private readonly logger: pino.Logger;
  private readonly sourceRoot: string;
  private readonly targetDirs: string[];

  constructor(options: SkillMaterializerOptions) {
    this.logger = options.logger.child({ module: "skill-materializer" });
    const homeDir = options.homeDir ?? os.homedir();
    const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? path.join(homeDir, ".codex");
    this.sourceRoot = path.join(options.paseoHome, "skills-materialized");
    this.targetDirs = options.targetDirs ?? [
      path.join(homeDir, ".agents", "skills"),
      path.join(codexHome, "skills"),
      path.join(homeDir, ".claude", "skills"),
      path.join(homeDir, ".trae", "skills"),
    ];
  }

  sync(skills: readonly Skill[], options: SkillMaterializerSyncOptions = {}): void {
    const materialized = this.materializeEnabledSkills(skills);
    this.cleanupMaterializedSources(new Set(materialized.map((entry) => entry.sourceDir)));
    this.syncLinksToTargetDirs(materialized, this.targetDirs, options);
  }

  syncForWorkspace(
    cwd: string,
    skills: readonly Skill[],
    selectedSkillIds: readonly string[],
    options: SkillMaterializerSyncOptions = {},
  ): void {
    const selected = new Set(selectedSkillIds);
    const materialized = this.materializeEnabledSkills(skills).filter((entry) =>
      selected.has(entry.skill.id),
    );
    this.syncLinksToTargetDirs(materialized, this.workspaceTargetDirs(cwd), {
      ...options,
      ensureNativeDirs: true,
    });
  }

  private syncLinksToTargetDirs(
    materialized: readonly MaterializedSkill[],
    targetDirs: readonly string[],
    options: SkillMaterializerSyncOptions = {},
  ): void {
    const shouldEnsureTargetDirs = options.ensureNativeDirs === true || materialized.length > 0;
    if (!shouldEnsureTargetDirs) {
      for (const targetDir of targetDirs) {
        this.cleanupProviderLinks(new Set(), targetDir);
      }
      return;
    }

    for (const targetDir of targetDirs) {
      mkdirSync(targetDir, { recursive: true });
      const desiredLinkPaths = new Set<string>();
      for (const entry of materialized) {
        const linkPath = path.join(targetDir, entry.linkName);
        desiredLinkPaths.add(linkPath);
        this.ensureSymlink(linkPath, entry.sourceDir, entry.skill.name);
      }
      this.cleanupProviderLinks(desiredLinkPaths, targetDir);
    }
  }

  private workspaceTargetDirs(cwd: string): string[] {
    return [
      path.join(cwd, ".agents", "skills"),
      path.join(cwd, ".codex", "skills"),
      path.join(cwd, ".claude", "skills"),
      path.join(cwd, ".trae", "skills"),
    ];
  }

  private materializeEnabledSkills(skills: readonly Skill[]): MaterializedSkill[] {
    ensurePrivateDirectory(this.sourceRoot);
    const seenNames = new Set<string>();
    const result: MaterializedSkill[] = [];

    for (const skill of skills) {
      const name = skill.name.trim();
      const canonical = canonicalSkillName(name);
      if (
        !skill.enabled ||
        !isValidSkillName(name) ||
        !skill.content?.trim() ||
        seenNames.has(canonical)
      ) {
        continue;
      }
      seenNames.add(canonical);

      const linkName = sanitizePathSegment(name);
      const sourceDir = path.join(this.sourceRoot, `${linkName}-${skill.id}`);
      ensurePrivateDirectory(sourceDir);
      writePrivateFileAtomicSync(path.join(sourceDir, "SKILL.md"), formatSkillMarkdown(skill));
      result.push({ skill, sourceDir, linkName });
    }

    return result;
  }

  private ensureSymlink(linkPath: string, sourceDir: string, skillName: string): void {
    try {
      const stats = lstatSync(linkPath);
      if (stats.isSymbolicLink()) {
        const existingTarget = resolveSymlinkTarget(linkPath, readlinkSync(linkPath));
        if (existingTarget === sourceDir) {
          return;
        }
        if (pathContains(this.sourceRoot, existingTarget)) {
          rmSync(linkPath, { force: true });
        } else {
          this.logger.warn(
            { linkPath, existingTarget, skillName },
            "Skipping skill symlink because a non-Paseo symlink already exists",
          );
          return;
        }
      } else {
        this.logger.warn(
          { linkPath, skillName },
          "Skipping skill symlink because a non-symlink entry already exists",
        );
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    symlinkSync(sourceDir, linkPath, process.platform === "win32" ? "junction" : "dir");
  }

  private cleanupMaterializedSources(desiredSourceDirs: ReadonlySet<string>): void {
    if (!existsSync(this.sourceRoot)) return;
    for (const entry of readdirSync(this.sourceRoot, { withFileTypes: true })) {
      const entryPath = path.join(this.sourceRoot, entry.name);
      if (desiredSourceDirs.has(entryPath)) continue;
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        rmSync(entryPath, { recursive: true, force: true });
      }
    }
  }

  private cleanupProviderLinks(desiredLinkPaths: ReadonlySet<string>, targetDir?: string): void {
    const dirs = targetDir ? [targetDir] : this.targetDirs;
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const linkPath = path.join(dir, entry.name);
        if (desiredLinkPaths.has(linkPath) || !entry.isSymbolicLink()) continue;
        let target: string;
        try {
          target = resolveSymlinkTarget(linkPath, readlinkSync(linkPath));
        } catch {
          continue;
        }
        if (target === this.sourceRoot || pathContains(this.sourceRoot, target)) {
          rmSync(linkPath, { force: true });
        }
      }
    }
  }
}
