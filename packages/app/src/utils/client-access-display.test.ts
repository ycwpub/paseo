import { describe, expect, it } from "vitest";
import {
  resolveBrowserClientDescription,
  resolveClientPlatformKind,
} from "./client-access-display";

describe("resolveClientPlatformKind", () => {
  it("recognizes current and legacy Mac desktop names", () => {
    expect(resolveClientPlatformKind({ clientName: "Paseo Desktop", clientType: "mobile" })).toBe(
      "mac",
    );
    expect(
      resolveClientPlatformKind({
        clientName: "Paseo Desktop · development-mac",
        clientType: "mobile",
      }),
    ).toBe("mac");
  });

  it("distinguishes Android, browser, and CLI clients", () => {
    expect(resolveClientPlatformKind({ clientName: "Paseo Android", clientType: "mobile" })).toBe(
      "android",
    );
    expect(resolveClientPlatformKind({ clientName: "Paseo Web", clientType: "browser" })).toBe(
      "browser",
    );
    expect(resolveClientPlatformKind({ clientName: "Paseo CLI", clientType: "cli" })).toBe("cli");
  });

  it("keeps compatibility with browser clients previously marked as mobile", () => {
    expect(
      resolveClientPlatformKind({ clientName: "Paseo Web · Chrome", clientType: "mobile" }),
    ).toBe("browser");
    expect(resolveClientPlatformKind({ clientName: null, clientType: "mobile" })).toBe("browser");
  });

  it("extracts browser operating system and browser details for display", () => {
    expect(
      resolveBrowserClientDescription({
        clientName: "Paseo Web · macOS · Chrome",
        clientType: "browser",
      }),
    ).toBe("macOS · Chrome");
    expect(
      resolveBrowserClientDescription({
        clientName: "Paseo Android",
        clientType: "mobile",
      }),
    ).toBeNull();
  });
});
