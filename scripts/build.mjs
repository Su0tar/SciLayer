import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const args of [
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-mcp-ui.mjs"],
])
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error("Build step failed: " + args.join(" "))),
    );
  });
