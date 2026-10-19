import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMON_COLORS,
  declaredPalette,
  pixelPalette,
  distinctColors,
} from "../src/palette.js";
test("常用色独立固定；代表色忽略隐藏对象、无效色和重复近色", () => {
  assert.equal(COMMON_COLORS.length, 12);
  const s = {
    nodes: [
      { type: "text", visible: true, opacity: 1, color: "#2563eb" },
      { type: "image", visible: true, opacity: 1, fill: "#ff0000" },
      { type: "rect", visible: false, opacity: 1, fill: "#00ff00" },
      {
        type: "rect",
        visible: true,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#9333ea",
      },
    ],
  };
  assert.deepEqual(declaredPalette(s), ["#2563eb", "#9333ea"]);
  assert.deepEqual(
    distinctColors(["none", "#ffffff", "#2563eb", "#2664ec", "#9333ea"]),
    ["#2563eb", "#9333ea"],
  );
});
test("位图色彩采样可提取独立图标的代表色，不把透明/白色当主色", () => {
  const pixels = new Uint8ClampedArray([
    255, 255, 255, 255, 32, 90, 180, 255, 34, 92, 182, 255, 140, 40, 190, 255,
    255, 0, 0, 0,
  ]);
  const p = pixelPalette(pixels);
  assert.equal(p.length, 2);
  assert.ok(p.some((c) => c === "#215bb5"));
  assert.ok(p.some((c) => c === "#8c28be"));
});
