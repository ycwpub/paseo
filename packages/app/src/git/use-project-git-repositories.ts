import { useMemo } from "react";
import { useFetchQueries, useFetchQuery } from "@/data/query";
import { fetchCheckoutStatus, type CheckoutStatusPayload } from "@/git/checkout-status-cache";
import { checkoutStatusQueryKey } from "@/git/query-keys";
import {
  resolveProjectGitRepositoryCandidates,
  type ProjectGitRepositoryCandidate,
} from "@/git/project-git-repositories";
import { CHECKOUT_STATUS_STALE_TIME } from "@/git/use-status-query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useWorkspace } from "@/stores/session-store-hooks";

export interface ProjectGitRepository extends ProjectGitRepositoryCandidate {
  status: CheckoutStatusPayload;
}

export function useProjectGitRepositories(input: {
  serverId: string;
  workspaceId: string;
  additionalRoots?: readonly (string | null | undefined)[];
}) {
  const workspace = useWorkspace(input.serverId, input.workspaceId);
  const client = useHostRuntimeClient(input.serverId);
  const isConnected = useHostRuntimeIsConnected(input.serverId);
  const projectConfigQuery = useFetchQuery({
    queryKey: [
      "project-git-repositories-config",
      input.serverId,
      workspace?.projectId,
      workspace?.projectRootPath,
    ],
    enabled: Boolean(client && workspace),
    dataShape: "value",
    queryFn: async () => {
      if (!client || !workspace) return null;
      const result = await client.readProjectConfig(
        workspace.projectRootPath,
        undefined,
        workspace.projectId,
      );
      return result.ok ? (result.config?.project ?? null) : null;
    },
    retry: false,
    staleTimeMs: 30_000,
  });
  const candidates = useMemo(
    () =>
      workspace
        ? resolveProjectGitRepositoryCandidates({
            workspace,
            projectConfig: projectConfigQuery.data,
            additionalRoots: input.additionalRoots,
          })
        : [],
    [input.additionalRoots, projectConfigQuery.data, workspace],
  );
  const statusQueries = useFetchQueries(
    candidates.map((candidate) => ({
      queryKey: checkoutStatusQueryKey(input.serverId, candidate.root),
      queryFn: async () => {
        if (!client) throw new Error("守护进程客户端不可用");
        return await fetchCheckoutStatus({
          client,
          serverId: input.serverId,
          cwd: candidate.root,
        });
      },
      enabled: Boolean(client && isConnected),
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      dataShape: "value" as const,
      staleTimeMs: CHECKOUT_STATUS_STALE_TIME,
    })),
  );
  const repositories = useMemo(
    () =>
      candidates.flatMap((candidate, index) => {
        const status = statusQueries[index]?.data;
        return status?.isGit ? [{ ...candidate, status }] : [];
      }),
    [candidates, statusQueries],
  );
  const isLoading =
    Boolean(workspace) &&
    (projectConfigQuery.isLoading || statusQueries.some((query) => query.isLoading));
  const isFetching =
    projectConfigQuery.isFetching || statusQueries.some((query) => query.isFetching);

  return {
    repositories,
    candidates,
    isLoading,
    isFetching,
    projectConfigError: projectConfigQuery.error,
  };
}
