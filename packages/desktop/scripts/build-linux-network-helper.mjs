import { chmodSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "linux") {
  console.log("Skipping Linux network helper build on non-Linux host.");
  process.exit(0);
}

const arch = process.arch;
if (arch !== "x64" && arch !== "arm64") {
  throw new Error(`Unsupported Linux network helper architecture: ${arch}`);
}

const source = path.join(
  desktopRoot,
  "native",
  "network-helper",
  "linux",
  "paseo-network-helper.c",
);
const outputDirectory = path.join(desktopRoot, "native-build", "linux", arch);
const output = path.join(outputDirectory, "paseo-network-helper");
mkdirSync(outputDirectory, { recursive: true });

const compiler = process.env.CC?.trim() || "cc";
const result = spawnSync(
  compiler,
  [
    "-std=c11",
    "-O2",
    "-D_FORTIFY_SOURCE=2",
    "-fstack-protector-strong",
    "-fPIE",
    "-pie",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-Wl,-z,relro",
    "-Wl,-z,now",
    source,
    "-o",
    output,
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

if (result.status !== 0) {
  throw new Error(
    `Failed to build Linux network helper with ${compiler}:\n${result.stdout}${result.stderr}`,
  );
}
chmodSync(output, 0o755);
console.log(`Built Linux network helper: ${output}`);
