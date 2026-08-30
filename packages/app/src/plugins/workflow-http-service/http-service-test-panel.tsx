import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Send } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginHttpListener,
  PluginHttpListenerRuntime,
  PluginHttpTestResponse,
  PluginHttpTestTarget,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import {
  buildHttpServiceTestOptions,
  parseHttpServiceTestBody,
  resolveHttpServiceTestTarget,
  testSelectionAcceptsBody,
  testSelectionNeedsRequestId,
} from "./http-service-test-model";

type TestResult = Omit<PluginHttpTestResponse, "requestId">;

function stringifyHeaders(headers: Record<string, string>): string {
  return JSON.stringify(headers, null, 2);
}

export function HttpServiceTestPanel({
  listener,
  runtime,
  onTest,
}: {
  listener: PluginHttpListener;
  runtime: PluginHttpListenerRuntime | null;
  onTest: (input: {
    listenerId: string;
    target: PluginHttpTestTarget;
    body?: Record<string, unknown>;
  }) => Promise<TestResult>;
}) {
  const options = useMemo(() => buildHttpServiceTestOptions(listener), [listener]);
  const [selection, setSelection] = useState(options[0]?.value ?? "");
  const [requestId, setRequestId] = useState("");
  const [bodyText, setBodyText] = useState("{}");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (options.some((option) => option.value === selection)) return;
    setSelection(options[0]?.value ?? "");
  }, [options, selection]);

  const selectedDisplay = useMemo(() => {
    const option = options.find((candidate) => candidate.value === selection);
    return option ? { label: option.label, description: option.description } : null;
  }, [options, selection]);
  const needsRequestId = testSelectionNeedsRequestId(selection);
  const acceptsBody = testSelectionAcceptsBody(selection);
  const canSend =
    runtime?.status === "running" &&
    options.length > 0 &&
    selection.length > 0 &&
    (!needsRequestId || requestId.trim().length > 0);

  const send = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const target = resolveHttpServiceTestTarget(selection, requestId);
      const body = acceptsBody ? parseHttpServiceTestBody(bodyText) : undefined;
      const response = await onTest({ listenerId: listener.id, target, body });
      setResult(response);
      if (response.error) setError(response.error);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setRunning(false);
    }
  }, [acceptsBody, bodyText, listener.id, onTest, requestId, selection]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>接口测试</Text>
          <Text style={styles.muted}>
            请求由 daemon 在当前 Host 内发起，只能访问这个监听端口中已配置的接口。
          </Text>
        </View>
        <Button
          variant="default"
          size="sm"
          leftIcon={Send}
          loading={running}
          disabled={!canSend}
          onPress={send}
        >
          发送测试请求
        </Button>
      </View>

      <SelectField
        label="测试接口"
        value={selection || null}
        selectedDisplay={selectedDisplay}
        options={options}
        onChange={setSelection}
        placeholder="选择接口"
        emptyText="当前端口没有已启用的接口"
      />

      {needsRequestId ? (
        <Field label="请求 ID">
          <FormTextInput
            initialValue={requestId}
            onChangeText={setRequestId}
            placeholder="输入提交接口返回的 processId"
          />
        </Field>
      ) : null}

      {acceptsBody ? (
        <Field label="请求体 JSON" hint="必须是 JSON object。">
          <FormTextInput
            multiline
            initialValue={bodyText}
            onChangeText={setBodyText}
            textInputStyle={styles.codeInput}
          />
        </Field>
      ) : null}

      {runtime?.status !== "running" ? (
        <Text style={styles.warning}>请先保存并应用配置，等待端口进入运行状态后再测试。</Text>
      ) : null}
      {error ? (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      ) : null}

      {result ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>测试结果</Text>
          <View style={styles.metadata}>
            <Text selectable style={styles.metadataText}>
              {result.requestUrl ?? "未生成请求地址"}
            </Text>
            <Text style={styles.metadataText}>
              状态码：{result.statusCode ?? "网络错误"} · 耗时：{result.durationMs} ms
            </Text>
          </View>
          <Field label="响应 Headers">
            <ScrollView style={styles.codeBlock} nestedScrollEnabled>
              <Text selectable style={styles.codeText}>
                {stringifyHeaders(result.headers)}
              </Text>
            </ScrollView>
          </Field>
          <Field label="响应 Body">
            <ScrollView style={styles.codeBlock} nestedScrollEnabled>
              <Text selectable style={styles.codeText}>
                {result.bodyText || "（空响应）"}
              </Text>
            </ScrollView>
          </Field>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  titleGroup: {
    flex: 1,
    minWidth: 240,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  warning: {
    color: theme.colors.palette.amber[500],
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  codeInput: {
    minHeight: 120,
    fontFamily: "monospace",
  },
  result: {
    gap: theme.spacing[3],
    paddingTop: theme.spacing[2],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  resultTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  metadata: {
    gap: theme.spacing[1],
  },
  metadataText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  codeBlock: {
    maxHeight: 260,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  codeText: {
    color: theme.colors.foreground,
    fontFamily: "monospace",
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
}));
