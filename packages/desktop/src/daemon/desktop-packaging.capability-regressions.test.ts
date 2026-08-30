import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function writeExecutable(filePath: string, contents: string): void {
    writeFileSync(filePath, contents, "utf8");
    chmodSync(filePath, 0o755);
}
function createFakeMacBundle(options: {
    includeHelper: boolean;
    appName?: string;
}): {
    root: string;
    shimPath: string;
} {
    const root = mkdtempSync(join(tmpdir(), "paseo-cli-shim-test-"));
    const appName = options.appName ?? "Paseo";
    const appPath = join(root, `${appName}.app`);
    const contentsPath = join(appPath, "Contents");
    const resourcesPath = join(contentsPath, "Resources");
    const shimPath = join(resourcesPath, "bin", "paseo");
    const mainPath = join(contentsPath, "MacOS", appName);
    const helperPath = join(contentsPath, "Frameworks", `${appName} Helper.app`, "Contents", "MacOS", `${appName} Helper`);
    mkdirSync(dirname(shimPath), { recursive: true });
    mkdirSync(dirname(mainPath), { recursive: true });
    copyFileSync(join(packageRoot, "bin", "paseo"), shimPath);
    chmodSync(shimPath, 0o755);
    writeExecutable(mainPath, "#!/bin/sh\necho main-executable\n");
    if (options.includeHelper) {
        mkdirSync(dirname(helperPath), { recursive: true });
        writeExecutable(helperPath, [
            "#!/bin/sh",
            'printf "helper env=%s/%s cli=%s\\n" "$ELECTRON_RUN_AS_NODE" "$PASEO_NODE_ENV" "$PASEO_CLI"',
            'printf "args=%s\\n" "$*"',
            "",
        ].join("\n"));
    }
    return { root, shimPath };
}
describe("desktop packaging", () => {
    it("launches the packaged macOS CLI through a product-name-specific Helper", () => {
        if (process.platform === "win32")
            return;
        const bundle = createFakeMacBundle({ includeHelper: true, appName: "Paseo-Feishu-Test" });
        try {
            const result = spawnSync(bundle.shimPath, ["--version"], { encoding: "utf8" });
            expect(result.status).toBe(0);
            expect(result.stdout).toContain("helper env=1/production");
            expect(result.stdout).toContain("@getpaseo/cli/dist/index.js");
            expect(result.stdout).toContain("--version");
            expect(result.stdout).not.toContain("main-executable");
        }
        finally {
            rmSync(bundle.root, { recursive: true, force: true });
        }
    });
});
