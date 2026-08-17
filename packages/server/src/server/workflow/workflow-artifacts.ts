import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkflowArtifact } from "@getpaseo/protocol/workflow/data-contract";

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".csv": "text/csv",
  ".html": "text/html",
  ".json": "application/json",
  ".log": "text/plain",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

export async function discoverNewWorkflowArtifacts(
  artifactDir: string,
  existing: readonly WorkflowArtifact[],
): Promise<WorkflowArtifact[]> {
  const knownUris = new Set(existing.map((artifact) => artifact.uri));
  const paths = await discoverFiles(artifactDir);
  const artifacts = await Promise.all(
    paths.map(async (path) => {
      const fileStat = await stat(path);
      const uri = pathToFileURL(path).href;
      const artifact: WorkflowArtifact = {
        name: relative(artifactDir, path).split(sep).join("/"),
        uri,
        size: fileStat.size,
      };
      const mediaType = MEDIA_TYPES[extname(path).toLowerCase()];
      if (mediaType) {
        artifact.mediaType = mediaType;
      }
      return artifact;
    }),
  );
  return artifacts.filter((artifact) => !knownUris.has(artifact.uri));
}

async function discoverFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.toSorted();
}
