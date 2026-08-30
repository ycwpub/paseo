import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDesktopHost } from "@/desktop/host";
import { requestDesktopDockAttentionTest } from "./desktop-dock-attention-test";

vi.mock("@/desktop/host", () => ({
  getDesktopHost: vi.fn(),
}));

const mockedGetDesktopHost = vi.mocked(getDesktopHost);

describe("requestDesktopDockAttentionTest", () => {
  beforeEach(() => {
    mockedGetDesktopHost.mockReset();
  });

  it("uses the dedicated desktop Dock attention test bridge", async () => {
    const test = vi.fn().mockResolvedValue(true);
    mockedGetDesktopHost.mockReturnValue({ attention: { test } });

    await expect(requestDesktopDockAttentionTest()).resolves.toBe(true);
    expect(test).toHaveBeenCalledOnce();
  });

  it("returns false when the desktop bridge is unavailable", async () => {
    mockedGetDesktopHost.mockReturnValue(null);

    await expect(requestDesktopDockAttentionTest()).resolves.toBe(false);
  });

  it("returns false when the desktop bridge rejects", async () => {
    mockedGetDesktopHost.mockReturnValue({
      attention: { test: vi.fn().mockRejectedValue(new Error("failed")) },
    });

    await expect(requestDesktopDockAttentionTest()).resolves.toBe(false);
  });
});
