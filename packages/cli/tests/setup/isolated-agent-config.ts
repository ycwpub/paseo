import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
const isolatedClaudeConfigDir = mkdtempSync(join(tmpdir(), "paseo-cli-test-claude-"));

process.env.CLAUDE_CONFIG_DIR = isolatedClaudeConfigDir;

afterAll(() => {
  rmSync(isolatedClaudeConfigDir, { recursive: true, force: true });
  if (previousClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir;
  }
});
