import { build } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: "dist-mcp",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.join(root, "src/main.jsx"),
      name: "SciLayer",
      formats: ["iife"],
      fileName: "editor",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const files = await fs.readdir(path.join(root, "dist-mcp"));
let js = "",
  css = "";
for (const file of files) {
  if (file.endsWith(".js"))
    js += await fs.readFile(path.join(root, "dist-mcp", file), "utf8");
  if (file.endsWith(".css"))
    css += await fs.readFile(path.join(root, "dist-mcp", file), "utf8");
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>SciLayer</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="root"></div><script>window.SCILAYER_MCP_APP=true;</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
await fs.writeFile(path.join(root, "dist-mcp/editor.html"), html);
console.log("Self-contained MCP UI:", Buffer.byteLength(html), "bytes");
