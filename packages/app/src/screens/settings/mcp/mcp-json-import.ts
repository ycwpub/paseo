import type { McpTransport } from "@getpaseo/protocol/messages";

export type McpJsonImportErrorKey =
  | "format"
  | "bare-server"
  | "url-required"
  | "stdio-command-required";

export interface ParsedMcpJsonServer {
  name: string;
  description: string;
  transport: McpTransport;
  originalConfig: Record<string, unknown>;
}

export type McpJsonImportResult =
  | {
      isValid: true;
      servers: ParsedMcpJsonServer[];
    }
  | {
      isValid: false;
      errorKey: McpJsonImportErrorKey;
    };

const IMPORTED_DESCRIPTION = "Imported from JSON";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const nonEmptyString = (value: unknown): string | undefined => {
  const text = stringOrUndefined(value);
  return text?.trim() ? text : undefined;
};

const toStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
};

const normalizeArgs = (value: unknown): string[] | undefined => {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  return undefined;
};

const looksLikeBareServer = (value: Record<string, unknown>): boolean =>
  ["command", "args", "env", "url", "headers", "type", "transport", "description"].some((key) =>
    hasOwn(value, key),
  );

const normalizeArrayServer = (
  serverItem: unknown,
):
  | { isValid: true; name: string; config: Record<string, unknown> }
  | { isValid: false; errorKey: McpJsonImportErrorKey } => {
  if (!isRecord(serverItem)) {
    return { isValid: false, errorKey: "format" };
  }

  const name = nonEmptyString(serverItem.name);
  if (!name) {
    return { isValid: false, errorKey: "format" };
  }

  const { name: _name, ...config } = serverItem;
  return { isValid: true, name, config };
};

const parseTransport = (
  config: Record<string, unknown>,
):
  | { isValid: true; transport: McpTransport }
  | { isValid: false; errorKey: McpJsonImportErrorKey } => {
  const transportObject = isRecord(config.transport) ? config.transport : undefined;
  const transportConfig = transportObject ?? config;
  const typeFromTransport = transportObject?.type ?? config.transport;
  const transportType = stringOrUndefined(config.type ?? typeFromTransport);

  if (hasOwn(transportConfig, "command") || transportType === "stdio") {
    const command = nonEmptyString(transportConfig.command);
    if (!command) {
      return { isValid: false, errorKey: "stdio-command-required" };
    }

    const args = normalizeArgs(transportConfig.args);
    if (!args) {
      return { isValid: false, errorKey: "format" };
    }

    return {
      isValid: true,
      transport: {
        type: "stdio",
        command,
        args,
        env: toStringRecord(transportConfig.env) ?? {},
      },
    };
  }

  const url = nonEmptyString(transportConfig.url ?? config.url);
  if (!url) {
    return { isValid: false, errorKey: "url-required" };
  }

  const normalizedType = transportType === "sse" || url.includes("/sse") ? "sse" : "http";
  return {
    isValid: true,
    transport: {
      type: normalizedType,
      url,
      headers: toStringRecord(transportConfig.headers ?? config.headers),
    },
  };
};

const parseServer = (
  name: string,
  config: Record<string, unknown>,
):
  | { isValid: true; server: ParsedMcpJsonServer }
  | { isValid: false; errorKey: McpJsonImportErrorKey } => {
  const transportResult = parseTransport(config);
  if (transportResult.isValid === false) return transportResult;

  return {
    isValid: true,
    server: {
      name,
      description: stringOrUndefined(config.description) || IMPORTED_DESCRIPTION,
      transport: transportResult.transport,
      originalConfig: config,
    },
  };
};

export const parseMcpJsonImport = (config: unknown): McpJsonImportResult => {
  const rawServers = isRecord(config) && hasOwn(config, "mcpServers") ? config.mcpServers : config;

  if (Array.isArray(rawServers)) {
    const servers: ParsedMcpJsonServer[] = [];
    for (const rawServer of rawServers) {
      const normalized = normalizeArrayServer(rawServer);
      if (normalized.isValid === false) return normalized;

      const parsed = parseServer(normalized.name, normalized.config);
      if (parsed.isValid === false) return parsed;

      servers.push(parsed.server);
    }

    return servers.length > 0 ? { isValid: true, servers } : { isValid: false, errorKey: "format" };
  }

  if (!isRecord(rawServers)) {
    return { isValid: false, errorKey: "format" };
  }

  if (rawServers === config && looksLikeBareServer(rawServers)) {
    return { isValid: false, errorKey: "bare-server" };
  }

  const servers: ParsedMcpJsonServer[] = [];
  for (const [name, serverConfig] of Object.entries(rawServers)) {
    if (!name.trim() || !isRecord(serverConfig)) {
      return { isValid: false, errorKey: "format" };
    }

    const parsed = parseServer(name, serverConfig);
    if (parsed.isValid === false) return parsed;

    servers.push(parsed.server);
  }

  return servers.length > 0 ? { isValid: true, servers } : { isValid: false, errorKey: "format" };
};

const SPLITTABLE_STDIO_LAUNCHERS = new Set([
  "npx",
  "pnpx",
  "bunx",
  "uvx",
  "uv",
  "node",
  "python",
  "python3",
  "deno",
]);

function shellSplit(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (char === "\\" && quote === '"' && index + 1 < input.length) {
        current += input[index + 1];
        index += 1;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "\\" && index + 1 < input.length) {
      current += input[index + 1];
      index += 1;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function normalizeStdioTransport(transport: McpTransport): McpTransport {
  if (transport.type !== "stdio") return transport;
  const trimmed = transport.command.trim();
  if (trimmed.length === 0 || (transport.args?.length ?? 0) > 0) return transport;

  const firstToken = trimmed.split(/\s+/)[0]?.replace(/^['"]|['"]$/g, "");
  if (!firstToken || !SPLITTABLE_STDIO_LAUNCHERS.has(firstToken) || !/\s/.test(trimmed)) {
    return transport;
  }

  const tokens = shellSplit(trimmed);
  if (tokens.length < 2 || !tokens[0]) return transport;

  return {
    ...transport,
    command: tokens[0],
    args: tokens.slice(1),
  };
}

export function buildMcpOriginalJson(
  name: string,
  description: string | undefined,
  transport: McpTransport,
): string {
  const transportConfig =
    transport.type === "stdio"
      ? {
          command: transport.command,
          args: transport.args ?? [],
          env: transport.env ?? {},
        }
      : {
          type: transport.type,
          url: transport.url,
          ...(transport.headers ? { headers: transport.headers } : {}),
        };

  return JSON.stringify(
    {
      mcpServers: {
        [name]: {
          ...(description ? { description } : {}),
          ...transportConfig,
        },
      },
    },
    null,
    2,
  );
}

export function getMcpJsonImportErrorMessage(errorKey: McpJsonImportErrorKey): string {
  switch (errorKey) {
    case "bare-server":
      return "Wrap the server config in a top-level mcpServers object.";
    case "url-required":
      return "HTTP and SSE MCP servers require a URL.";
    case "stdio-command-required":
      return "stdio MCP servers require a command.";
    case "format":
    default:
      return "Enter valid MCP JSON.";
  }
}
