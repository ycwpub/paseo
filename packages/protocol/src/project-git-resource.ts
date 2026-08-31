import { z } from "zod";

export const PaseoGitRepositoryResourceSchema = z
  .object({
    type: z.literal("git-repository"),
    repository: z.string().trim().min(1),
    branch: z.string().trim().min(1).optional(),
    directory: z.string().trim().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .passthrough();

export type PaseoGitRepositoryResource = z.infer<typeof PaseoGitRepositoryResourceSchema>;

function repositoryPathname(repository: string): string {
  const trimmed = repository.trim().replace(/[\\/]+$/u, "");
  const scpStyle = /^[^/@\s]+@[^:\s]+:(.+)$/u.exec(trimmed);
  if (scpStyle) return scpStyle[1] ?? "";
  try {
    const url = new URL(trimmed);
    return url.pathname;
  } catch {
    return trimmed;
  }
}

export function inferGitRepositoryDirectoryName(repository: string): string {
  const pathname = repositoryPathname(repository);
  const basename = (pathname.replace(/\\/gu, "/").split("/").at(-1) ?? "").replace(/\.git$/iu, "");
  return basename.trim();
}

export function resolveGitRepositoryManagedPath(input: {
  repository: string;
  directory?: string;
}): string {
  const directory = input.directory?.trim() || inferGitRepositoryDirectoryName(input.repository);
  return directory ? `{{projectRoot}}/repos/${directory}` : "";
}
