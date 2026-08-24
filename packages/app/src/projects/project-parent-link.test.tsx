/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectParentLink } from "./project-parent-link";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const navigate = vi.hoisted(() => vi.fn());

vi.mock("expo-router", () => ({
  router: { navigate },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "settings.project.parentProjectId" ? "父 Project ID" : key),
  }),
}));

vi.mock("react-native", () => ({
  Pressable: ({
    children,
    testID,
    accessibilityLabel,
    accessibilityRole,
    onPress,
  }: {
    children?: React.ReactNode;
    testID?: string;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    onPress?: () => void;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        "data-testid": testID,
        "aria-label": accessibilityLabel,
        role: accessibilityRole,
        onClick: onPress,
      },
      children,
    ),
  Text: ({ children }: { children?: React.ReactNode; selectable?: boolean; style?: unknown }) =>
    React.createElement("span", null, children),
  View: ({ children }: { children?: React.ReactNode; style?: unknown }) =>
    React.createElement("div", null, children),
}));

vi.mock("lucide-react-native", () => ({
  ChevronRight: () => React.createElement("span", { "data-testid": "parent-chevron" }),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            spacing: { 1: 4 },
            borderRadius: { sm: 4 },
            opacity: { 50: 0.5 },
            colors: {
              surface2: "#222",
              foregroundMuted: "#777",
              accent: "#06f",
            },
            fontSize: { xs: 11 },
          })
        : factory,
  },
}));

describe("ProjectParentLink", () => {
  afterEach(() => {
    cleanup();
    navigate.mockReset();
  });

  it("does not render for a root Project", () => {
    const { container } = render(<ProjectParentLink serverId="host-a" parentProjectId={null} />);

    expect(container.childElementCount).toBe(0);
  });

  it("shows the parent Project ID and opens its settings", () => {
    render(<ProjectParentLink serverId="host-a" parentProjectId="prj_parent" />);

    expect(screen.getByText("父 Project ID:")).not.toBeNull();
    expect(screen.getByText("prj_parent")).not.toBeNull();

    fireEvent.click(screen.getByTestId("project-parent-link"));

    expect(navigate).toHaveBeenCalledWith("/settings/hosts/host-a/projects/prj_parent");
  });
});
