import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/toast-host", () => ({
  ToastViewport: () => null,
  useToastHost: vi.fn(),
}));

import { useOptionalToast, useToast } from "./toast-context";

describe("toast context", () => {
  it("allows portal content to render safely without a provider", () => {
    let resolved: ReturnType<typeof useOptionalToast> | undefined;

    function Probe() {
      resolved = useOptionalToast();
      return null;
    }

    expect(() => renderToStaticMarkup(<Probe />)).not.toThrow();
    expect(resolved).toBeNull();
  });

  it("keeps the strict hook for components that require a provider", () => {
    function Probe() {
      useToast();
      return null;
    }

    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "useToast must be used within ToastProvider",
    );
  });
});
