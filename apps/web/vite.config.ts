import { defineConfig } from "vite";

const apiPort = process.env.APPLY_API_PORT || "3001";
const webPort = process.env.APPLY_WEB_PORT || "3000";
if (
  !/^\d{4,5}$/.test(apiPort) ||
  Number(apiPort) < 1024 ||
  Number(apiPort) > 65535
)
  throw new Error("Invalid local API port.");
if (
  !/^\d{4,5}$/.test(webPort) ||
  Number(webPort) < 1024 ||
  Number(webPort) > 65535
)
  throw new Error("Invalid local web port.");
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(webPort),
    strictPort: true,
    // Preserve Host and Origin so Rails remains the CSRF authority.
    proxy: {
      "/api": { target: "http://127.0.0.1:" + apiPort, changeOrigin: false },
    },
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  },
  build: { sourcemap: false },
});
