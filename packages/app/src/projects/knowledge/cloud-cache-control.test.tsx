/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CloudKnowledgeCacheControl } from "./cloud-cache-control";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const GLOBAL_CACHE_TARGET = { serverId: "host-1", scope: "global" as const };

const cacheStatus = vi.hoisted(() => ({
  current: {
    source: "https://example.com/document",
    cached: true,
    cachedAt: "2026-08-29T04:00:00.000Z",
    checkedAt: "2026-08-29T04:00:00.000Z",
    localPath: "/Users/test/.paseo/knowledge/cloud-documents/0123456789abcdef.md",
    stale: false,
    error: null,
    authIssue: null,
  },
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => (
    <button type="button" aria-label={accessibilityLabel}>
      {children}
    </button>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useMutation: () => ({
    data: undefined,
    error: null,
    isPending: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("@/components/ui/loading-spinner", () => ({
  LoadingSpinner: () => <span>加载中</span>,
}));

vi.mock("@/data/query", () => ({
  useFetchQuery: () => ({
    data: cacheStatus.current,
    isLoading: false,
  }),
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({
    getCloudDocumentCacheStatus: vi.fn(),
    cacheCloudDocument: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("CloudKnowledgeCacheControl", () => {
  test("shows the absolute local cache file path returned by the daemon", () => {
    render(
      <CloudKnowledgeCacheControl
        target={GLOBAL_CACHE_TARGET}
        source="https://example.com/document"
      />,
    );

    const pathRow = screen.getByTestId("cloud-knowledge-cache-path");
    expect(pathRow.textContent).toContain("缓存文件路径");
    expect(pathRow.textContent).toContain(
      "/Users/test/.paseo/knowledge/cloud-documents/0123456789abcdef.md",
    );
  });
});
