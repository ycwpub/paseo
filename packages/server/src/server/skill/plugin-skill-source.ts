import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import type { Skill } from "@getpaseo/protocol/messages";
import { ensurePrivateDirectory } from "../private-files.js";

export function copyPluginSkillSource(skill: Skill, destination: string): boolean {
  if (!skill.pluginId || !skill.path || !existsSync(skill.path)) return false;
  if (!statSync(skill.path).isFile() || path.basename(skill.path) !== "SKILL.md") return false;
  const sourceDirectory = path.dirname(skill.path);
  rmSync(destination, { recursive: true, force: true });
  ensurePrivateDirectory(path.dirname(destination));
  cpSync(sourceDirectory, destination, { recursive: true });
  return true;
}
