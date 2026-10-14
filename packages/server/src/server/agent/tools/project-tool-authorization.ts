import type {
  AuthorizeProjectCallInput,
  ProjectCallAuthorizer,
} from "../../project-call-permissions/project-call-authorizer.js";

export interface ExecuteProjectAuthorizedToolInput<T> {
  toolName: string;
  workspaceId: string;
  agentId: string;
  authorize: Pick<ProjectCallAuthorizer, "authorize">["authorize"];
  execute: () => Promise<T>;
}

export async function executeProjectAuthorizedTool<T>(
  input: ExecuteProjectAuthorizedToolInput<T>,
): Promise<T> {
  const request: AuthorizeProjectCallInput = {
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    source: "agent_mcp",
    request: {
      kind: "rpc",
      target: `mcp:paseo/${input.toolName}`,
    },
  };
  await input.authorize(request);
  return input.execute();
}
