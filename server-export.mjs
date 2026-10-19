import {
  createCanvas,
  loadImage,
  GlobalFonts,
  ImageData,
} from "@napi-rs/canvas";
import { initializeCanvas, writePsdBuffer } from "ag-psd";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { drawNode } from "./src/canvas-render.js";
import { bounds, validateScene } from "./src/model.js";
import { textLines, sceneSvg } from "./src/render.js";
import { pptxBytes } from "./src/export.js";
for (const file of ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyhbd.ttc"])
  if (existsSync(file)) GlobalFonts.registerFromPath(file, "Microsoft YaHei");
for (const file of [
  "C:/Windows/Fonts/arialn.ttf",
  "C:/Windows/Fonts/arialnb.ttf",
  "C:/Windows/Fonts/arialni.ttf",
  "C:/Windows/Fonts/arialnbi.ttf",
])
  if (existsSync(file)) GlobalFonts.registerFromPath(file, "Arial Narrow");
initializeCanvas(
  (w, h) => createCanvas(w, h),
  (data, w, h) => new ImageData(data, w, h),
);
export const mimeTypes = {
  png: "image/png",
  svg: "image/svg+xml",
  json: "application/json",
  psd: "image/vnd.adobe.photoshop",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const imageCache = new Map();
async function image(src) {
  if (!imageCache.has(src)) {
    if (imageCache.size > 100) imageCache.clear();
    imageCache.set(src, loadImage(Buffer.from(src.split(",")[1], "base64")));
  }
  return imageCache.get(src);
}
export async function croppedData(n) {
  const bytes = Buffer.from(n.src.split(",")[1], "base64"),
    c = n.crop;
  if (!c) return n.src;
  const meta = await sharp(bytes).metadata(),
    left = Math.min(meta.width - 1, Math.round(c.x * meta.width)),
    top = Math.min(meta.height - 1, Math.round(c.y * meta.height)),
    width = Math.max(
      1,
      Math.min(meta.width - left, Math.round(c.w * meta.width)),
    ),
    height = Math.max(
      1,
      Math.min(meta.height - top, Math.round(c.h * meta.height)),
    );
  return (
    "data:image/png;base64," +
    (
      await sharp(bytes).extract({ left, top, width, height }).png().toBuffer()
    ).toString("base64")
  );
}
export async function exportBytes(
  input,
  format,
  { nativeText = true, width = 2400 } = {},
) {
  const scene = validateScene(input);
  if (!mimeTypes[format]) throw Error("不支持的导出格式");
  if (format === "json") return Buffer.from(JSON.stringify(scene, null, 2));
  if (format === "svg") return Buffer.from(sceneSvg(scene));
  if (format === "pptx")
    return Buffer.from(await pptxBytes(scene, { cropImage: croppedData }));
  if (scene.width * scene.height > 20000000)
    throw Error("PNG/PSD导出当前最多支持2000万像素画布");
  const scale = format === "png" ? Math.min(4, width / scene.width) : 1;
  const canvas = createCanvas(
      Math.round(scene.width * scale),
      Math.round(scene.height * scale),
    ),
    ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const n of scene.nodes.filter((n) => n.visible))
    await drawNode(ctx, n, scene.nodes, image);
  if (format === "png") return canvas.toBuffer("image/png");
  const groups = [];
  const bg = createCanvas(scene.width, scene.height);
  bg.getContext("2d").fillStyle = scene.background;
  bg.getContext("2d").fillRect(0, 0, scene.width, scene.height);
  for (const n of scene.nodes) {
    let b = { ...bounds(n, scene.nodes) };
    const padding =
      n.type === "arrow" || (n.type==='path' && (n.headStart||n.headEnd))
        ? Math.ceil((n.headSize || 15) + n.strokeWidth + 2)
        : Math.ceil(n.strokeWidth + 4);
    if (n.type === "text") {
      const m = createCanvas(1, 1).getContext("2d");
      m.font = `${n.italic ? "italic " : ""}${n.bold ? "bold " : ""}${n.fontSize}px "${n.fontFamily}"`;
      const widths = textLines(n).map((t) => m.measureText(t).width),
        actual = Math.max(1, ...widths),
        left =
          n.align === "center"
            ? n.x + n.w / 2 - actual / 2
            : n.align === "right"
              ? n.x + n.w - actual
              : n.x;
      b.x = Math.min(n.x, left - n.fontSize * 0.1);
      b.w = Math.max(n.x + n.w, left + actual + n.fontSize * 0.1) - b.x;
      b.h = Math.max(
        n.h,
        (textLines(n).length - 1) * n.fontSize * n.lineHeight +
          n.fontSize * (n.baseline + 0.3),
      );
    }
    const left = Math.floor(Math.max(-8000, b.x - padding)),
      top = Math.floor(Math.max(-8000, b.y - padding));
    const w = Math.max(1, Math.ceil(b.w + padding * 2)),
      h = Math.max(1, Math.ceil(b.h + padding * 2));
    if (w * h > 20000000) throw Error("单个PSD图层过大");
    const layerCanvas = createCanvas(w, h),
      lc = layerCanvas.getContext("2d");
    lc.translate(-left, -top);
    await drawNode(lc, { ...n, opacity: 1 }, scene.nodes, image);
    const layer = {
      name: n.id + " " + n.name,
      left,
      top,
      canvas: layerCanvas,
      hidden: !n.visible,
      opacity: n.opacity,
    };
    if (nativeText && n.type === "text") {
      const rgb = n.color
        .slice(1)
        .match(/../g)
        .map((v) => parseInt(v, 16));
      layer.text = {
        text: textLines(n).join("\n"),
        transform: [
          1,
          0,
          0,
          1,
          n.align === "center"
            ? n.x + n.w / 2
            : n.align === "right"
              ? n.x + n.w
              : n.x,
          n.y + n.fontSize * n.baseline,
        ],
        style: {
          font: {
            name:
              n.fontFamily === "Microsoft YaHei"
                ? n.bold
                  ? "MicrosoftYaHei-Bold"
                  : "MicrosoftYaHei"
                : n.fontFamily,
          },
          fontSize: n.fontSize,
          fillColor: { r: rgb[0], g: rgb[1], b: rgb[2] },
          leading: n.fontSize * n.lineHeight,
          autoLeading: false,
        },
        paragraphStyle: { justification: n.align },
      };
    }
    const group = n.layerGroup || "未分组";
    if (groups.at(-1)?.[0] !== group) groups.push([group, []]);
    groups.at(-1)[1].push(layer);
  }
  const children = groups.reverse().map(([name, layers]) => ({
    name,
    opened: false,
    children: layers.reverse(),
  }));
  children.push({ name: "画布背景", left: 0, top: 0, canvas: bg });
  return writePsdBuffer(
    { width: scene.width, height: scene.height, canvas, children },
    { generateThumbnail: true },
  );
}
