const DEFAULT_WORKFLOW_PATH = "/absolute/path/workflow.json";
const DEFAULT_INPUT_PAYLOAD = '{"project":"paseo","filePath":"/absolute/path/input.txt"}';

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export interface WorkflowUsageExamples {
  cli: string;
  cliNode: string;
  cliBackground: string;
  agentTool: string;
  agentToolNode: string;
  server: string;
  serverNode: string;
}

export function buildWorkflowUsageExamples(scriptPath?: string | null): WorkflowUsageExamples {
  const resolvedPath = scriptPath?.trim() || DEFAULT_WORKFLOW_PATH;
  const quotedPath = quoteShellArgument(resolvedPath);
  const quotedPayload = quoteShellArgument(DEFAULT_INPUT_PAYLOAD);
  return {
    cli: `paseo workflow run ${quotedPath} ${quotedPayload}`,
    cliNode: `paseo workflow run ${quotedPath} ${quotedPayload} --node worker`,
    cliBackground: `paseo workflow run ${quotedPath} ${quotedPayload} --background`,
    agentTool: JSON.stringify(
      {
        scriptPath: resolvedPath,
        inputPayload: DEFAULT_INPUT_PAYLOAD,
        background: false,
      },
      null,
      2,
    ),
    agentToolNode: JSON.stringify(
      {
        scriptPath: resolvedPath,
        inputPayload: DEFAULT_INPUT_PAYLOAD,
        targetNodeId: "worker",
        background: false,
      },
      null,
      2,
    ),
    server: [
      "const run = await workflowService.runScriptAndWait({",
      `  scriptPath: ${JSON.stringify(resolvedPath)},`,
      `  inputPayload: ${JSON.stringify(DEFAULT_INPUT_PAYLOAD)},`,
      "});",
    ].join("\n"),
    serverNode: [
      "const run = await workflowService.runScriptAndWait({",
      `  scriptPath: ${JSON.stringify(resolvedPath)},`,
      `  inputPayload: ${JSON.stringify(DEFAULT_INPUT_PAYLOAD)},`,
      '  targetNodeId: "worker",',
      "});",
    ].join("\n"),
  };
}
