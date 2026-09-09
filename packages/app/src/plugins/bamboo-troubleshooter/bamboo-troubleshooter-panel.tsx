import {
  BAMBOO_TROUBLESHOOTER_APP_ID,
  BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
  BAMBOO_TROUBLESHOOTER_RUNTIME_DATA_KEY,
  BambooTroubleshooterConfigSchema,
  BambooTroubleshooterRuntimeSchema,
  type PluginAppDefinition,
  type PluginSummary,
} from "@getpaseo/protocol/messages";
import {
  AlertTroubleshooterPanel,
  type AlertTroubleshooterPanelSpec,
} from "@/plugins/alert-troubleshooter/alert-troubleshooter-panel";

export { BAMBOO_TROUBLESHOOTER_PLUGIN_ID };

const SPEC: AlertTroubleshooterPanelSpec = {
  pluginId: BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
  appId: BAMBOO_TROUBLESHOOTER_APP_ID,
  configDataKey: BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  runtimeDataKey: BAMBOO_TROUBLESHOOTER_RUNTIME_DATA_KEY,
  productName: "Bamboo",
  manualDebugSelector: "resultId",
  allowCustomBot: true,
  allowAgentAutoArchive: true,
  configSchema: BambooTroubleshooterConfigSchema,
  runtimeSchema: BambooTroubleshooterRuntimeSchema,
};

export function BambooTroubleshooterPanel(props: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  initialProjectId?: string;
}) {
  return <AlertTroubleshooterPanel {...props} spec={SPEC} />;
}
