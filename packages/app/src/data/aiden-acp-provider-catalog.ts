import { ACP_PROVIDER_ICON_SVGS } from "@/assets/acp-provider-icons";

export interface AidenAcpProviderCatalogEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  iconSvg: string | null;
  installLink?: string;
  extends: "claude" | "codex";
  command: readonly [string, ...string[]];
  env?: Readonly<Record<string, string>>;
  params?: Readonly<Record<string, unknown>>;
}

export const AIDEN_ACP_PROVIDER_CATALOG: readonly AidenAcpProviderCatalogEntry[] = [
  {
    id: "aiden-claude",
    title: "Aiden Claude",
    description: "Claude provided through Aiden.",
    version: "built-in",
    iconSvg: ACP_PROVIDER_ICON_SVGS["claude-acp"] ?? null,
    extends: "claude",
    command: ["aiden", "x", "claude"],
  },
  {
    id: "aiden-codex",
    title: "Aiden Codex",
    description: "Codex provided through Aiden.",
    version: "built-in",
    iconSvg: ACP_PROVIDER_ICON_SVGS["codex-acp"] ?? null,
    extends: "codex",
    command: ["aiden", "x", "codex"],
  },
];
