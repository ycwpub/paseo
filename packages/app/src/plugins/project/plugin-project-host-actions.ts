import type { PluginAppDefaultAgent, PluginAppState } from "@getpaseo/protocol/messages";

interface PluginProjectConfigurationClient {
  configurePluginApp(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    defaultAgent: PluginAppDefaultAgent;
  }): Promise<{
    app: PluginAppState | null;
    error: string | null;
  }>;
}

export async function configurePluginProjectOnHost(input: {
  serverId: string;
  pluginId: string;
  appId: string;
  projectId: string;
  defaultAgent: PluginAppDefaultAgent;
  getClient: (serverId: string) => PluginProjectConfigurationClient | null;
}): Promise<PluginAppState> {
  const client = input.getClient(input.serverId);
  if (!client) throw new Error("所选主机未连接或插件不可用");
  const response = await client.configurePluginApp({
    pluginId: input.pluginId,
    appId: input.appId,
    projectId: input.projectId,
    defaultAgent: input.defaultAgent,
  });
  if (response.error || !response.app) {
    throw new Error(response.error ?? "保存插件项目失败");
  }
  return response.app;
}
