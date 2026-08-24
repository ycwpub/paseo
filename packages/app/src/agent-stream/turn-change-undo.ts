import type { ParsedDiffFile } from "@/git/use-diff-query";

export function canUndoTurnChanges(input: {
  readOnly: boolean;
  files: readonly ParsedDiffFile[];
  uncommittedPaths: ReadonlySet<string>;
}): boolean {
  return (
    !input.readOnly &&
    input.files.length > 0 &&
    input.files.every((file) => input.uncommittedPaths.has(file.path))
  );
}

export function collectTurnChangeUndoPaths(files: readonly ParsedDiffFile[]): string[] {
  return Array.from(
    new Set(files.flatMap((file) => (file.oldPath ? [file.path, file.oldPath] : [file.path]))),
  );
}
