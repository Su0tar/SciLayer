import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("真实stdio MCP握手、工具、面板资源和规范", async () => {
  const client = new Client({ name: "scilayer-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      new URL("../mcp/server.mjs", import.meta.url).pathname.replace(
        /^\/(?=[A-Za-z]:)/,
        "",
      ),
    ],
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name,'scilayer');
    assert.equal(client.getServerVersion().title,'SciLayer');
    const tools = await client.listTools();
    for (const name of [
      "open_editor",
      "assess_image_quality",
      "get_canvas",
      "get_workflow_plan",
      "set_workflow",
      "vectorize_icons",
      "prepare_icon_atlas",
      "vectorize_icon_atlas",
      "update_objects",
      "get_canvas_preview",
      "download_export",
    ])
      assert.ok(tools.tools.some((t) => t.name === name));
    assert.ok(tools.tools.some(t=>t.name==='read_example'));
    assert.equal(tools.tools.find(t=>t.name==='open_editor').title,'SciLayer');
    const examples=await client.callTool({name:'list_examples',arguments:{}});
    assert.deepEqual(examples.structuredContent.examples.map(e=>e.id),['medical','planning']);
    const sample=await client.callTool({name:'read_example',arguments:{id:'planning'}});
    assert.equal(sample.structuredContent.scene.nodes.length,211);
    const brief=await client.callTool({name:'get_generation_brief',arguments:{}});
    assert.ok(!brief.isError);assert.match(brief.content[0].text,/#FFFFFF/);
    const r = await client.callTool({
      name: "get_reconstruction_schema",
      arguments: {},
    });
    assert.ok(r.content[0].text.includes("禁止按像素"));
    const resources = await client.listResources();
    assert.ok(
      resources.resources.some(
        (r) => r.uri === "ui://scilayer/editor.html",
      ),
    );
    const resource = await client.readResource({
      uri: "ui://scilayer/editor.html",
    });
    assert.ok(resource.contents[0].text.includes("window.SCILAYER_MCP_APP=true"));
  } finally {
    await client.close();
  }
});
