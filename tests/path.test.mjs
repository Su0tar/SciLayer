import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { node, validateScene } from "../src/model.js";
import { sceneSvg } from "../src/render.js";
import { exportBytes } from "../server-export.mjs";
const scene = () => ({
  version: 2,
  name: "curves",
  width: 400,
  height: 400,
  background: "#ffffff",
  nodes: [
    node("path", {
      id: "curve",
      x: 20,
      y: 30,
      w: 250,
      h: 200,
      fill: "#edf2f8",
      stroke: "#2563eb",
      commands: [
        { cmd: "M", values: [0, 0] },
        { cmd: "C", values: [0.3, 0, 0.8, 0.6, 1, 1] },
        { cmd: "L", values: [0, 1] },
        { cmd: "Z", values: [] },
      ],
    }),
  ],
});
test("贝塞尔轮廓以可编辑几何保存，拒绝原始SVG注入和无效命令", () => {
  const s = validateScene(scene());
  assert.ok(sceneSvg(s).includes("C 95 30 220 150 270 230"));
  const broken = scene();
  broken.nodes[0].commands[1].cmd = "<script>";
  assert.throws(() => validateScene(broken));
});
test("PPTX自由形状包含真正cubicBezTo，PNG可以渲染相同路径", async () => {
  const s = validateScene(scene()),
    zip = await JSZip.loadAsync(await exportBytes(s, "pptx"));
  const xml = await zip.file("ppt/slides/slide1.xml").async("text");
  assert.ok(xml.includes("<a:custGeom>"));
  assert.ok(xml.includes("<a:cubicBezTo>"));
  assert.ok(!xml.includes("<p:pic>"));
  const png = await exportBytes(s, "png");
  assert.equal(png[0], 137);
});
