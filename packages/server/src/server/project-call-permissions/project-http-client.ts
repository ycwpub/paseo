import type {
  AuthorizeProjectCallInput,
  ProjectCallAuthorizer,
} from "./project-call-authorizer.js";

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface ProjectFetchInit extends RequestInit {
  workspaceId: string;
  agentId?: string;
  taskId?: string;
  source: string;
  authorize: Pick<ProjectCallAuthorizer, "authorize">["authorize"];
  fetchImplementation?: typeof fetch;
  maxRedirects?: number;
}

function redirectedMethod(status: number, method: string): string {
  if (status === 303) return "GET";
  if ((status === 301 || status === 302) && method === "POST") return "GET";
  return method;
}

export async function projectFetch(input: string | URL, init: ProjectFetchInit): Promise<Response> {
  const {
    workspaceId,
    agentId,
    taskId,
    source,
    authorize,
    fetchImplementation = fetch,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    ...requestInit
  } = init;
  let url = new URL(input);
  let method = (requestInit.method ?? "GET").toUpperCase();

  for (let redirectCount = 0; ; redirectCount += 1) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`不支持的 Project HTTP 协议：${url.protocol}`);
    }
    const authorizationInput: AuthorizeProjectCallInput = {
      workspaceId,
      ...(agentId ? { agentId } : {}),
      ...(taskId ? { taskId } : {}),
      source,
      request: { kind: "http", url: url.toString(), method },
    };
    await authorize(authorizationInput);

    const response = await fetchImplementation(url, {
      ...requestInit,
      method,
      redirect: "manual",
      ...(method === "GET" || method === "HEAD" ? { body: undefined } : {}),
    });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirectCount >= maxRedirects) {
      throw new Error(`Project HTTP 请求重定向超过 ${maxRedirects} 次`);
    }
    method = redirectedMethod(response.status, method);
    url = new URL(location, url);
  }
}
