import { configDefaults, defineConfig } from "vitest/config";
import { featurePaseoTestOverrides } from "./feature-paseo-test-overrides";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ...featurePaseoTestOverrides],
  },
});
