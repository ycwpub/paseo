import { useCallback, useEffect, useMemo, useState } from "react";
import type { PluginAppDefaultAgent } from "@getpaseo/protocol/messages";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { PluginProjectDefaultAgentValue } from "./plugin-project-default-agent-field";

const EMPTY_DEFAULT_AGENT: PluginProjectDefaultAgentValue = {
  provider: "",
  model: "",
};

export function usePluginProjectDefaultAgent({
  active,
  supported,
  serverId,
  pluginId,
  appId,
  projectId,
}: {
  active: boolean;
  supported: boolean;
  serverId: string;
  pluginId: string | null | undefined;
  appId: string;
  projectId: string | null;
}) {
  const client = useHostRuntimeClient(serverId);
  const [loadedConfiguration, setLoadedConfiguration] = useState<{
    projectId: string;
    defaultAgent: PluginAppDefaultAgent | null;
  } | null>(null);
  const [value, setValue] = useState<PluginProjectDefaultAgentValue>(EMPTY_DEFAULT_AGENT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !supported || !client || !pluginId || !projectId) {
      setLoadedConfiguration(null);
      setValue(EMPTY_DEFAULT_AGENT);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadedConfiguration(null);
    setValue(EMPTY_DEFAULT_AGENT);
    setError(null);
    void (async () => {
      try {
        const result = await client.getPluginApp(pluginId, appId, projectId);
        if (cancelled) return;
        if (result.error || !result.app) {
          throw new Error(result.error ?? "读取插件项目配置失败");
        }
        setLoadedConfiguration({
          projectId,
          defaultAgent: result.app.defaultAgent,
        });
        setValue(result.app.defaultAgent ?? EMPTY_DEFAULT_AGENT);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, appId, client, pluginId, projectId, supported]);

  const configured =
    loadedConfiguration?.projectId === projectId ? loadedConfiguration.defaultAgent : null;
  const complete = Boolean(value.provider.trim() && value.model.trim());
  const changed =
    configured?.provider !== value.provider.trim() || configured?.model !== value.model.trim();

  const change = useCallback((nextValue: PluginProjectDefaultAgentValue) => {
    setValue(nextValue);
    setError(null);
  }, []);

  const save = useCallback(() => {
    if (!client || !pluginId || !projectId) {
      setError("Host 未连接或插件不可用");
      return;
    }
    const provider = value.provider.trim();
    const model = value.model.trim();
    if (!provider || !model) {
      setError("请选择默认 Provider 和模型");
      return;
    }
    setSaving(true);
    setError(null);
    void (async () => {
      try {
        const result = await client.configurePluginApp({
          pluginId,
          appId,
          projectId,
          defaultAgent: { provider, model },
        });
        if (result.error || !result.app?.defaultAgent) {
          throw new Error(result.error ?? "保存插件项目失败");
        }
        setLoadedConfiguration({
          projectId,
          defaultAgent: result.app.defaultAgent,
        });
        setValue(result.app.defaultAgent);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        setSaving(false);
      }
    })();
  }, [appId, client, pluginId, projectId, value]);

  return useMemo(
    () => ({
      value,
      configured,
      complete,
      changed,
      loading,
      saving,
      error,
      change,
      save,
    }),
    [change, changed, complete, configured, error, loading, save, saving, value],
  );
}
