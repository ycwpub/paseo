import { useMemo } from "react";
import type { HostProjectListItem } from "@/projects/host-project-model";
import { getHostProjectSourceDirectory } from "@/projects/host-projects";
import { projectLarkDocumentLinks } from "@/projects/lark-documents/model";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

export function useByteDevelopmentProjectContext(input: {
  active: boolean;
  serverId: string;
  project: HostProjectListItem | null;
}) {
  const client = useHostRuntimeClient(input.serverId);
  const connected = useHostRuntimeIsConnected(input.serverId);
  const repositoryPath = input.project
    ? getHostProjectSourceDirectory(input.project, input.serverId)
    : null;
  const queryKey = useMemo(
    () => ["byte-development-project-config", input.serverId, repositoryPath] as const,
    [input.serverId, repositoryPath],
  );
  const query = useFetchQuery({
    queryKey,
    enabled: input.active && connected && Boolean(client && repositoryPath),
    dataShape: "value",
    queryFn: async () => {
      if (!client || !repositoryPath) throw new Error("Project 没有关联代码目录");
      const result = await client.readProjectConfig(repositoryPath);
      if (!result.ok) {
        throw new Error(`无法读取 Project 配置：${result.error.code}`);
      }
      return result.config ?? {};
    },
    retry: false,
    staleTimeMs: 5_000,
  });
  const larkDocumentLinks = useMemo(() => projectLarkDocumentLinks(query.data), [query.data]);
  return {
    repositoryPath,
    larkDocumentLinks,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
