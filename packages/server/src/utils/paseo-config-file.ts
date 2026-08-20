import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PaseoConfigRawSchema,
  type PaseoConfigRaw,
  type PaseoConfigRevision,
  type ProjectConfigRpcError,
} from "@getpaseo/protocol/paseo-config-schema";
export {
  PaseoConfigRevisionSchema,
  ProjectConfigRpcErrorSchema,
  type PaseoConfigRevision,
  type ProjectConfigRpcError,
} from "@getpaseo/protocol/paseo-config-schema";

export const PASEO_CONFIG_FILE_NAME = "paseo.json";

export type ReadPaseoConfigForEditResult =
  | { ok: true; config: PaseoConfigRaw | null; revision: PaseoConfigRevision | null }
  | { ok: false; error: ProjectConfigRpcError };

export type WritePaseoConfigForEditResult =
  | { ok: true; config: PaseoConfigRaw; revision: PaseoConfigRevision }
  | { ok: false; error: ProjectConfigRpcError };

export interface WritePaseoConfigForEditInput {
  repoRoot: string;
  config: PaseoConfigRaw;
  expectedRevision: PaseoConfigRevision | null;
}

export interface WritePaseoConfigFileForEditInput {
  configPath: string;
  config: PaseoConfigRaw;
  expectedRevision: PaseoConfigRevision | null;
}

export function resolvePaseoConfigPath(repoRoot: string): string {
  return join(repoRoot, PASEO_CONFIG_FILE_NAME);
}

export function statPaseoConfigFile(configPath: string): PaseoConfigRevision | null {
  if (!existsSync(configPath)) {
    return null;
  }
  const stats = statSync(configPath);
  return {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
}

export function statPaseoConfigPath(repoRoot: string): PaseoConfigRevision | null {
  return statPaseoConfigFile(resolvePaseoConfigPath(repoRoot));
}

export function readPaseoConfigJsonFile(configPath: string): unknown {
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(readFileSync(configPath, "utf8"));
}

export function readPaseoConfigJson(repoRoot: string): unknown {
  return readPaseoConfigJsonFile(resolvePaseoConfigPath(repoRoot));
}

export function readPaseoConfigFileForEdit(configPath: string): ReadPaseoConfigForEditResult {
  try {
    const json = readPaseoConfigJsonFile(configPath);
    if (json === null) {
      return { ok: true, config: null, revision: null };
    }
    return {
      ok: true,
      config: PaseoConfigRawSchema.parse(json),
      revision: statPaseoConfigFile(configPath),
    };
  } catch {
    return {
      ok: false,
      error: { code: "invalid_project_config" },
    };
  }
}

export function readPaseoConfigForEdit(repoRoot: string): ReadPaseoConfigForEditResult {
  return readPaseoConfigFileForEdit(resolvePaseoConfigPath(repoRoot));
}

export function writePaseoConfigFileForEdit(
  input: WritePaseoConfigFileForEditInput,
): WritePaseoConfigForEditResult {
  const parsed = PaseoConfigRawSchema.safeParse(input.config);
  if (!parsed.success) {
    return { ok: false, error: { code: "invalid_project_config" } };
  }

  const configDirectory = dirname(input.configPath);
  const tempPath = join(
    configDirectory,
    `.${PASEO_CONFIG_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    writeFileSync(tempPath, `${JSON.stringify(parsed.data, null, 2)}\n`);
    const currentRevision = statPaseoConfigFile(input.configPath);
    if (!paseoConfigRevisionsEqual(currentRevision, input.expectedRevision)) {
      removeTempPaseoConfig(tempPath);
      return {
        ok: false,
        error: { code: "stale_project_config", currentRevision },
      };
    }

    renameSync(tempPath, input.configPath);
    const revision = statPaseoConfigFile(input.configPath);
    if (!revision) {
      return { ok: false, error: { code: "write_failed" } };
    }
    return { ok: true, config: parsed.data, revision };
  } catch {
    removeTempPaseoConfig(tempPath);
    return { ok: false, error: { code: "write_failed" } };
  }
}

export function writePaseoConfigForEdit(
  input: WritePaseoConfigForEditInput,
): WritePaseoConfigForEditResult {
  return writePaseoConfigFileForEdit({
    configPath: resolvePaseoConfigPath(input.repoRoot),
    config: input.config,
    expectedRevision: input.expectedRevision,
  });
}

export function paseoConfigRevisionsEqual(
  left: PaseoConfigRevision | null,
  right: PaseoConfigRevision | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

function removeTempPaseoConfig(tempPath: string): void {
  try {
    rmSync(tempPath, { force: true });
  } catch {
    // Best-effort cleanup only; callers need the original write outcome.
  }
}
