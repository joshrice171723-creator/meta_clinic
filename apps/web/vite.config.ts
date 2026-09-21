import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";

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

const joshuaPortfolioRoot = resolve(
  fileURLToPath(new URL("../../sites/joshua-rice", import.meta.url)),
);
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const joshuaPortfolio: Plugin = {
  name: "joshua-portfolio",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.method !== "GET" && request.method !== "HEAD") return next();

      const [pathname, query] = (request.url || "/").split("?", 2);
      if (pathname !== "/joshua" && !pathname.startsWith("/joshua/"))
        return next();

      if (pathname === "/joshua") {
        response.statusCode = 308;
        response.setHeader("Location", `/joshua/${query ? `?${query}` : ""}`);
        response.end();
        return;
      }

      let requestedPath: string;
      try {
        requestedPath = decodeURIComponent(
          pathname === "/joshua/"
            ? "index.html"
            : pathname.slice("/joshua/".length),
        );
      } catch {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      const filePath = resolve(joshuaPortfolioRoot, requestedPath);
      const relativePath = relative(joshuaPortfolioRoot, filePath);
      if (
        relativePath.startsWith("..") ||
        isAbsolute(relativePath) ||
        !relativePath
      ) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      try {
        const file = await readFile(filePath);
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader(
          "Content-Type",
          contentTypes[filePath.slice(filePath.lastIndexOf("."))] ||
            "application/octet-stream",
        );
        response.end(request.method === "HEAD" ? undefined : file);
      } catch (error: unknown) {
        const code =
          error instanceof Error && "code" in error ? error.code : undefined;
        if (code === "ENOENT" || code === "EISDIR") {
          response.statusCode = 404;
          response.end("Not found");
          return;
        }
        next(error);
      }
    });
  },
};
export default defineConfig({
  plugins: [joshuaPortfolio],
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
