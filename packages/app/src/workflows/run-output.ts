export interface WorkflowProcessOutputSection {
  stream: "stdout" | "stderr";
  value: string;
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
