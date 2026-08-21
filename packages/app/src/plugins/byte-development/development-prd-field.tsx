import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Link2, RefreshCw } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import {
  parseDevelopmentMeegoActionRequired,
  parseDevelopmentMeegoLoginChallenge,
  parseDevelopmentMeegoLoginStatus,
  type DevelopmentMeegoActionRequired,
  type DevelopmentMeegoLoginChallenge,
} from "./development-meego-auth-model";
import { runDevelopmentMeegoAction } from "./development-meego-client";
import { DevelopmentMeegoLoginSheet } from "./development-meego-login-sheet";
import { DevelopmentMeegoPermissionCard } from "./development-meego-permission-card";
import {
  type DevelopmentMeegoItem,
  type DevelopmentPrdSourceType,
  type DevelopmentPrdSourceValue,
  parseDevelopmentMeegoItems,
  parseResolvedDevelopmentPrd,
} from "./development-prd-source-model";

const SOURCE_OPTIONS = [
  { id: "manual", value: "manual" as const, label: "直接输入 PRD" },
  { id: "meego", value: "meego" as const, label: "从 Meego 获取" },
];

const MEEGO_HOMEPAGE_URL = "https://meego.larkoffice.com/local_services/story/homepage";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function itemDescription(item: DevelopmentMeegoItem): string | undefined {
  const detail = [item.projectKey, item.workItemType, item.status].filter(Boolean).join(" · ");
  return detail || undefined;
}

function getMeegoItemKey(item: DevelopmentMeegoItem): string {
  return item.id;
}

interface PendingMeegoRequest {
  input: Record<string, unknown>;
  onSuccess: (result: unknown) => void;
  onAuthRequired?: () => void;
  onError?: (error: unknown) => void;
}

export function DevelopmentPrdField({
  active,
  serverId,
  plugin,
  value,
  onChange,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  value: DevelopmentPrdSourceValue;
  onChange: (value: DevelopmentPrdSourceValue) => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const supported = useHostFeature(serverId, "pluginHttpServiceSubmit");
  const [items, setItems] = useState<DevelopmentMeegoItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginChecking, setLoginChecking] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginChallenge, setLoginChallenge] = useState<DevelopmentMeegoLoginChallenge | null>(null);
  const [permissionAction, setPermissionAction] = useState<DevelopmentMeegoActionRequired | null>(
    null,
  );
  const [permissionChecking, setPermissionChecking] = useState(false);
  const pendingRequestRef = useRef<PendingMeegoRequest | null>(null);
  const loginCheckingRef = useRef(false);
  const pluginId = plugin.pluginId ?? null;

  const sourceDisplay = useMemo(
    () => SOURCE_OPTIONS.find((option) => option.value === value.type) ?? SOURCE_OPTIONS[0],
    [value.type],
  );
  const sourceSelectedDisplay = useMemo(
    () => ({ label: sourceDisplay.label }),
    [sourceDisplay.label],
  );
  const itemOptions = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        value: item,
        label: item.title,
        description: itemDescription(item),
      })),
    [items],
  );
  const selectedItem = useMemo(
    () =>
      items.find(
        (item) =>
          (value.meegoWorkItemId && item.workItemId === value.meegoWorkItemId) ||
          (value.meegoUrl && item.url === value.meegoUrl),
      ) ?? null,
    [items, value.meegoUrl, value.meegoWorkItemId],
  );
  const selectedItemDisplay = useMemo(() => {
    if (selectedItem) {
      return { label: selectedItem.title, description: itemDescription(selectedItem) };
    }
    if (value.meegoTitle) {
      return { label: value.meegoTitle, description: value.meegoWorkItemId || undefined };
    }
    return null;
  }, [selectedItem, value.meegoTitle, value.meegoWorkItemId]);

  const update = useCallback(
    (patch: Partial<DevelopmentPrdSourceValue>) => onChange({ ...value, ...patch }),
    [onChange, value],
  );

  const beginLogin = useCallback(() => {
    if (!client || !pluginId || !supported || loginLoading) return;
    setLoginVisible(true);
    setLoginLoading(true);
    setLoginError(null);
    setLoginChallenge(null);
    void runDevelopmentMeegoAction({
      client,
      pluginId,
      input: { action: "login_begin" },
    })
      .then((result) => {
        setLoginChallenge(parseDevelopmentMeegoLoginChallenge(result));
        return undefined;
      })
      .catch((nextError: unknown) => {
        setLoginError(errorText(nextError));
      })
      .finally(() => setLoginLoading(false));
  }, [client, loginLoading, pluginId, supported]);

  const handleActionRequired = useCallback(
    (result: unknown, request: PendingMeegoRequest): boolean => {
      const action = parseDevelopmentMeegoActionRequired(result);
      if (!action) return false;
      pendingRequestRef.current = request;
      setError(null);
      request.onAuthRequired?.();
      if (action.kind === "login") {
        setPermissionAction(null);
        beginLogin();
      } else {
        setLoginVisible(false);
        setPermissionAction(action);
      }
      return true;
    },
    [beginLogin],
  );

  const runMeegoRequest = useCallback(
    (request: PendingMeegoRequest) => {
      if (!client || !pluginId || !supported) return;
      void runDevelopmentMeegoAction({
        client,
        pluginId,
        input: request.input,
      })
        .then((result) => {
          if (handleActionRequired(result, request)) return undefined;
          setPermissionAction(null);
          request.onSuccess(result);
          return undefined;
        })
        .catch((nextError: unknown) => {
          if (handleActionRequired(nextError, request)) return;
          request.onError?.(nextError);
          setError(errorText(nextError));
        });
    },
    [client, handleActionRequired, pluginId, supported],
  );

  const retryPendingRequest = useCallback(() => {
    const request = pendingRequestRef.current;
    if (!request || !client || !pluginId || !supported) return;
    setPermissionChecking(true);
    void runDevelopmentMeegoAction({
      client,
      pluginId,
      input: request.input,
    })
      .then((result) => {
        if (handleActionRequired(result, request)) {
          if (parseDevelopmentMeegoActionRequired(result)?.kind === "login") {
            setLoginError("登录尚未生效，请完成授权后再次检查。");
          }
          return undefined;
        }
        pendingRequestRef.current = null;
        setPermissionAction(null);
        request.onSuccess(result);
        return undefined;
      })
      .catch((nextError: unknown) => {
        if (handleActionRequired(nextError, request)) return;
        request.onError?.(nextError);
        setError(errorText(nextError));
      })
      .finally(() => setPermissionChecking(false));
  }, [client, handleActionRequired, pluginId, supported]);

  const checkLogin = useCallback(() => {
    if (!client || !pluginId || !supported || !loginChallenge || loginCheckingRef.current) {
      return;
    }
    loginCheckingRef.current = true;
    setLoginChecking(true);
    void runDevelopmentMeegoAction({
      client,
      pluginId,
      input: {
        action: "login_complete",
        completeToken: loginChallenge.completeToken,
      },
    })
      .then((result) => {
        const status = parseDevelopmentMeegoLoginStatus(result);
        if (status === "pending") return;
        if (status === "expired") {
          setLoginChallenge(null);
          setLoginError("登录二维码已过期，请重新获取。");
          return;
        }
        setLoginVisible(false);
        setLoginChallenge(null);
        setLoginError(null);
        retryPendingRequest();
        return undefined;
      })
      .catch((nextError: unknown) => {
        setLoginError(errorText(nextError));
      })
      .finally(() => {
        loginCheckingRef.current = false;
        setLoginChecking(false);
      });
  }, [client, loginChallenge, pluginId, retryPendingRequest, supported]);

  useEffect(() => {
    if (!loginVisible || !loginChallenge) return;
    const interval = setInterval(
      checkLogin,
      Math.max(1, loginChallenge.pollIntervalSeconds) * 1000,
    );
    return () => clearInterval(interval);
  }, [checkLogin, loginChallenge, loginVisible]);

  const loadItems = useCallback(() => {
    if (!client || !pluginId || !supported || listLoading) return;
    setListLoading(true);
    setError(null);
    runMeegoRequest({
      input: { action: "list", homepageUrl: MEEGO_HOMEPAGE_URL },
      onSuccess: (result) => {
        setItems(parseDevelopmentMeegoItems(result));
        setListLoaded(true);
        setListLoading(false);
      },
      onAuthRequired: () => {
        setListLoaded(true);
        setListLoading(false);
      },
      onError: () => {
        setListLoaded(true);
        setListLoading(false);
      },
    });
  }, [client, listLoading, pluginId, runMeegoRequest, supported]);

  useEffect(() => {
    if (!active || value.type !== "meego" || listLoaded || listLoading) return;
    loadItems();
  }, [active, listLoaded, listLoading, loadItems, value.type]);

  const resolveItem = useCallback(
    (item?: DevelopmentMeegoItem) => {
      if (!client || !pluginId || !supported || resolveLoading) return;
      const meegoUrl = item?.url ?? value.meegoUrl.trim();
      const projectKey = item?.projectKey ?? value.meegoProjectKey;
      const workItemId = item?.workItemId ?? value.meegoWorkItemId;
      if (!meegoUrl && !workItemId) {
        setError("请输入 Meego 工作项链接，或从“我参与的”需求中选择一项。");
        return;
      }
      const pendingValue: DevelopmentPrdSourceValue = {
        ...value,
        type: "meego",
        meegoUrl,
        meegoProjectKey: projectKey,
        meegoWorkItemId: workItemId,
        meegoTitle: item?.title ?? value.meegoTitle,
      };
      onChange(pendingValue);
      setResolveLoading(true);
      setError(null);
      runMeegoRequest({
        input: {
          action: "resolve",
          url: meegoUrl,
          projectKey,
          workItemId,
        },
        onSuccess: (result) => {
          const resolved = parseResolvedDevelopmentPrd(result);
          if (!resolved.prd.trim()) {
            setError("Meego 工作项没有返回可用的 PRD 内容");
            setResolveLoading(false);
            return;
          }
          onChange({
            ...pendingValue,
            prd: resolved.prd,
            meegoUrl: resolved.meegoUrl || pendingValue.meegoUrl,
            meegoProjectKey: resolved.meegoProjectKey || pendingValue.meegoProjectKey,
            meegoWorkItemId: resolved.meegoWorkItemId || pendingValue.meegoWorkItemId,
            meegoTitle: resolved.meegoTitle || pendingValue.meegoTitle,
          });
          setResolveLoading(false);
        },
        onAuthRequired: () => setResolveLoading(false),
        onError: () => setResolveLoading(false),
      });
    },
    [client, onChange, pluginId, resolveLoading, runMeegoRequest, supported, value],
  );

  const handleSourceChange = useCallback(
    (source: DevelopmentPrdSourceType) => update({ type: source }),
    [update],
  );
  const handleItemChange = useCallback(
    (item: DevelopmentMeegoItem) => resolveItem(item),
    [resolveItem],
  );
  const handleUrlChange = useCallback(
    (meegoUrl: string) =>
      update({
        type: "meego",
        meegoUrl,
        meegoProjectKey: "",
        meegoWorkItemId: "",
        meegoTitle: "",
      }),
    [update],
  );
  const handlePrdChange = useCallback((prd: string) => update({ prd }), [update]);
  const handleResolvePress = useCallback(() => resolveItem(), [resolveItem]);
  const handleLoginClose = useCallback(() => {
    setLoginVisible(false);
  }, []);

  return (
    <>
      <View style={styles.container}>
        <SelectField
          label="PRD 来源"
          value={value.type}
          selectedDisplay={sourceSelectedDisplay}
          options={SOURCE_OPTIONS}
          onChange={handleSourceChange}
          placeholder="选择 PRD 来源"
          emptyText="没有可用来源"
        />
        {value.type === "manual" ? (
          <Field
            label="PRD / 需求说明"
            hint="可直接粘贴 PRD、需求说明和验收标准；不得包含 Token、Cookie、JWT 或其他密钥。"
          >
            <FormTextInput
              value={value.prd}
              onChangeText={handlePrdChange}
              placeholder="输入 PRD、需求说明及验收标准"
              multiline
              textInputStyle={styles.prdInput}
            />
          </Field>
        ) : (
          <View style={styles.meegoSection}>
            <View style={styles.meegoHeader}>
              <Text style={styles.sectionTitle}>Meego PRD</Text>
              <Button
                size="xs"
                variant="outline"
                leftIcon={RefreshCw}
                loading={listLoading}
                disabled={!client || !pluginId || !supported || listLoading}
                onPress={loadItems}
              >
                刷新
              </Button>
            </View>
            <SelectField
              label="我参与的 Meego"
              value={selectedItem}
              selectedDisplay={selectedItemDisplay}
              options={itemOptions}
              onChange={handleItemChange}
              placeholder="选择我参与的需求"
              emptyText={listLoaded ? "当前页面没有可用的参与需求" : "正在读取 Meego 页面"}
              loading={listLoading}
              disabled={resolveLoading}
              searchable
              searchPlaceholder="搜索标题、空间或状态"
              getValueKey={getMeegoItemKey}
              hint="从 Meego 需求首页的“我参与的”列表读取；选择后会自动获取 PRD。"
            />
            {!supported ? (
              <Text style={styles.errorText}>当前 Host 不支持读取 Meego，请更新 daemon。</Text>
            ) : null}
            <Field label="Meego 工作项链接" hint="也可以直接粘贴 Meego 工作项链接后获取 PRD。">
              <View style={styles.urlRow}>
                <View style={styles.urlInput}>
                  <FormTextInput
                    value={value.meegoUrl}
                    onChangeText={handleUrlChange}
                    placeholder="https://meego.larkoffice.com/..."
                    editable={!resolveLoading}
                  />
                </View>
                <Button
                  variant="outline"
                  leftIcon={Link2}
                  loading={resolveLoading}
                  disabled={resolveLoading || (!value.meegoUrl.trim() && !value.meegoWorkItemId)}
                  onPress={handleResolvePress}
                >
                  获取 PRD
                </Button>
              </View>
            </Field>
            {permissionAction ? (
              <DevelopmentMeegoPermissionCard
                action={permissionAction}
                checking={permissionChecking}
                onCheck={retryPendingRequest}
              />
            ) : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Field label="PRD / 需求说明" hint="已从 Meego 自动获取，可在启动流程前补充或修改。">
              <FormTextInput
                value={value.prd}
                onChangeText={handlePrdChange}
                placeholder={resolveLoading ? "正在读取 Meego PRD…" : "选择或输入 Meego 后自动填充"}
                multiline
                editable={!resolveLoading}
                textInputStyle={styles.prdInput}
              />
            </Field>
          </View>
        )}
      </View>
      <DevelopmentMeegoLoginSheet
        visible={loginVisible}
        challenge={loginChallenge}
        loading={loginLoading}
        checking={loginChecking}
        error={loginError}
        onClose={handleLoginClose}
        onRetry={beginLogin}
        onCheck={checkLogin}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  meegoSection: {
    gap: theme.spacing[4],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  meegoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  urlRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  urlInput: {
    flex: 1,
    minWidth: 260,
  },
  prdInput: {
    minHeight: 140,
    textAlignVertical: "top",
  },
  errorText: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
}));
