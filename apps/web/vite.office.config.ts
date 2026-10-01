import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";

/** The MCP server returns this exact resource; the widget needs no asset hosts. */
const officeResource: Plugin = {
  name: "office-mcp-resource",
  enforce: "post",
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).filter(
      (item) => item.type === "chunk",
    );
    if (chunks.length !== 1)
      throw new Error("Office resource must be one self-contained bundle.");
    const styles = Object.values(bundle)
      .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
      .map((item) => (item.type === "asset" ? String(item.source) : ""))
      .join("\n");
    const code = chunks[0].code.replace(/<\/script/gi, "<\\/script");
    for (const key of Object.keys(bundle)) delete bundle[key];
    this.emitFile({
      type: "asset",
      fileName: "office-plugin.html",
      source: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Command Center Office</title><style>html,body{margin:0;min-height:100%;} ${styles.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="root"></div><script>${code}</script></body></html>`,
    });
  },
};

export default defineConfig({
  plugins: [officeResource],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/assets",
    emptyOutDir: false,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 1_000_000,
    lib: {
      entry: fileURLToPath(new URL("./src/office-plugin.tsx", import.meta.url)),
      formats: ["iife"],
      name: "DotOffice",
      fileName: () => "office-plugin.js",
    },
  },
});
