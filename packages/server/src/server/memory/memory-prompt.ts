const MEMORY_OPEN = "<paseo-memory>";
const MEMORY_CLOSE = "</paseo-memory>";

export function stripMemoryFromPromptText(value: string): string {
  if (!value.startsWith(`${MEMORY_OPEN}\n`)) {
    return value;
  }
  const closeIndex = value.indexOf(`\n${MEMORY_CLOSE}`);
  if (closeIndex < 0) {
    return value;
  }
  return value.slice(closeIndex + MEMORY_CLOSE.length + 1).trimStart();
}
