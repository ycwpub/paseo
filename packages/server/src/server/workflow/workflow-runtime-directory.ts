import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface WorkflowRuntimeDirectories {
  runDir: string;
  artifactDir: string;
}

export async function createWorkflowRuntimeDirectories(
  root: string,
  runId: string,
): Promise<WorkflowRuntimeDirectories> {
  const runDir = join(root, runId);
  const artifactDir = join(runDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  return { runDir, artifactDir };
}
