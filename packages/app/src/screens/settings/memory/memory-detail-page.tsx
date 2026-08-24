import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { MemoryDetailEditor } from "./memory-detail-editor";
import type { MemoryDetailDraft } from "./memory-detail-draft";

export function MemoryDetailPage({
  detail,
  scopeEditable,
  disabled,
  onSave,
  onDelete,
}: {
  detail: PaseoMemoryDetail;
  scopeEditable: boolean;
  disabled: boolean;
  onSave: (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => Promise<void>;
  onDelete: (detail: PaseoMemoryDetail) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(detail.title);

  useEffect(() => {
    setTitle(detail.title);
  }, [detail.id, detail.title]);

  return (
    <SettingsSection title={title}>
      <View style={settingsStyles.card}>
        <View style={styles.editor}>
          <MemoryDetailEditor
            key={detail.id}
            detail={detail}
            disabled={disabled}
            scopeEditable={scopeEditable}
            onSave={onSave}
            onDelete={onDelete}
            onTitleChange={setTitle}
          />
        </View>
      </View>
      {scopeEditable ? (
        <Text style={settingsStyles.rowHint}>
          {t("memoryPolicies.contentManager.scopeEditHint")}
        </Text>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  editor: {
    padding: theme.spacing[4],
  },
}));
