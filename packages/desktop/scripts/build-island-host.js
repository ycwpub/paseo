const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function compile(source, output, arch) {
  execFileSync(
    "xcrun",
    [
      "clang",
      source,
      "-O",
      "-fobjc-arc",
      "-mmacosx-version-min=11.0",
      "-arch",
      arch,
      "-framework",
      "AppKit",
      "-framework",
      "WebKit",
      "-o",
      output,
    ],
    { stdio: "inherit" },
  );
}

function buildIslandHost(context, arch) {
  if (context.electronPlatformName !== "darwin") return;

  const productName = context.packager?.appInfo?.productFilename || "Paseo";
  const resourcesDir = path.join(
    context.appOutDir,
    `${productName}.app`,
    "Contents",
    "Resources",
    "native",
  );
  const source = path.join(__dirname, "..", "native", "island-host", "main.m");
  const output = path.join(resourcesDir, "paseo-island-host");
  fs.mkdirSync(resourcesDir, { recursive: true });

  if (arch === "universal") {
    const arm64Output = `${output}.arm64`;
    const x64Output = `${output}.x64`;
    compile(source, arm64Output, "arm64");
    compile(source, x64Output, "x86_64");
    execFileSync("lipo", ["-create", arm64Output, x64Output, "-output", output], {
      stdio: "inherit",
    });
    fs.rmSync(arm64Output, { force: true });
    fs.rmSync(x64Output, { force: true });
  } else {
    compile(source, output, arch === "x64" ? "x86_64" : "arm64");
  }

  fs.chmodSync(output, 0o755);
  console.log(`Built native macOS island host: ${output}`);
}

module.exports = { buildIslandHost };
