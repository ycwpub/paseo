import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

function toFeaturePaseoOverlayPath(filePath: string): string | null {
  const extension = path.extname(filePath);
  if (!extension || filePath.includes(".feature-paseo.")) return null;
  return `${filePath.slice(0, -extension.length)}.feature-paseo${extension}`;
}

export function featurePaseoOverlayPlugin(sourceRoot: string): Plugin {
  const normalizedSourceRoot = `${path.resolve(sourceRoot)}${path.sep}`;

  return {
    name: "feature-paseo-source-overlay",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith("\0")) return null;

      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved || resolved.external) return null;

      const [resolvedPath, suffix = ""] = resolved.id.split(/(?=[?#])/u, 2);
      if (!resolvedPath.startsWith(normalizedSourceRoot)) return null;

      const overlayPath = toFeaturePaseoOverlayPath(resolvedPath);
      return overlayPath && fs.existsSync(overlayPath) ? `${overlayPath}${suffix}` : null;
    },
  };
}
