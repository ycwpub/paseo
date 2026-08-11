export interface WorkflowProcessOutputSection {
  stream: "stdout" | "stderr";
  value: string;
}

export interface LegacyWorkflowAgentOutput {
  prompt: string | null;
  response: string | null;
  fallback: string | null;
}

export function parseLegacyWorkflowAgentOutput(value: string): LegacyWorkflowAgentOutput {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  const separatorIndex = normalized.lastIndexOf("\n\n");
  if (separatorIndex === -1) {
    return { prompt: null, response: null, fallback: normalized || null };
  }

  const timeline = normalized.slice(0, separatorIndex).trimEnd();
  const finalResponse = normalized.slice(separatorIndex + 2).trim();
  if (!finalResponse || !timeline.endsWith(finalResponse)) {
    return { prompt: null, response: null, fallback: normalized || null };
  }

  const prompt = timeline
    .slice(0, timeline.length - finalResponse.length)
    .trimEnd()
    .replace(/^\[User\]\s*/, "");
  return {
    prompt: prompt || null,
    response: finalResponse,
    fallback: null,
  };
}

export function parseWorkflowProcessOutput(value: string): WorkflowProcessOutputSection[] {
  const stdoutPrefix = "stdout:\n";
  const stderrPrefix = "stderr:\n";
  if (value.startsWith(stdoutPrefix)) {
    const stderrIndex = value.indexOf(`\n\n${stderrPrefix}`);
    if (stderrIndex !== -1) {
      return [
        { stream: "stdout", value: value.slice(stdoutPrefix.length, stderrIndex) },
        {
          stream: "stderr",
          value: value.slice(stderrIndex + 2 + stderrPrefix.length),
        },
      ];
    }
    return [{ stream: "stdout", value: value.slice(stdoutPrefix.length) }];
  }
  if (value.startsWith(stderrPrefix)) {
    return [{ stream: "stderr", value: value.slice(stderrPrefix.length) }];
  }
  return [{ stream: "stdout", value }];
}
