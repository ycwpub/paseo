import { resolveAdditionalWritableDirectories } from "../../project-directory-access.js";
import { normalizeReadOnlyProjectDirectories } from "../../project-reference-directory-access.js";
import type { ClaudeProviderOptions } from "./options.js";

function mergePaths(
  existing: readonly string[] | undefined,
  added: readonly string[],
): string[] | undefined {
  const merged = [...new Set([...(existing ?? []), ...added])];
  return merged.length > 0 ? merged : undefined;
}

export function applyClaudeProjectDirectoryAccess(input: {
  options: ClaudeProviderOptions;
  cwd: string;
  writableDirectories: readonly string[] | undefined;
  readOnlyDirectories: readonly string[] | undefined;
}): ClaudeProviderOptions {
  const readOnlyDirectories = normalizeReadOnlyProjectDirectories(input.readOnlyDirectories);
  const additionalDirectories = resolveAdditionalWritableDirectories({
    cwd: input.cwd,
    projectDirectories: [...(input.writableDirectories ?? []), ...readOnlyDirectories],
    configuredDirectories: input.options.additionalDirectories,
  });
  if (readOnlyDirectories.length === 0) {
    return {
      ...input.options,
      ...(additionalDirectories.length > 0 ? { additionalDirectories } : {}),
    };
  }

  return {
    ...input.options,
    additionalDirectories,
    sandbox: {
      ...input.options.sandbox,
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        ...input.options.sandbox?.filesystem,
        disabled: false,
        denyWrite: mergePaths(input.options.sandbox?.filesystem?.denyWrite, readOnlyDirectories),
      },
    },
  };
}
