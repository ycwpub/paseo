import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import { resolvePaseoHome } from "../../paseo-home.js";

const CODEX_NODE_REPL_SUFFIX = path.join(
  "Codex.app",
  "Contents",
  "Resources",
  "cua_node",
  "bin",
  "node_repl",
);

export function resolveBackgroundMcpCommand(command: string): string {
  if (
    process.platform !== "darwin" ||
    !path.isAbsolute(command) ||
    !command.endsWith(CODEX_NODE_REPL_SUFFIX)
  ) {
    return command;
  }

  try {
    const source = statSync(command);
    if (!source.isFile()) {
      return command;
    }

    const cacheKey = createHash("sha256")
      .update(command)
      .update("\0")
      .update(String(source.size))
      .update("\0")
      .update(String(source.mtimeMs))
      .digest("hex")
      .slice(0, 24);
    const cacheDirectory = path.join(
      resolvePaseoHome(),
      "cache",
      "mcp-background-executables",
      cacheKey,
    );
    const cachedCommand = path.join(cacheDirectory, path.basename(command));
    if (existsSync(cachedCommand)) {
      return cachedCommand;
    }

    mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
    const temporaryCommand = `${cachedCommand}.tmp-${process.pid}-${Date.now()}`;
    try {
      copyFileSync(command, temporaryCommand);
      chmodSync(temporaryCommand, 0o700);
      renameSync(temporaryCommand, cachedCommand);
    } finally {
      rmSync(temporaryCommand, { force: true });
    }
    return cachedCommand;
  } catch {
    // Preserving the original command is safer than disabling an MCP server
    // when its background copy cannot be prepared.
    return command;
  }
}
