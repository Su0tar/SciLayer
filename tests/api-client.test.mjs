import test from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../src/api.js";
test("服务重启使旧令牌失效时，保存和下载自动重连一次", async () => {
  const original = globalThis.fetch;
  globalThis.window = {};
  let current = "first",
    writes = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/status") return Response.json({ token: current });
    if (options.headers.Authorization !== "Bearer " + current)
      return Response.json({ error: "expired" }, { status: 401 });
    writes++;
    return url === "/api/export"
      ? new Response("image-bytes")
      : Response.json({ revision: 3 });
  };
  try {
    const t = createTransport();
    await t.start();
    current = "second";
    assert.equal((await t.put({}, 2, "ui")).revision, 3);
    current = "third";
    assert.equal(await (await t.export({}, "svg")).text(), "image-bytes");
    assert.equal(writes, 2);
  } finally {
    globalThis.fetch = original;
    delete globalThis.window;
  }
});
