import { isIP } from "node:net";
import type {
  AuthorizeProjectCallInput,
  ProjectCallAuthorizer,
} from "./project-call-authorizer.js";

export interface ProjectProxyConnectTarget {
  hostname: string;
  port: number;
  authorizationUrl: string;
}

export function parseProjectProxyConnectTarget(target: string): ProjectProxyConnectTarget {
  const trimmed = target.trim();
  const match = trimmed.startsWith("[")
    ? /^\[([^\]]+)\]:(\d+)$/u.exec(trimmed)
    : /^([^:/@?#\s]+):(\d+)$/u.exec(trimmed);
  if (!match) {
    throw new Error("Invalid Project proxy CONNECT target");
  }
  const port = Number(match[2]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Invalid Project proxy CONNECT target");
  }
  const hostname = match[1]!.toLowerCase();
  const formattedHostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  const url = new URL(`https://${formattedHostname}:${port}/`);
  return {
    hostname,
    port,
    authorizationUrl: url.toString(),
  };
}

export async function authorizeProjectProxyTarget(input: {
  workspaceId?: string;
  projectId?: string;
  source: string;
  method: string;
  target: string;
  authorize: Pick<ProjectCallAuthorizer, "authorize">["authorize"];
}): Promise<void> {
  const method = input.method.trim().toUpperCase();
  const url =
    method === "CONNECT"
      ? parseProjectProxyConnectTarget(input.target).authorizationUrl
      : new URL(input.target).toString();
  const authorizationInput: AuthorizeProjectCallInput = {
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    source: input.source,
    request: { kind: "http", url, method },
  };
  await input.authorize(authorizationInput);
}

const RESTRICTED_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 0x00ffffff],
  [0x0a000000, 0x0affffff],
  [0x64400000, 0x647fffff],
  [0x7f000000, 0x7fffffff],
  [0xa9fe0000, 0xa9feffff],
  [0xac100000, 0xac1fffff],
  [0xc0000000, 0xc00000ff],
  [0xc0000200, 0xc00002ff],
  [0xc0a80000, 0xc0a8ffff],
  [0xc6120000, 0xc613ffff],
  [0xc6336400, 0xc63364ff],
  [0xcb007100, 0xcb0071ff],
  [0xe0000000, 0xffffffff],
];

function isRestrictedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c, d] = octets as [number, number, number, number];
  const numeric = (a * 0x1000000 + b * 0x10000 + c * 0x100 + d) >>> 0;
  return RESTRICTED_IPV4_RANGES.some(([start, end]) => numeric >= start && numeric <= end);
}

export function isRestrictedProjectProxyAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const family = isIP(normalized);
  if (family === 4) return isRestrictedIpv4(normalized);
  if (family !== 6) return true;
  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized);
  if (mappedIpv4) return isRestrictedIpv4(mappedIpv4[1]!);
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("2001:db8:")) return true;
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    (firstGroup & 0xfe00) === 0xfc00 ||
    (firstGroup & 0xffc0) === 0xfe80 ||
    (firstGroup & 0xff00) === 0xff00
  );
}
