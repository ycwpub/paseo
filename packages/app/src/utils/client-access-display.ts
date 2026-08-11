import type { DaemonClientAccessEntry } from "@getpaseo/protocol/messages";

export type ClientPlatformKind = "mac" | "android" | "cli" | "browser";

export function resolveClientPlatformKind(
  entry: Pick<DaemonClientAccessEntry, "clientName" | "clientType">,
): ClientPlatformKind {
  if (entry.clientType === "cli" || entry.clientType === "mcp") return "cli";
  if (entry.clientType === "browser") return "browser";

  const name = entry.clientName?.trim().toLowerCase() ?? "";
  if (name.startsWith("paseo desktop")) return "mac";
  if (name.startsWith("paseo web")) return "browser";
  // COMPAT(clientName): older web clients sent clientType=mobile without a
  // clientName. Native Paseo clients identify themselves explicitly.
  if (!name) return "browser";
  return "android";
}

export function resolveBrowserClientDescription(
  entry: Pick<DaemonClientAccessEntry, "clientName" | "clientType">,
): string | null {
  if (resolveClientPlatformKind(entry) !== "browser") return null;
  const name = entry.clientName?.trim() ?? "";
  const match = /^Paseo Web\s*·\s*(.+)$/iu.exec(name);
  return match?.[1]?.trim() || null;
}
