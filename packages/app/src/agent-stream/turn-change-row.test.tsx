/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { TurnChangeRow } from "./turn-change-row";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("react-native", () => ({
  Pressable: ({
    accessibilityLabel,
    children,
    onPress,
    testID,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button aria-label={accessibilityLabel} data-testid={testID} onClick={onPress} type="button">
      {children}
    </button>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (theme: Record<string, unknown>) => unknown) =>
      factory({
        spacing: { 2: 8, 3: 12 },
        borderRadius: { md: 8 },
        colors: { surface2: "#eee", foregroundMuted: "#666" },
        fontSize: { base: 14 },
      }),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, input: { fileName: string }) => `审查 ${input.fileName}`,
  }),
}));

vi.mock("@/components/diff-stat", () => ({
  DiffStat: ({ additions, deletions }: { additions: number; deletions: number }) => (
    <span>{`+${additions} -${deletions}`}</span>
  ),
}));

const file: ParsedDiffFile = {
  path: "src/review-me.ts",
  isNew: false,
  isDeleted: false,
  additions: 12,
  deletions: 3,
  hunks: [],
};

describe("TurnChangeRow", () => {
  afterEach(cleanup);

  it("reviews the selected file when the row is clicked", () => {
    const onReview = vi.fn();
    render(<TurnChangeRow cwd="/repo" file={file} onReview={onReview} />);

    fireEvent.click(screen.getByTestId("turn-change-row-src/review-me.ts"));

    expect(onReview).toHaveBeenCalledWith("/repo", "src/review-me.ts");
    expect(screen.getByRole("button", { name: "审查 src/review-me.ts" })).toBeTruthy();
  });

  it("does not render a separate open-file action", () => {
    render(<TurnChangeRow cwd="/repo" file={file} onReview={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
