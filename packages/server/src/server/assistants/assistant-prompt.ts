import type { Assistant } from "@getpaseo/protocol/messages";

function resolveAssistantMemoryOverviewPath(assistant: Assistant): string {
  if (!assistant.memoryEnabled) {
    return "";
  }
  return assistant.memoryFiles.summaryPath.trim();
}

export function buildAssistantInitialPrompt(assistant: Assistant, userPrompt: string): string {
  const parts = [assistant.prompt.trim()];
  const overviewPath = resolveAssistantMemoryOverviewPath(assistant);
  if (overviewPath.length > 0) {
    parts.push(
      [
        "## Assistant memory",
        `Assistant memory overview path: ${overviewPath}`,
        "Read this overview only when the current request could benefit from prior Assistant memory. Then open only the referenced detail files needed for the task.",
      ].join("\n"),
    );
  }
  parts.push(userPrompt.trim());
  return parts.filter((part) => part.length > 0).join("\n\n---\n\n");
}
