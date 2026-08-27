/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Test-only rerenders intentionally replace listener fixtures. */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginHttpListener, PluginHttpLocalAddress } from "@getpaseo/protocol/messages";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => ({}),
  },
}));

vi.mock("lucide-react-native", () => ({
  Plus: () => null,
  Trash2: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
  FormTextInput: ({
    initialValue,
    multiline,
    resetKey,
  }: {
    initialValue?: string;
    multiline?: boolean;
    resetKey?: string | number;
  }) =>
    multiline ? (
      <textarea key={resetKey} defaultValue={initialValue} />
    ) : (
      <input key={resetKey} defaultValue={initialValue} />
    ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: () => <input type="checkbox" />,
}));

vi.mock("./http-service-host-field", () => ({
  HttpServiceHostField: ({ value }: { value: string }) => (
    <label>
      <span>监听地址</span>
      <input defaultValue={value} />
    </label>
  ),
}));

vi.mock("./http-service-route-form", () => ({
  HttpServiceRouteForm: () => null,
}));

vi.mock("./http-service-workflow-fields", () => ({
  HttpServiceWorkflowFields: ({
    workflowPath,
    targetNodeId,
  }: {
    workflowPath: string;
    targetNodeId?: string;
  }) => (
    <>
      <label>
        <span>Workflow 文件</span>
        <select value={workflowPath} onChange={() => undefined}>
          <option value={workflowPath}>{workflowPath}</option>
        </select>
      </label>
      <label>
        <span>处理节点 ID</span>
        <select value={targetNodeId ?? ""} onChange={() => undefined}>
          <option value={targetNodeId ?? ""}>{targetNodeId ?? "完整 Workflow"}</option>
        </select>
      </label>
    </>
  ),
}));

import { HttpServiceListenerForm } from "./http-service-listener-form";

const listener: PluginHttpListener = {
  id: "listener-1",
  name: "55313",
  enabled: true,
  host: "127.0.0.1",
  port: 55323,
  defaultJobApi: {
    enabled: true,
    submitPath: "/jobs",
    queryPath: "/jobs",
    deletePath: "/jobs",
    workflowPath: "/tmp/processor.json",
    targetNodeId: "review",
    requestTemplate: '{"data":"{{request}}"}',
    responseTemplate: '{"status":"{{job.status}}"}',
  },
  routes: [],
  retention: {
    enabled: false,
    maxAgeSeconds: 3600,
    statuses: ["succeeded"],
  },
};
const runtime = {
  listenerId: listener.id,
  status: "running" as const,
  boundPort: 55323,
  error: null,
};
const localAddresses: PluginHttpLocalAddress[] = [];
const inspectWorkflowTargets = vi.fn(async () => []);
const onChange = vi.fn();
const onDelete = vi.fn();

describe("HttpServiceListenerForm", () => {
  afterEach(cleanup);

  it("shows the selected listener values when its editor opens", () => {
    const { rerender } = render(
      <HttpServiceListenerForm
        listener={listener}
        runtime={runtime}
        localAddresses={localAddresses}
        localAddressesLoading={false}
        localAddressesError={null}
        workflows={[]}
        workflowsLoading={false}
        workflowsError={null}
        inspectWorkflowTargets={inspectWorkflowTargets}
        onChange={onChange}
        onDelete={onDelete}
      />,
    );

    expect((screen.getByLabelText("端口名称") as HTMLInputElement).value).toBe("55313");
    expect((screen.getByLabelText("监听地址") as HTMLInputElement).value).toBe("127.0.0.1");
    expect((screen.getByLabelText("端口（0 为自动分配）") as HTMLInputElement).value).toBe("55323");
    expect((screen.getByLabelText("提交请求") as HTMLInputElement).value).toBe("/jobs");
    expect((screen.getByLabelText("Workflow 文件") as HTMLInputElement).value).toBe(
      "/tmp/processor.json",
    );
    expect((screen.getByLabelText("处理节点 ID") as HTMLInputElement).value).toBe("review");

    const nextListener: PluginHttpListener = {
      ...listener,
      id: "listener-2",
      name: "备用端口",
      port: 6769,
      defaultJobApi: {
        ...listener.defaultJobApi!,
        submitPath: "/tasks",
        queryPath: "/tasks",
        deletePath: "/tasks",
        targetNodeId: "prepare",
      },
    };
    rerender(
      <HttpServiceListenerForm
        listener={nextListener}
        runtime={{ ...runtime, listenerId: nextListener.id, boundPort: 6769 }}
        localAddresses={localAddresses}
        localAddressesLoading={false}
        localAddressesError={null}
        workflows={[]}
        workflowsLoading={false}
        workflowsError={null}
        inspectWorkflowTargets={inspectWorkflowTargets}
        onChange={onChange}
        onDelete={onDelete}
      />,
    );

    expect((screen.getByLabelText("端口名称") as HTMLInputElement).value).toBe("备用端口");
    expect((screen.getByLabelText("端口（0 为自动分配）") as HTMLInputElement).value).toBe("6769");
    expect((screen.getByLabelText("提交请求") as HTMLInputElement).value).toBe("/tasks");
    expect((screen.getByLabelText("处理节点 ID") as HTMLInputElement).value).toBe("prepare");
  });
});
