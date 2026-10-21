import { readFile } from "node:fs/promises";
const base = (process.env.SCILAYER_URL || process.env.FIGURE_WORKBENCH_URL) || "http://127.0.0.1:4317";
const [command, file] = process.argv.slice(2);
const token = (
  await readFile(new URL("../data/bridge-token", import.meta.url), "utf8")
).trim();
if (command === "get") {
  const r = await fetch(base + "/api/scene");
  console.log(JSON.stringify(await r.json(), null, 2));
} else if (command === "put" && file) {
  const input = JSON.parse(await readFile(file, "utf8"));
  const current = await (await fetch(base + "/api/scene")).json();
  const scene = input.scene || input;
  const revision =
    process.argv[4] !== undefined
      ? Number(process.argv[4])
      : (input.revision ?? current.revision);
  const r = await fetch(base + "/api/scene", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scene, revision, actor: "codex-bridge" }),
  });
  console.log(JSON.stringify(await r.json()));
  if (!r.ok) process.exitCode = 1;
} else if (command === "patch" && file) {
  const input = JSON.parse(await readFile(file, "utf8"));
  const updates = input.updates || input;
  const revision =
    process.argv[4] !== undefined ? Number(process.argv[4]) : input.revision;
  if (!Number.isFinite(revision)) throw Error("patch需要当前revision");
  const r = await fetch(base + "/api/operations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      revision,
      actor: "codex-bridge",
      operations: updates.map((u) => ({ type: "update", ...u })),
    }),
  });
  console.log(JSON.stringify(await r.json()));
  if (!r.ok) process.exitCode = 1;
} else {
  console.error("node scripts/bridge.mjs get | put path/to/scene.figure.json");
  process.exitCode = 1;
}
