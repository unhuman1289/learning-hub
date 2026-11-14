import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  server: {
    ...(process.env.LEARNING_HUB_HOST ? { host: process.env.LEARNING_HUB_HOST } : {}),
    ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
  },
  plugins: [
    vinext(),
    cloudflare({
      configPath: "./wrangler.jsonc",
      config(worker) {
        const commit = process.env.LEARNING_HUB_BUILD_COMMIT;
        const version = process.env.LEARNING_HUB_BUILD_VERSION;
        if (commit && version && ["staging", "production"].includes(String(worker.vars?.ENVIRONMENT))) {
          return { vars: { APP_COMMIT: commit, APP_VERSION: version } };
        }
      },
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
});
