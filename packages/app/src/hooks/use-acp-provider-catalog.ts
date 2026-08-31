import { useCallback, useState } from "react";
import type { MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";
import { ACP_PROVIDER_CATALOG, type AcpProviderCatalogEntry } from "@/data/acp-provider-catalog";
import {
  AIDEN_ACP_PROVIDER_CATALOG,
  type AidenAcpProviderCatalogEntry,
} from "@/data/aiden-acp-provider-catalog";

export type AcpProviderCatalogItem = AcpProviderCatalogEntry | AidenAcpProviderCatalogEntry;

const PROVIDER_CATALOG: readonly AcpProviderCatalogItem[] = [
  ...AIDEN_ACP_PROVIDER_CATALOG,
  ...ACP_PROVIDER_CATALOG,
];

export function getAcpProviderCatalog(): readonly AcpProviderCatalogItem[] {
  return PROVIDER_CATALOG;
}

export function buildAcpProviderConfigPatch(
  entry: AcpProviderCatalogItem,
): MutableDaemonConfigPatch {
  return {
    providers: {
      [entry.id]: {
        extends: "extends" in entry ? entry.extends : "acp",
        label: entry.title,
        description: entry.description,
        command: [...entry.command],
        env: entry.env ? { ...entry.env } : {},
        ...(entry.params ? { params: { ...entry.params } } : {}),
      },
    },
  };
}

export function useAcpProviderCatalog() {
  const [entries] = useState<readonly AcpProviderCatalogItem[]>(PROVIDER_CATALOG);

  const refetch = useCallback(async () => entries, [entries]);

  return { entries, loading: false, error: null, refetch };
}
