import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Save } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { ProjectKnowledgeEditor } from "@/projects/knowledge/editor";
import type { ProjectKnowledgeDraft } from "@/projects/knowledge/model";
import {
  hostKnowledgeDraftError,
  hostKnowledgeDraftToConfig,
  hostKnowledgeToDraft,
} from "./host-knowledge-model";

const HOST_KNOWLEDGE_SECTIONS = ["general", "standards"] as const;

function HostKnowledgeForm({
  initialValue,
  patchConfig,
  serverId,
}: {
  initialValue: ProjectKnowledgeDraft;
  patchConfig: (patch: MutableDaemonConfigPatch) => Promise<unknown>;
  serverId: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validationError = useMemo(() => hostKnowledgeDraftError(value), [value]);
  const cloudCacheTarget = useMemo(() => ({ serverId, scope: "global" as const }), [serverId]);
  const handleChange = useCallback((next: ProjectKnowledgeDraft) => {
    setValue(next);
    setDirty(true);
    setSaveError(null);
  }, []);
  const save = useCallback(() => {
    if (saving || validationError) return;
    setSaving(true);
    setSaveError(null);
    void patchConfig({ knowledge: hostKnowledgeDraftToConfig(value) })
      .then(() => setDirty(false))
      .catch((error: unknown) =>
        setSaveError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setSaving(false));
  }, [patchConfig, saving, validationError, value]);

  return (
    <View>
      <ProjectKnowledgeEditor
        value={value}
        error={validationError ?? saveError}
        onChange={handleChange}
        sections={HOST_KNOWLEDGE_SECTIONS}
        title="全局知识"
        info="全局知识对当前 Paseo 实例中的所有 Project 和 Agent 生效。相对路径从 Paseo 主目录解析。"
        testID="host-knowledge-group"
        cloudCacheTarget={cloudCacheTarget}
      />
      <View style={styles.footer}>
        <Button
          variant="default"
          leftIcon={Save}
          disabled={!dirty || Boolean(validationError)}
          loading={saving}
          onPress={save}
          testID="host-knowledge-save"
        >
          保存全局知识
        </Button>
      </View>
    </View>
  );
}

export function HostKnowledgeSection({ serverId }: { serverId: string }) {
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  const knowledgeKey = JSON.stringify(config?.knowledge ?? {});
  const initialValue = useMemo(() => hostKnowledgeToDraft(config?.knowledge), [config?.knowledge]);

  if (isLoading || !config) {
    return <Text style={styles.loading}>正在加载全局知识…</Text>;
  }
  return (
    <HostKnowledgeForm
      key={knowledgeKey}
      initialValue={initialValue}
      patchConfig={patchConfig}
      serverId={serverId}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    alignItems: "flex-end",
    marginTop: -theme.spacing[4],
    marginBottom: theme.spacing[8],
  },
  loading: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[4],
  },
}));
