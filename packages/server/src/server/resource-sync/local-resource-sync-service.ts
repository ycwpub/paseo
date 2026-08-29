import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  LocalResourceApplyResult,
  LocalResourceExistingPolicy,
  LocalResourceMissingPolicy,
  LocalResourceSnapshot,
  LocalResourceSnapshotEntry,
} from "@getpaseo/protocol/resource-sync/rpc-schemas";

const MAX_FILE_COUNT = 2_000;
const MAX_SINGLE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const IGNORED_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".idea",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);

function expandUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith(`~${path.sep}`)) {
    return path.resolve(homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

function snapshotPath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function decodedSnapshotPath(value: string): string[] {
  if (value === ".") return [];
  if (
    !value ||
    value.includes("\0") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
    throw new Error(`非法同步路径：${value}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`非法同步路径：${value}`);
  }
  return segments;
}

function resolveSnapshotTarget(root: string, relativePath: string): string {
  const segments = decodedSnapshotPath(relativePath);
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`同步路径越界：${relativePath}`);
  }
  return resolved;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function lstatOrNull(targetPath: string) {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoSymlinkBetween(root: string, targetPath: string): Promise<void> {
  const relative = path.relative(root, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`同步路径越界：${targetPath}`);
  }
  let current = root;
  const segments = relative ? relative.split(path.sep) : [];
  for (const segment of segments) {
    current = path.join(current, segment);
    const stats = await lstatOrNull(current);
    if (!stats) return;
    if (stats.isSymbolicLink()) {
      throw new Error(`拒绝通过符号链接写入：${current}`);
    }
  }
}

function conflictSuffix(sourceLabel: string | undefined): string {
  const normalized = (sourceLabel ?? "host")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `.paseo-source-${normalized || "host"}`;
}

async function nextConflictPath(targetPath: string, suffix: string): Promise<string> {
  const extension = path.extname(targetPath);
  const stem = extension ? targetPath.slice(0, -extension.length) : targetPath;
  for (let index = 0; ; index += 1) {
    const candidate = `${stem}${suffix}${index === 0 ? "" : `-${index + 1}`}${extension}`;
    if (!(await lstatOrNull(candidate))) return candidate;
  }
}

function emptyApplyResult(
  status: LocalResourceApplyResult["status"] = "applied",
): LocalResourceApplyResult {
  return {
    status,
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    bytesWritten: 0,
    conflictPaths: [],
  };
}

function decodeFile(entry: LocalResourceSnapshotEntry): Buffer {
  if (entry.kind !== "file" || entry.contentBase64 === undefined || !entry.hash) {
    throw new Error(`同步快照中的文件不完整：${entry.path}`);
  }
  const bytes = Buffer.from(entry.contentBase64, "base64");
  if (bytes.byteLength !== entry.size || hashBytes(bytes) !== entry.hash) {
    throw new Error(`同步快照中的文件校验失败：${entry.path}`);
  }
  return bytes;
}

function validateSnapshotLimits(snapshot: LocalResourceSnapshot): void {
  const files = snapshot.entries.filter((entry) => entry.kind === "file");
  const directories = snapshot.entries.length - files.length;
  const totalBytes = files.reduce((total, entry) => total + entry.size, 0);
  if (
    files.length !== snapshot.totalFiles ||
    directories !== snapshot.totalDirectories ||
    totalBytes !== snapshot.totalBytes
  ) {
    throw new Error("同步快照统计信息不一致");
  }
  if (files.length > MAX_FILE_COUNT) {
    throw new Error(`文件数量超过 ${MAX_FILE_COUNT} 个限制`);
  }
  if (files.some((entry) => entry.size > MAX_SINGLE_FILE_BYTES)) {
    throw new Error(`存在超过 ${MAX_SINGLE_FILE_BYTES / 1024 / 1024} MB 限制的文件`);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`同步内容超过 ${MAX_TOTAL_BYTES / 1024 / 1024} MB 限制`);
  }
}

export async function exportLocalResource(sourcePath: string): Promise<LocalResourceSnapshot> {
  const root = expandUserPath(sourcePath);
  const rootStats = await fs.lstat(root);
  if (rootStats.isSymbolicLink()) {
    throw new Error("不支持同步符号链接");
  }
  if (!rootStats.isFile() && !rootStats.isDirectory()) {
    throw new Error("只支持同步普通文件或目录");
  }

  const entries: LocalResourceSnapshotEntry[] = [];
  const skippedPaths: string[] = [];
  let totalFiles = 0;
  let totalDirectories = 0;
  let totalBytes = 0;

  const appendFile = async (absolutePath: string, relativePath: string): Promise<void> => {
    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      skippedPaths.push(snapshotPath(relativePath));
      return;
    }
    if (!stats.isFile()) {
      skippedPaths.push(snapshotPath(relativePath));
      return;
    }
    if (stats.size > MAX_SINGLE_FILE_BYTES) {
      throw new Error(
        `文件超过单文件 ${MAX_SINGLE_FILE_BYTES / 1024 / 1024} MB 限制：${relativePath}`,
      );
    }
    if (totalFiles + 1 > MAX_FILE_COUNT) {
      throw new Error(`文件数量超过 ${MAX_FILE_COUNT} 个限制`);
    }
    if (totalBytes + stats.size > MAX_TOTAL_BYTES) {
      throw new Error(`同步内容超过 ${MAX_TOTAL_BYTES / 1024 / 1024} MB 限制`);
    }
    const bytes = await fs.readFile(absolutePath);
    totalFiles += 1;
    totalBytes += bytes.byteLength;
    entries.push({
      path: snapshotPath(relativePath),
      kind: "file",
      size: bytes.byteLength,
      modifiedAt: stats.mtime.toISOString(),
      hash: hashBytes(bytes),
      contentBase64: bytes.toString("base64"),
    });
  };

  const walkDirectory = async (absoluteDirectory: string, relativeDirectory: string) => {
    const children = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relativePath = relativeDirectory
        ? path.join(relativeDirectory, child.name)
        : child.name;
      const normalizedPath = snapshotPath(relativePath);
      if (IGNORED_NAMES.has(child.name)) {
        skippedPaths.push(normalizedPath);
        continue;
      }
      const absolutePath = path.join(absoluteDirectory, child.name);
      const stats = await fs.lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        skippedPaths.push(normalizedPath);
        continue;
      }
      if (stats.isDirectory()) {
        totalDirectories += 1;
        entries.push({
          path: normalizedPath,
          kind: "directory",
          size: 0,
          modifiedAt: stats.mtime.toISOString(),
        });
        await walkDirectory(absolutePath, relativePath);
      } else if (stats.isFile()) {
        await appendFile(absolutePath, relativePath);
      } else {
        skippedPaths.push(normalizedPath);
      }
    }
  };

  if (rootStats.isFile()) {
    await appendFile(root, ".");
  } else {
    await walkDirectory(root, "");
  }

  return {
    version: 1,
    rootKind: rootStats.isFile() ? "file" : "directory",
    entries,
    totalFiles,
    totalDirectories,
    totalBytes,
    skippedPaths,
  };
}

async function filesEqual(targetPath: string, entry: LocalResourceSnapshotEntry): Promise<boolean> {
  const targetBytes = await fs.readFile(targetPath);
  return targetBytes.byteLength === entry.size && hashBytes(targetBytes) === entry.hash;
}

async function writeSnapshotFile(
  targetPath: string,
  entry: LocalResourceSnapshotEntry,
): Promise<number> {
  const bytes = decodeFile(entry);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, bytes);
  return bytes.byteLength;
}

function remapRelativePath(relativePath: string, remaps: ReadonlyMap<string, string>): string {
  let bestSource = "";
  let bestTarget = "";
  for (const [source, target] of remaps) {
    if (
      (relativePath === source || relativePath.startsWith(`${source}/`)) &&
      source.length > bestSource.length
    ) {
      bestSource = source;
      bestTarget = target;
    }
  }
  if (!bestSource) return relativePath;
  const remainder = relativePath.slice(bestSource.length).replace(/^\/+/, "");
  return remainder ? `${bestTarget}/${remainder}` : bestTarget;
}

interface ApplyLocalResourceInput {
  targetPath: string;
  snapshot: LocalResourceSnapshot;
  missingPolicy: LocalResourceMissingPolicy;
  existingPolicy: LocalResourceExistingPolicy;
  sourceLabel?: string;
}

async function prepareEffectiveRoot(
  input: ApplyLocalResourceInput,
  requestedRoot: string,
  existingRoot: Awaited<ReturnType<typeof lstatOrNull>>,
  result: LocalResourceApplyResult,
  suffix: string,
): Promise<string> {
  const rootKindMatches =
    !existingRoot ||
    (input.snapshot.rootKind === "file" ? existingRoot.isFile() : existingRoot.isDirectory());
  if (!existingRoot || rootKindMatches) return requestedRoot;
  if (input.existingPolicy === "overwrite") {
    await fs.rm(requestedRoot, { recursive: true, force: true });
    result.updated += 1;
    return requestedRoot;
  }
  const conflictPath = await nextConflictPath(requestedRoot, suffix);
  result.conflicts += 1;
  result.conflictPaths.push(conflictPath);
  return conflictPath;
}

async function applyRootFile(input: {
  requestedRoot: string;
  effectiveRoot: string;
  snapshot: LocalResourceSnapshot;
  existingPolicy: LocalResourceExistingPolicy;
  suffix: string;
  result: LocalResourceApplyResult;
}): Promise<LocalResourceApplyResult> {
  const entry = input.snapshot.entries.find((candidate) => candidate.path === ".");
  if (!entry) throw new Error("同步快照缺少根文件");
  const existing = await lstatOrNull(input.effectiveRoot);
  if (!existing) {
    input.result.bytesWritten += await writeSnapshotFile(input.effectiveRoot, entry);
    input.result.created += 1;
    return input.result;
  }
  if (existing.isSymbolicLink()) throw new Error(`拒绝覆盖符号链接：${input.effectiveRoot}`);
  if (existing.isFile() && (await filesEqual(input.effectiveRoot, entry))) {
    input.result.skipped += 1;
    return input.result;
  }
  if (input.existingPolicy === "merge" && input.effectiveRoot === input.requestedRoot) {
    const conflictPath = await nextConflictPath(input.effectiveRoot, input.suffix);
    input.result.bytesWritten += await writeSnapshotFile(conflictPath, entry);
    input.result.created += 1;
    input.result.conflicts += 1;
    input.result.conflictPaths.push(conflictPath);
    return input.result;
  }
  if (existing.isDirectory()) {
    await fs.rm(input.effectiveRoot, { recursive: true, force: true });
  }
  input.result.bytesWritten += await writeSnapshotFile(input.effectiveRoot, entry);
  input.result.updated += 1;
  return input.result;
}

async function ensureDirectoryRoot(
  effectiveRoot: string,
  result: LocalResourceApplyResult,
): Promise<void> {
  const stats = await lstatOrNull(effectiveRoot);
  if (!stats) {
    await fs.mkdir(effectiveRoot, { recursive: true });
    result.created += 1;
    return;
  }
  if (!stats.isDirectory()) {
    throw new Error(`目标路径不是目录：${effectiveRoot}`);
  }
}

async function applyDirectoryEntries(input: {
  effectiveRoot: string;
  snapshot: LocalResourceSnapshot;
  existingPolicy: LocalResourceExistingPolicy;
  suffix: string;
  result: LocalResourceApplyResult;
  remaps: Map<string, string>;
}): Promise<void> {
  const directories = input.snapshot.entries
    .filter((entry) => entry.kind === "directory")
    .sort((left, right) => left.path.split("/").length - right.path.split("/").length);
  for (const entry of directories) {
    const relativePath = remapRelativePath(entry.path, input.remaps);
    const targetPath = resolveSnapshotTarget(input.effectiveRoot, relativePath);
    await assertNoSymlinkBetween(input.effectiveRoot, targetPath);
    const existing = await lstatOrNull(targetPath);
    if (!existing) {
      await fs.mkdir(targetPath, { recursive: true });
      input.result.created += 1;
    } else if (existing.isDirectory()) {
      input.result.skipped += 1;
    } else if (existing.isSymbolicLink()) {
      throw new Error(`拒绝覆盖符号链接：${targetPath}`);
    } else if (input.existingPolicy === "overwrite") {
      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.mkdir(targetPath, { recursive: true });
      input.result.updated += 1;
    } else {
      const conflictPath = await nextConflictPath(targetPath, input.suffix);
      await fs.mkdir(conflictPath, { recursive: true });
      input.remaps.set(entry.path, snapshotPath(path.relative(input.effectiveRoot, conflictPath)));
      input.result.created += 1;
      input.result.conflicts += 1;
      input.result.conflictPaths.push(conflictPath);
    }
  }
}

async function applyFileEntries(input: {
  effectiveRoot: string;
  snapshot: LocalResourceSnapshot;
  existingPolicy: LocalResourceExistingPolicy;
  suffix: string;
  result: LocalResourceApplyResult;
  remaps: ReadonlyMap<string, string>;
}): Promise<void> {
  for (const entry of input.snapshot.entries.filter((candidate) => candidate.kind === "file")) {
    const relativePath = remapRelativePath(entry.path, input.remaps);
    const targetPath = resolveSnapshotTarget(input.effectiveRoot, relativePath);
    await assertNoSymlinkBetween(input.effectiveRoot, targetPath);
    const existing = await lstatOrNull(targetPath);
    if (!existing) {
      input.result.bytesWritten += await writeSnapshotFile(targetPath, entry);
      input.result.created += 1;
    } else if (existing.isSymbolicLink()) {
      throw new Error(`拒绝覆盖符号链接：${targetPath}`);
    } else if (existing.isFile() && (await filesEqual(targetPath, entry))) {
      input.result.skipped += 1;
    } else if (input.existingPolicy === "merge") {
      const conflictPath = await nextConflictPath(targetPath, input.suffix);
      input.result.bytesWritten += await writeSnapshotFile(conflictPath, entry);
      input.result.created += 1;
      input.result.conflicts += 1;
      input.result.conflictPaths.push(conflictPath);
    } else {
      if (existing.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      }
      input.result.bytesWritten += await writeSnapshotFile(targetPath, entry);
      input.result.updated += 1;
    }
  }
}

export async function applyLocalResource(
  input: ApplyLocalResourceInput,
): Promise<LocalResourceApplyResult> {
  validateSnapshotLimits(input.snapshot);
  const requestedRoot = expandUserPath(input.targetPath);
  const existingRoot = await lstatOrNull(requestedRoot);
  if (!existingRoot && input.missingPolicy === "skip") {
    return {
      ...emptyApplyResult("skipped_missing"),
      skipped: input.snapshot.totalFiles + input.snapshot.totalDirectories,
    };
  }
  if (existingRoot?.isSymbolicLink()) {
    throw new Error(`拒绝覆盖符号链接：${requestedRoot}`);
  }
  if (existingRoot && input.existingPolicy === "skip") {
    return {
      ...emptyApplyResult("skipped_existing"),
      skipped: input.snapshot.totalFiles + input.snapshot.totalDirectories,
    };
  }

  const result = emptyApplyResult();
  const suffix = conflictSuffix(input.sourceLabel);
  const effectiveRoot = await prepareEffectiveRoot(
    input,
    requestedRoot,
    existingRoot,
    result,
    suffix,
  );

  if (input.snapshot.rootKind === "file") {
    return applyRootFile({
      requestedRoot,
      effectiveRoot,
      snapshot: input.snapshot,
      existingPolicy: input.existingPolicy,
      suffix,
      result,
    });
  }

  await ensureDirectoryRoot(effectiveRoot, result);
  const remaps = new Map<string, string>();
  await applyDirectoryEntries({
    effectiveRoot,
    snapshot: input.snapshot,
    existingPolicy: input.existingPolicy,
    suffix,
    result,
    remaps,
  });
  await applyFileEntries({
    effectiveRoot,
    snapshot: input.snapshot,
    existingPolicy: input.existingPolicy,
    suffix,
    result,
    remaps,
  });
  return result;
}
