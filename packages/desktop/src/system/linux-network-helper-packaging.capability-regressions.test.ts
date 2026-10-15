import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = path.resolve(import.meta.dirname, "../..");

describe("Linux Project network helper packaging", () => {
  it("ships the helper source, hardened build, install hook, and escape test", () => {
    const requiredFiles = [
      "native/network-helper/linux/paseo-network-helper.c",
      "scripts/build-linux-network-helper.mjs",
      "scripts/test-linux-network-helper.sh",
      "scripts/linux-network-helper-after-install.sh",
    ];

    expect(
      requiredFiles.filter((relativePath) => !existsSync(path.join(desktopRoot, relativePath))),
    ).toEqual([]);
  });

  it("packages the helper and enables setuid only for deb/rpm installation", () => {
    const builder = readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");

    expect(builder).toContain("native-build/linux/${arch}/paseo-network-helper");
    expect(builder).toContain("network-helper/paseo-network-helper");
    expect(
      builder.match(/afterInstall: scripts\/linux-network-helper-after-install\.sh/gu),
    ).toHaveLength(2);
    expect(builder).toMatch(/deb:\n  depends:\n    - iproute2\n    - iptables/u);
    expect(builder).toMatch(/rpm:\n  depends:\n    - iproute\n    - iptables/u);
  });
});
