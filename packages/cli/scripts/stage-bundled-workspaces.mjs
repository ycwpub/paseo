import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.resolve(cliRoot, "..");
const bundledScopeRoot = path.join(cliRoot, "node_modules", "@getpaseo");

const bundledWorkspaces = [
  {
    name: "@getpaseo/client",
    directory: "client",
    requiredRuntimeFile: path.join("dist", "index.js"),
  },
  {
    name: "@getpaseo/highlight",
    directory: "highlight",
    requiredRuntimeFile: path.join("dist", "index.js"),
  },
  {
    name: "@getpaseo/protocol",
    directory: "protocol",
    requiredRuntimeFile: path.join("dist", "schedule", "cadence.js"),
  },
  {
    name: "@getpaseo/relay",
    directory: "relay",
    requiredRuntimeFile: path.join("dist", "local-server.js"),
  },
  {
    name: "@getpaseo/server",
    directory: "server",
    requiredRuntimeFile: path.join("dist", "scripts", "supervisor-entrypoint.js"),
  },
];

function readPackageJson(packageRoot) {
  return JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
}

function bundledPackageRoot(workspace) {
  return path.join(bundledScopeRoot, workspace.directory);
}

function cleanup() {
  for (const workspace of bundledWorkspaces) {
    rmSync(bundledPackageRoot(workspace), { recursive: true, force: true });
  }

  if (existsSync(bundledScopeRoot) && readdirSync(bundledScopeRoot).length === 0) {
    rmSync(bundledScopeRoot, { recursive: true });
  }
}

function copyOptionalFile(sourceRoot, destinationRoot, fileName) {
  const sourcePath = path.join(sourceRoot, fileName);
  if (existsSync(sourcePath)) {
    cpSync(sourcePath, path.join(destinationRoot, fileName));
  }
}

function validateRuntimeDependencies(workspace, packageJson, cliPackage) {
  for (const [dependencyName, versionRange] of Object.entries(packageJson.dependencies ?? {})) {
    const cliVersionRange = cliPackage.dependencies?.[dependencyName];
    if (cliVersionRange !== versionRange) {
      throw new Error(
        `${workspace.name} requires ${dependencyName}@${versionRange}, but the CLI declares ${
          cliVersionRange ?? "no dependency"
        }. Bundled workspace dependencies must also be direct CLI dependencies so npm installs their runtime closure.`,
      );
    }
  }
}

function writeBundledPackageJson(destinationRoot, packageJson) {
  const bundledPackageJson = { ...packageJson };

  // npm treats dependencies declared by a bundled package as if their contents were
  // bundled too. We intentionally bundle only the Paseo workspace code and promote
  // its runtime closure to the CLI package, so retaining these fields would make npm
  // create empty dependency directories instead of downloading the real packages.
  delete bundledPackageJson.dependencies;
  delete bundledPackageJson.optionalDependencies;

  writeFileSync(
    path.join(destinationRoot, "package.json"),
    `${JSON.stringify(bundledPackageJson, null, 2)}\n`,
  );
}

function stageWorkspace(workspace, cliPackage) {
  const sourceRoot = path.join(packagesRoot, workspace.directory);
  const destinationRoot = bundledPackageRoot(workspace);
  const packageJson = readPackageJson(sourceRoot);
  const expectedVersion = cliPackage.dependencies?.[workspace.name];

  if (packageJson.name !== workspace.name) {
    throw new Error(`Unexpected package at ${sourceRoot}: ${packageJson.name ?? "(unnamed)"}`);
  }
  if (expectedVersion !== packageJson.version) {
    throw new Error(
      `CLI requires ${workspace.name}@${expectedVersion}, but the workspace contains ${packageJson.version}`,
    );
  }
  validateRuntimeDependencies(workspace, packageJson, cliPackage);

  const requiredSourceFile = path.join(sourceRoot, workspace.requiredRuntimeFile);
  if (!existsSync(requiredSourceFile)) {
    throw new Error(
      `The complete ${workspace.name} build is missing ${workspace.requiredRuntimeFile}`,
    );
  }

  mkdirSync(destinationRoot, { recursive: true });
  writeBundledPackageJson(destinationRoot, packageJson);
  cpSync(path.join(sourceRoot, "dist"), path.join(destinationRoot, "dist"), {
    recursive: true,
  });
  copyOptionalFile(sourceRoot, destinationRoot, "README.md");
  copyOptionalFile(sourceRoot, destinationRoot, ".env.example");

  const requiredBundledFile = path.join(destinationRoot, workspace.requiredRuntimeFile);
  if (!existsSync(requiredBundledFile)) {
    throw new Error(`Failed to stage ${workspace.name}/${workspace.requiredRuntimeFile}`);
  }
}

function stage() {
  cleanup();
  const cliPackage = readPackageJson(cliRoot);
  for (const workspace of bundledWorkspaces) {
    stageWorkspace(workspace, cliPackage);
  }
}

if (process.argv.includes("--clean")) {
  cleanup();
} else {
  stage();
}
