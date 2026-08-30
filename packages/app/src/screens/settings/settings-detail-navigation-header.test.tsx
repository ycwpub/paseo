/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RefreshCw } from "lucide-react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDetailNavigationHeader } from "./settings-detail-navigation-header";

describe("SettingsDetailNavigationHeader", () => {
  afterEach(cleanup);

  it("shows the page icon between the plain back affordance and title", () => {
    const goBack = vi.fn();

    render(
      <SettingsDetailNavigationHeader
        title="同步记忆"
        Icon={RefreshCw}
        iconColor="#666"
        onBack={goBack}
      />,
    );

    expect(screen.getByText("同步记忆")).toBeTruthy();
    expect(screen.queryByText("返回")).toBeNull();

    const header = screen.getByTestId("settings-detail-navigation-header");
    const back = screen.getByTestId("settings-detail-back");
    const pageIcon = screen.getByTestId("settings-detail-page-icon");
    const title = screen.getByTestId("settings-detail-header-title");
    expect(Array.from(header.children)).toEqual([back, pageIcon, title]);
    expect(back.getAttribute("style") ?? "").not.toMatch(/background|border/);

    fireEvent.click(back);
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it("renders title accessories next to the title", () => {
    const titleAccessory = React.createElement(
      "span",
      { "data-testid": "title-accessory" },
      "已保存",
    );
    render(
      <SettingsDetailNavigationHeader
        title="编辑助手"
        Icon={RefreshCw}
        iconColor="#666"
        titleAccessory={titleAccessory}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("settings-detail-header-title")).toBeTruthy();
    expect(screen.getByTestId("title-accessory")).toBeTruthy();
  });
});
