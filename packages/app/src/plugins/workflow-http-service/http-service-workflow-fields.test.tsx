/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapter maps SelectField callbacks to a native select. */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string | null;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => (
    <label>
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={`${label}:${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

import { HttpServiceWorkflowFields } from "./http-service-workflow-fields";

describe("HttpServiceWorkflowFields", () => {
  afterEach(cleanup);

  it("shows the existing workflow and node and updates both selections", async () => {
    const onWorkflowPathChange = vi.fn();
    const onTargetNodeIdChange = vi.fn();
    const inspectWorkflowTargets = vi.fn(async () => [
      { id: "prepare", name: "准备", type: "bash" as const },
      { id: "review", name: "审核", type: "agent" as const },
    ]);

    render(
      <HttpServiceWorkflowFields
        workflowPath="/tmp/processor.json"
        targetNodeId="review"
        workflows={[
          {
            path: "/tmp/processor.json",
            name: "处理流程",
            description: "处理 HTTP 请求",
            stepCount: 2,
            modifiedAt: "2026-08-27T00:00:00.000Z",
          },
          {
            path: "/tmp/other.json",
            name: "其他流程",
            description: null,
            stepCount: 1,
            modifiedAt: "2026-08-27T00:00:00.000Z",
          },
        ]}
        workflowsLoading={false}
        workflowsError={null}
        inspectWorkflowTargets={inspectWorkflowTargets}
        onWorkflowPathChange={onWorkflowPathChange}
        onTargetNodeIdChange={onTargetNodeIdChange}
      />,
    );

    expect((screen.getByLabelText("Workflow 文件") as HTMLSelectElement).value).toBe(
      "/tmp/processor.json",
    );
    await waitFor(() => {
      expect((screen.getByLabelText("处理节点 ID") as HTMLSelectElement).value).toBe("review");
    });

    fireEvent.change(screen.getByLabelText("Workflow 文件"), {
      target: { value: "/tmp/other.json" },
    });
    expect(onWorkflowPathChange).toHaveBeenCalledWith("/tmp/other.json");

    fireEvent.change(screen.getByLabelText("处理节点 ID"), {
      target: { value: "prepare" },
    });
    expect(onTargetNodeIdChange).toHaveBeenCalledWith("prepare");
  });
});
