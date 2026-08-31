const upstreamAfterPack = require("./after-pack.js").default;
const { buildIslandHost } = require("./build-island-host.js");

const ARCH_MAP = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" };

exports.default = async function packagedRuntimeAfterPack(context) {
  await upstreamAfterPack(context);
  const arch = ARCH_MAP[context.arch] || process.arch;
  buildIslandHost(context, arch);
};
