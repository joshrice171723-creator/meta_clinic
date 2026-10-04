import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // This standalone acceptance harness uses node:test and runs separately in CI.
      exclude: [
        ...configDefaults.exclude,
        "scripts/follow-up-recovery.test.mjs",
      ],
    },
  }),
);
