import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude],
    setupFiles: ["./tests/setup/isolated-agent-config.ts"],
  },
});
