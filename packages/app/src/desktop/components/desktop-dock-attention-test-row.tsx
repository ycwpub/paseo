import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { requestDesktopDockAttentionTest } from "@/desktop/attention/desktop-dock-attention-test";
import { settingsStyles } from "@/styles/settings";

type DockAttentionTestState = "idle" | "sending" | "success" | "error";

function getDockAttentionTestHint(
  state: DockAttentionTestState,
  translate: (key: string) => string,
): string {
  if (state === "success") {
    return translate("settings.notifications.dockTestSuccessHint");
  }
  if (state === "error") {
    return translate("settings.notifications.dockTestFailedHint");
  }
  return translate("settings.notifications.dockTestHint");
}

export function DesktopDockAttentionTestRow() {
  const { t } = useTranslation();
  const [state, setState] = useState<DockAttentionTestState>("idle");

  const handlePress = useCallback(() => {
    setState("sending");
    void requestDesktopDockAttentionTest().then((shown) => {
      setState(shown ? "success" : "error");
      return undefined;
    });
  }, []);

  const hint = getDockAttentionTestHint(state, t);

  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.notifications.dockTest")}</Text>
        <Text style={settingsStyles.rowHint}>{hint}</Text>
      </View>
      <Button
        variant="outline"
        size="sm"
        onPress={handlePress}
        disabled={state === "sending"}
        testID="desktop-notifications-dock-test"
      >
        {state === "sending"
          ? t("settings.notifications.sending")
          : t("settings.notifications.dockTest")}
      </Button>
    </View>
  );
}
