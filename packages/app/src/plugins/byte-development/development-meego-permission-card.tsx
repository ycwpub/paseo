import { Text, View } from "react-native";
import { ExternalLink as ExternalLinkIcon, RefreshCw } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import type { DevelopmentMeegoActionRequired } from "./development-meego-auth-model";

export function DevelopmentMeegoPermissionCard({
  action,
  checking,
  onCheck,
}: {
  action: DevelopmentMeegoActionRequired;
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <ExternalLinkIcon size={17} color={styles.icon.color} />
        <Text style={styles.title}>需要申请 Meego 权限</Text>
      </View>
      <Text style={styles.message}>{action.message}</Text>
      {action.urls.length > 0 ? (
        <View style={styles.links}>
          {action.urls.map((url, index) => (
            <ExternalLink
              key={url}
              href={url}
              label={action.urls.length > 1 ? `打开权限申请链接 ${index + 1}` : "打开权限申请链接"}
              accessibilityLabel="打开 Meego 权限申请链接"
            />
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>当前错误未返回可用的权限申请链接，请联系 Meego 管理员。</Text>
      )}
      <View style={styles.actions}>
        <Button
          size="xs"
          variant="outline"
          leftIcon={RefreshCw}
          loading={checking}
          onPress={onCheck}
        >
          已完成申请，重新检查
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  icon: {
    color: theme.colors.statusWarning,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  message: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  links: {
    gap: theme.spacing[2],
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
