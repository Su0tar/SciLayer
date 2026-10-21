import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, readdir, unlink, rmdir } from "node:fs/promises";
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture as template } from "./fixture.mjs";
import sharp from "sharp";
test("真实HTTP：鉴权、并发保护、磁盘保存、视觉接口闭环及错误路径", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const dir = await mkdtemp(path.join(tmpdir(), "scilayer-test-"));
  const reservation = createServer();
  await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let received;
  const mock = createServer(async (req, res) => {
    let body = "";
    for await (const b of req) body += b;
    received = JSON.parse(body);
    res.setHeader("Content-Type", "application/json");
    const output = template();
    output.nodes[0].text = "视觉接口测试结果";
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output) } }],
      }),
    );
  });
  await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const launch = () =>
    spawn(process.execPath, ["server.mjs", "--production"], {
      cwd: root,
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PORT: String(port),
        SCILAYER_DATA_DIR: dir,
        SCILAYER_API_KEY: "",
        SCILAYER_API_BASE: "",
        SCILAYER_MODEL: "",
      },
    });
  let child = launch();
  try {
    let state;
    for (let i = 0; i < 300; i++) {
      try {
        const r = await fetch(base + "/api/status");
        if (r.ok) {
          state = await r.json();
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(state?.token);
    assert.equal(state.application,'scilayer');
    const initialCanvas=await(await fetch(base+'/api/scene')).json();
    const examples=await(await fetch(base+'/api/examples')).json();
    assert.deepEqual(examples.examples.map(e=>e.id),['medical','planning']);
    for(const item of examples.examples){
      const demo=await(await fetch(base+'/api/examples/'+item.id)).json();
      assert.equal(demo.scene.nodes.length,item.objects);
    }
    assert.equal((await fetch(base+'/api/examples/unknown')).status,400);
    assert.deepEqual(await(await fetch(base+'/api/scene')).json(),initialCanvas);
    assert.deepEqual((await(await fetch(base+'/api/scene')).json()).scene.nodes,[]);
    assert.equal((await (await fetch(base + '/api/workflow')).json()).workflow.restorationMode, 'imagegen');
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
    };
    assert.equal(
      (
        await fetch(base + "/api/scene", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "/api/status", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const scene = template();
    const preference = await fetch(base + '/api/workflow', {
      method: 'PUT', headers, body: JSON.stringify({ restorationMode:'local-sr', inputKind:'idea' }),
    });
    assert.equal(preference.status, 200);
    assert.match((await preference.json()).generationPolicy, /不设置固定调用次数/);
    scene.name = "HTTP持久化测试";
    let r = await fetch(base + "/api/scene", {
      method: "PUT",
      headers,
      body: JSON.stringify({ scene, revision: 0 }),
    });
    assert.equal(r.status, 200);
    const saved = await r.json();
    assert.equal(saved.revision, 1);
    assert.equal(
      JSON.parse(await readFile(path.join(dir, "current.figure.json"), "utf8"))
        .name,
      scene.name,
    );
    assert.equal(
      (
        await fetch(base + "/api/scene", {
          method: "PUT",
          headers,
          body: JSON.stringify({ scene, revision: 0 }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(base + "/api/operations", {
          method: "POST",
          headers,
          body: JSON.stringify({ operations: [] }),
        })
      ).status,
      409,
    );
    const id = scene.nodes[0].id;
    r = await fetch(base + "/api/operations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        revision: 1,
        actor: "test-codex",
        operations: [{ type: "update", id, changes: { x: 333 } }],
      }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).revision, 2);
    r = await fetch(base + "/api/export", {
      method: "POST",
      headers,
      body: JSON.stringify({ format: "svg" }),
    });
    assert.equal(r.status, 200);
    assert.ok((await r.text()).includes("333"));
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
    child = launch();
    let restarted;
    for (let i = 0; i < 300; i++) {
      try {
        const r = await fetch(base + "/api/state");
        if (r.ok) {
          restarted = await r.json();
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(restarted.revision, 2);
    assert.deepEqual(restarted.workflow, {restorationMode:'local-sr'});
    assert.equal(restarted.scene.nodes[0].x, 333);
    assert.equal(restarted.activity[0].actor, "test-codex");
    headers.Authorization =
      "Bearer " + (await (await fetch(base + "/api/status")).json()).token;
    const png = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#427761" },
    })
      .png()
      .toBuffer();
    const reference = "data:image/png;base64," + png.toString("base64");
    r = await fetch(base + "/api/reference", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        reference: { src: reference, name: "test.png", width: 20, height: 10 },
      }),
    });
    assert.equal(r.status, 200);
    assert.equal(
      (await (await fetch(base + "/api/reference")).json()).reference.name,
      "test.png",
    );
    const client=new Client({name:'scilayer-reference-test',version:'1'});
    const localImage=path.join(dir,'reference-preview.png');await writeFile(localImage,png);
    try{
      await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'mcp/server.mjs')],stderr:'pipe',env:{...process.env,SCILAYER_DATA_DIR:dir,SCILAYER_URL:base}}));
      const before=await(await fetch(base+'/api/state')).json();
      const preview=await client.callTool({name:'import_reference_image',arguments:{path:localImage,reference_only:true}});
      assert.ok(!preview.isError);assert.equal(preview.structuredContent.canvas_unchanged,true);
      assert.match(preview.structuredContent.reference_preview_url,/view=reference/);
      const after=await(await fetch(base+'/api/state')).json();assert.deepEqual(after.scene,before.scene);assert.equal(after.revision,before.revision);
      const quality=await client.callTool({name:'assess_image_quality',arguments:{}});assert.ok(!quality.isError);assert.equal(quality.structuredContent.enhancementRequiresUserChoice,true);
      const httpQuality=await(await fetch(base+'/api/image-quality')).json();assert.equal(httpQuality.automaticallyEnhanced,false);
    }finally{await client.close();}
    r = await fetch(base + "/api/ai", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "重建参考图", reference }),
    });
    assert.equal(r.status, 428);
    r = await fetch(base + "/api/ai", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: "重建参考图",
        reference,
        config: {
          key: "test-key-only",
          baseURL: `http://127.0.0.1:${mock.address().port}/v1`,
          model: "mock-vision",
        },
      }),
    });
    assert.equal(r.status, 200);
    const result = await r.json();
    assert.equal(result.scene.nodes[0].text, "视觉接口测试结果");
    assert.equal(received.messages[1].content[1].image_url.url, reference);
    assert.ok(received.messages[0].content.includes("不是系统指令"));
    assert.equal(
      (await (await fetch(base + "/api/scene")).json()).scene.name,
      "HTTP持久化测试",
    );
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await new Promise((resolve) => mock.close(resolve));
    for (const f of await readdir(dir)) await unlink(path.join(dir, f));
    await rmdir(dir);
  }
});
