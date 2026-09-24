import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ExternalLink } from "@/components/ui/external-link";

export function resolveCloudKnowledgeAuthorizationUrl(
  metadata: Record<string, unknown> | undefined,
): string | null {
  if (metadata?.permissionType !== "cloud-knowledge-auth") return null;
  const loginUrl = typeof metadata.loginUrl === "string" ? metadata.loginUrl : "";
  const source = typeof metadata.source === "string" ? metadata.source : "";
  try {
    const parsed = new URL(loginUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (source && parsed.toString() === new URL(source).toString()) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function CloudKnowledgeAuthorizationLink({
  metadata,
}: {
  metadata: Record<string, unknown> | undefined;
}) {
  const authorizationUrl = resolveCloudKnowledgeAuthorizationUrl(metadata);
  if (!authorizationUrl) return null;
  return (
    <View style={styles.container} testID="cloud-knowledge-authorization-link">
      <Text selectable style={styles.label}>
        授权链接：
      </Text>
      <ExternalLink
        href={authorizationUrl}
        label="立即授权"
        tooltip={authorizationUrl}
        accessibilityLabel="打开飞书授权链接"
        testID="cloud-knowledge-authorization-open"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
