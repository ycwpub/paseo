export type PluginAppResultPresentation =
  | { kind: "empty"; text: string }
  | { kind: "scalar"; text: string }
  | { kind: "json"; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function businessResult(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const data = Object.hasOwn(value, "data") ? value.data : value;
  if (!isRecord(data)) return data;

  for (const key of ["answer", "result", "value", "output", "message"]) {
    if (Object.hasOwn(data, key)) return data[key];
  }

  const entries = Object.entries(data);
  return entries.length === 1 ? entries[0]?.[1] : data;
}

export function presentPluginAppResult(value: unknown): PluginAppResultPresentation {
  const result = businessResult(value);
  if (result === undefined || result === null || result === "") {
    return { kind: "empty", text: "暂无结果" };
  }
  if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
    return { kind: "scalar", text: String(result) };
  }
  try {
    return { kind: "json", text: JSON.stringify(result, null, 2) };
  } catch {
    return { kind: "scalar", text: String(result) };
  }
}
