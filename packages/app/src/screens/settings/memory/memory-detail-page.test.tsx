/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { MemoryDetailPage } from "./memory-detail-page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("./memory-detail-editor", async () => {
  const ReactModule = await import("react");
  function MockMemoryDetailEditor({
    detail: memoryDetail,
    onTitleChange,
  }: {
    detail: PaseoMemoryDetail;
    onTitleChange?: (title: string) => void;
  }) {
    const changeTitle = ReactModule.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onTitleChange?.(event.currentTarget.value);
      },
      [onTitleChange],
    );
    return <input aria-label="标题" defaultValue={memoryDetail.title} onChange={changeTitle} />;
  }
  return { MemoryDetailEditor: MockMemoryDetailEditor };
});

afterEach(cleanup);

function createDetail(title: string): PaseoMemoryDetail {
  return {
    id: "memory-1",
    title,
    category: "project",
    keywords: [],
    path: "/tmp/memory.md",
    charCount: 10,
    content: "Memory content",
    confidence: 1,
    sourceAgentIds: [],
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    lastAccessedAt: null,
  };
}

describe("MemoryDetailPage", () => {
  test("keeps the section heading synchronized with the editable title", () => {
    const view = render(
      <MemoryDetailPage
        detail={createDetail("原始标题")}
        scopeEditable={false}
        disabled={false}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "原始标题" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "标题" }), {
      target: { value: "修改后的标题" },
    });
    expect(screen.getByRole("heading", { name: "修改后的标题" })).toBeTruthy();

    view.rerender(
      <MemoryDetailPage
        detail={createDetail("服务端更新标题")}
        scopeEditable={false}
        disabled={false}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "服务端更新标题" })).toBeTruthy();
  });
});
