import { isIPv4 } from "node:net";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import type { PluginHttpLocalAddress } from "@getpaseo/protocol/messages";

type NetworkInterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

function isIpv4Entry(entry: NetworkInterfaceInfo): boolean {
  return entry.family === "IPv4";
}

function isUsableIpv4Address(address: string): boolean {
  if (!isIPv4(address) || address === "0.0.0.0" || address === "255.255.255.255") {
    return false;
  }
  const firstOctet = Number(address.split(".", 1)[0]);
  return firstOctet > 0 && firstOctet < 224;
}

function addressRank(address: string): number {
  if (address.startsWith("10.")) return 0;
  if (/^172\.(1[6-9]|2\d|3[01])\./u.test(address)) return 1;
  if (address.startsWith("192.168.")) return 2;
  if (address.startsWith("169.254.")) return 4;
  return 3;
}

export function listLocalHttpAddresses(
  interfaces: NetworkInterfaceMap = networkInterfaces(),
): PluginHttpLocalAddress[] {
  const result: PluginHttpLocalAddress[] = [
    {
      address: "127.0.0.1",
      interfaceName: null,
      kind: "loopback",
    },
  ];
  const seen = new Set(["127.0.0.1"]);
  const networkAddresses: PluginHttpLocalAddress[] = [];

  for (const interfaceName of Object.keys(interfaces).sort()) {
    for (const entry of interfaces[interfaceName] ?? []) {
      if (!isIpv4Entry(entry) || entry.internal || !isUsableIpv4Address(entry.address)) {
        continue;
      }
      if (seen.has(entry.address)) continue;
      seen.add(entry.address);
      networkAddresses.push({
        address: entry.address,
        interfaceName,
        kind: "network",
      });
    }
  }

  networkAddresses.sort(
    (left, right) =>
      addressRank(left.address) - addressRank(right.address) ||
      (left.interfaceName ?? "").localeCompare(right.interfaceName ?? "") ||
      left.address.localeCompare(right.address),
  );
  return [...result, ...networkAddresses];
}

export function normalizeLocalHttpHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost" ? "127.0.0.1" : normalized;
}

export function isLocalHttpHost(
  host: string,
  addresses: readonly PluginHttpLocalAddress[] = listLocalHttpAddresses(),
): boolean {
  const normalized = normalizeLocalHttpHost(host);
  if (isIPv4(normalized) && normalized.startsWith("127.")) return true;
  return addresses.some((candidate) => candidate.address === normalized);
}

export function assertLocalHttpHost(
  host: string,
  addresses: readonly PluginHttpLocalAddress[] = listLocalHttpAddresses(),
): void {
  if (isLocalHttpHost(host, addresses)) return;
  throw new Error(
    `监听地址 ${host} 不是当前 Host 的本机 IP。请选择 127.0.0.1 或当前网卡地址，不能使用 0.0.0.0、主机名或外部 IP。`,
  );
}
