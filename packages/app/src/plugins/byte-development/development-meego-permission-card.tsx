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
  const isLogin = action.kind === "browser-login";
  const title = isLogin ? "需要登录 Meego 页面" : "需要申请 Meego 权限";
  const linkLabel = isLogin ? "打开 Meego 需求首页" : "打开权限申请链接";
  const emptyHint = isLogin
    ? "请在浏览器中打开 Meego 并完成登录。"
    : "当前错误未返回可用的权限申请链接，请联系 Meego 管理员。";
  const retryLabel = isLogin ? "已完成登录，重新检查" : "已完成申请，重新检查";

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <ExternalLinkIcon size={17} color={styles.icon.color} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.message}>{action.message}</Text>
      {action.urls.length > 0 ? (
        <View style={styles.links}>
          {action.urls.map((url, index) => (
            <ExternalLink
              key={url}
              href={url}
              label={action.urls.length > 1 ? `${linkLabel} ${index + 1}` : linkLabel}
              accessibilityLabel={linkLabel}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>{emptyHint}</Text>
      )}
      <View style={styles.actions}>
        <Button
          size="xs"
          variant="outline"
          leftIcon={RefreshCw}
          loading={checking}
          onPress={onCheck}
        >
          {retryLabel}
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
