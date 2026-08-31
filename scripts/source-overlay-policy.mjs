const CLI_COMMAND_ROOT = "packages/cli/src/commands/";
const PARALLEL_COMMAND_DIRECTORY_PATTERN =
  /^packages\/cli\/src\/commands\/([^/]+)-management\/(.+)$/u;

function hasPathUnder(paths, directory) {
  const prefix = `${directory}/`;
  return paths.some((path) => path.startsWith(prefix));
}

export function findSemanticSourceOverlayErrors(paths, readPath) {
  const pathSet = new Set(paths);
  const errors = [];
  const reportedDirectories = new Set();

  for (const path of paths) {
    if (!path.startsWith(CLI_COMMAND_ROOT)) continue;

    const match = PARALLEL_COMMAND_DIRECTORY_PATTERN.exec(path);
    if (!match) continue;

    const [, commandName, relativePath] = match;
    const parallelDirectory = `${CLI_COMMAND_ROOT}${commandName}-management`;
    const canonicalDirectory = `${CLI_COMMAND_ROOT}${commandName}`;
    if (!hasPathUnder(paths, canonicalDirectory)) continue;

    if (!reportedDirectories.has(parallelDirectory)) {
      errors.push(
        `禁止平行复制 CLI 子系统：${parallelDirectory}；请保留 ${canonicalDirectory} 作为唯一实现`,
      );
      reportedDirectories.add(parallelDirectory);
    }

    const canonicalPath = `${canonicalDirectory}/${relativePath}`;
    if (pathSet.has(canonicalPath) && readPath(path) === readPath(canonicalPath)) {
      errors.push(`检测到内容完全相同的 CLI 语义 overlay：${canonicalPath} <- ${path}`);
    }
  }

  return errors;
}
