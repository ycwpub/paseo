import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { FileHtmlPreview } from "@/file-pane/html-preview";

export interface PluginAppHtmlPreview {
  html: string;
  htmlPath: string;
}

export function PluginAppHtmlPreviewModal({
  visible,
  preview,
  error,
  onClose,
}: {
  visible: boolean;
  preview: PluginAppHtmlPreview | null;
  error: string | null;
  onClose: () => void;
}) {
  const header = useMemo(
    () => ({
      title: "浏览器预览",
      subtitle: preview?.htmlPath ?? "正在生成 HTML 预览…",
    }),
    [preview?.htmlPath],
  );
  return (
    <AdaptiveModalSheet
      visible={visible}
      header={header}
      onClose={onClose}
      desktopMaxWidth={1180}
      scrollable={false}
      testID="plugin-app-html-preview-modal"
    >
      <View style={styles.container}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {preview ? (
          <View style={styles.preview}>
            <FileHtmlPreview html={preview.html} testID="plugin-app-html-preview" />
          </View>
        ) : null}
        {!preview && !error ? <Text style={styles.hint}>正在读取已保存的 HTML 文件…</Text> : null}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 560,
    gap: theme.spacing[3],
  },
  preview: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "#ffffff",
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
