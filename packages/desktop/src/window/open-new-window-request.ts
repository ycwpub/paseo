export interface OpenNewWindowRequest {
  pendingOpenProjectPath: string | null;
  initialRoute: string | null;
}

function readStringProperty(input: object, key: string): string | null {
  if (!(key in input)) {
    return null;
  }
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() || null : null;
}

function normalizeInitialRoute(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  return value;
}

export function parseOpenNewWindowRequest(options: unknown): OpenNewWindowRequest {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return { pendingOpenProjectPath: null, initialRoute: null };
  }
  return {
    pendingOpenProjectPath: readStringProperty(options, "pendingOpenProjectPath"),
    initialRoute: normalizeInitialRoute(readStringProperty(options, "initialRoute")),
  };
}
