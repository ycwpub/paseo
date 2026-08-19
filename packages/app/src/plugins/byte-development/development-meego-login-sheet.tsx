import { useCallback, useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import { ActivityIndicator, Text, View } from "react-native";
import { ExternalLink as ExternalLinkIcon, RefreshCw } from "lucide-react-native";
import { SvgXml } from "react-native-svg";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import type { DevelopmentMeegoLoginChallenge } from "./development-meego-auth-model";

export function DevelopmentMeegoLoginSheet({
  visible,
  challenge,
  loading,
  checking,
  error,
  onClose,
  onRetry,
  onCheck,
}: {
  visible: boolean;
  challenge: DevelopmentMeegoLoginChallenge | null;
  loading: boolean;
  checking: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onCheck: () => void;
}) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const header = useMemo(
    () => ({ title: "登录 Meego", subtitle: "登录成功后会自动重试刚才的操作" }),
    [],
  );

  useEffect(() => {
    let active = true;
    if (!challenge?.verificationUrl) {
      setQrSvg(null);
      return;
    }
    void QRCode.toString(challenge.verificationUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
    })
      .then((value) => {
        if (active) setQrSvg(value);
        return value;
      })
      .catch(() => {
        if (active) setQrSvg(null);
      });
    return () => {
      active = false;
    };
  }, [challenge?.verificationUrl]);

  const handleRetry = useCallback(() => onRetry(), [onRetry]);
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="outline" onPress={onClose}>
          稍后登录
        </Button>
        {challenge ? (
          <Button variant="default" leftIcon={RefreshCw} loading={checking} onPress={onCheck}>
            已完成登录，立即检查
          </Button>
        ) : (
          <Button variant="default" leftIcon={RefreshCw} loading={loading} onPress={handleRetry}>
            重新获取登录二维码
          </Button>
        )}
      </View>
    ),
    [challenge, checking, handleRetry, loading, onCheck, onClose],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      header={header}
      onClose={onClose}
      desktopMaxWidth={520}
      testID="development-meego-login-sheet"
      footer={footer}
    >
      <View style={styles.content}>
        {loading && !challenge ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" />
            <Text style={styles.hint}>正在获取 Meego 登录二维码…</Text>
          </View>
        ) : null}
        {challenge ? (
          <>
            <Text style={styles.description}>请使用飞书/Lark 扫描二维码并完成授权。</Text>
            {qrSvg ? (
              <View style={styles.qrContainer}>
                <SvgXml xml={qrSvg} width="100%" height="100%" />
              </View>
            ) : (
              <Text style={styles.hint}>二维码生成失败，请使用下方登录链接。</Text>
            )}
            {challenge.userCode ? (
              <Text selectable style={styles.userCode}>
                验证码：{challenge.userCode}
              </Text>
            ) : null}
            <View style={styles.linkCard}>
              <ExternalLink
                href={challenge.verificationUrl}
                label="在浏览器中打开 Meego 登录链接"
                accessibilityLabel="打开 Meego 登录链接"
              />
              <Text selectable style={styles.linkText}>
                {challenge.verificationUrl}
              </Text>
            </View>
            <Text style={styles.hint}>Paseo 会自动检查登录状态，无需复制命令或错误信息。</Text>
          </>
        ) : null}
        {error ? (
          <View style={styles.errorCard}>
            <ExternalLinkIcon size={16} color={styles.errorText.color} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    alignItems: "center",
    gap: theme.spacing[4],
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[8],
  },
  description: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  qrContainer: {
    width: 260,
    height: 260,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "#fff",
  },
  userCode: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  linkCard: {
    width: "100%",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  linkText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  errorCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  errorText: {
    flex: 1,
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  footer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
