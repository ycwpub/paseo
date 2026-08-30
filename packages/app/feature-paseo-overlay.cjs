const fs = require("node:fs");
const path = require("node:path");

function toFeaturePaseoOverlayPath(filePath) {
  const extension = path.extname(filePath);
  if (!extension || filePath.includes(".feature-paseo.")) return null;
  return `${filePath.slice(0, -extension.length)}.feature-paseo${extension}`;
}

function applyFeaturePaseoOverlay(resolution, sourceRoot) {
  if (resolution?.type !== "sourceFile" || !resolution.filePath.startsWith(sourceRoot)) {
    return resolution;
  }

  const overlayPath = toFeaturePaseoOverlayPath(resolution.filePath);
  return overlayPath && fs.existsSync(overlayPath)
    ? { ...resolution, filePath: overlayPath }
    : resolution;
}

module.exports = {
  applyFeaturePaseoOverlay,
  toFeaturePaseoOverlayPath,
};
