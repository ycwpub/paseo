/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";

const onFeedback = vi.fn(async () => undefined);

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    testID,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button data-testid={testID} type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? (factory as (theme: Record<string, unknown>) => unknown)({
            spacing: { 1: 4, 2: 8, 3: 12 },
            borderRadius: { lg: 8, xl: 12 },
            colors: {
              foreground: "#fff",
              foregroundMuted: "#aaa",
              foregroundExtraMuted: "#888",
              surface2: "#222",
              border: "#333",
              destructive: "#f00",
            },
            fontSize: { xs: 11, sm: 13 },
            fontWeight: { medium: "500" },
          })
        : factory,
  },
  withUnistyles: () => () => null,
}));

vi.mock("lucide-react-native", () => ({
  Brain: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

const memory: PaseoMemoryState = {
  settings: {
    enabled: true,
    autoExtract: true,
    maxInjectedChars: 8_000,
    maxRetrievedDetails: 3,
    showSources: true,
  },
  summary: "",
  summaryPath: "/tmp/summary.md",
  details: [
    {
      id: "memory-1",
      title: "Response style",
      category: "preference",
      keywords: ["concise"],
      path: "/tmp/memory-1.md",
      charCount: 28,
      content: "Prefer concise Chinese answers.",
      confidence: 1,
      sourceAgentIds: ["agent-1"],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
      lastAccessedAt: null,
      scope: { type: "global" },
    },
  ],
  recentUsages: [
    {
      id: "usage-1",
      agentId: "agent-1",
      assistantMessageId: "message-1",
      memoryIds: ["memory-1"],
      createdAt: "2026-08-18T00:00:00.000Z",
    },
  ],
  stats: {
    detailCount: 1,
    pendingExtractions: 0,
    lastExtractedAt: null,
    lastExtractionError: null,
  },
};

import { TurnMemorySources } from "./turn-memory-sources";

describe("TurnMemorySources", () => {
  beforeEach(() => {
    onFeedback.mockClear();
  });

  test("shows answer-level memory provenance and records feedback", () => {
    render(
      <TurnMemorySources
        agentId="agent-1"
        assistantMessageId="message-1"
        memory={memory}
        isMutating={false}
        error={null}
        onFeedback={onFeedback}
      />,
    );

    expect(screen.getByText("Referenced 1 memories")).toBeTruthy();
    fireEvent.click(screen.getByTestId("turn-memory-sources-trigger"));
    expect(screen.getByText("Response style")).toBeTruthy();
    expect(screen.getByText("Prefer concise Chinese answers.")).toBeTruthy();

    fireEvent.click(screen.getByText("Helpful"));
    expect(onFeedback).toHaveBeenCalledWith("memory-1", "helpful");
  });
});
