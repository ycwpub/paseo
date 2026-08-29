import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";

export function memoryStoragePaths(detail: PaseoMemoryDetail): string[] {
  const paths = [detail.path, ...(detail.scopeDocuments ?? []).map((document) => document.path)];
  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
}
