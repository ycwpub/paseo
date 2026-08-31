import {
  BUILTIN_PROVIDER_ICON_NAMES,
  KNOWN_PROVIDER_ICON_NAMES,
} from "@getpaseo/protocol/provider-icon-names";
import { resolveAidenProviderIconAlias } from "@/components/aiden-provider-icon-aliases";

export type ProviderIconName =
  | { kind: "builtin"; id: string }
  | { kind: "catalog"; id: string }
  | { kind: "bot" };

const BUILTIN_PROVIDER_IDS = new Set(BUILTIN_PROVIDER_ICON_NAMES);
const KNOWN_PROVIDER_IDS = new Set(KNOWN_PROVIDER_ICON_NAMES);

export function resolveProviderIconName(provider: string): ProviderIconName {
  const aidenIconAlias = resolveAidenProviderIconAlias(provider);
  if (aidenIconAlias) {
    return { kind: "builtin", id: aidenIconAlias };
  }
  if (BUILTIN_PROVIDER_IDS.has(provider)) {
    return { kind: "builtin", id: provider };
  }
  if (KNOWN_PROVIDER_IDS.has(provider)) {
    return { kind: "catalog", id: provider };
  }
  return { kind: "bot" };
}
