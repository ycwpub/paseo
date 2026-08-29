/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDetailNavigationHeader } from "./settings-detail-navigation-header";

describe("SettingsDetailNavigationHeader", () => {
  afterEach(cleanup);

  it("shows only the back icon and current page title", () => {
    const goBack = vi.fn();

    render(<SettingsDetailNavigationHeader title="飞书定时提醒" onBack={goBack} />);

    expect(screen.getByText("飞书定时提醒")).toBeTruthy();
    expect(screen.queryByText("渠道")).toBeNull();
    expect(screen.queryByText("返回")).toBeNull();

    fireEvent.click(screen.getByTestId("settings-detail-back"));
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
        titleAccessory={titleAccessory}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("settings-detail-header-title")).toBeTruthy();
    expect(screen.getByTestId("title-accessory")).toBeTruthy();
  });
});
