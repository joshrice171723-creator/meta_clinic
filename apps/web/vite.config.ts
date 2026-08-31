import { defineConfig } from "vite";

const apiPort = process.env.APPLY_API_PORT || "3001";
if (!/^\d{4,5}$/.test(apiPort) || Number(apiPort) > 65535)
  throw new Error("Invalid local API port.");
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3000,
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
