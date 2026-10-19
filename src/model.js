import { normalizeGradient } from './paint.js';
export const uid = () => globalThis.crypto.randomUUID();
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const TYPES = [
  "rect",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "image",
  "path",
];
export function node(type, props = {}) {
  return {
    id: uid(),
    type,
    name: {
      rect: "矩形",
      ellipse: "椭圆",
      diamond: "判断节点",
      text: "文字",
      arrow: "连接箭头",
      image: "图片",
      path: "自由曲线",
    }[type],
    x: 100,
    y: 100,
    w: 200,
    h: 80,
    fill: "#eaf2ef",
    stroke: "#4e776b",
    strokeWidth: 2,
    color: "#253c37",
    fontSize: 22,
    text: "",
    radius: 12,
    opacity: 1,
    visible: true,
    locked: false,
    dash: "solid",
    headStart: false,
    headEnd: type === "arrow",
    lineHeight: 1.4,
    baseline: 1,
    wrap: true,
    fontFamily: "Microsoft YaHei",
    align: "left",
    bold: false,
    italic: false,
    ...props,
  };
}
export function validateScene(input) {
  if (
    !input ||
    !Number.isFinite(input.width) ||
    !Number.isFinite(input.height) ||
    input.width < 100 ||
    input.width > 8000 ||
    input.height < 100 ||
    input.height > 8000 ||
    !Array.isArray(input.nodes) ||
    input.nodes.length > 1500
  )
    throw Error("画布格式无效：宽高应为 100–8000，最多 1500 个对象");
  const ids = new Set();
  const out = {
    version: 2,
    name: String(input.name || "未命名科研图").slice(0, 120),
    width: input.width,
    height: input.height,
    background: color(input.background || "#ffffff"),
    nodes: [],
  };
  for (const raw of input.nodes) {
    if (!TYPES.includes(raw.type)) throw Error("不支持的对象类型：" + raw.type);
    const n = node(raw.type, raw);
    if (typeof n.id !== "string" || ids.has(n.id))
      throw Error("对象 ID 重复或无效");
    ids.add(n.id);
    for (const key of [
      "x",
      "y",
      "w",
      "h",
      "fontSize",
      "strokeWidth",
      "opacity",
    ])
      if (!Number.isFinite(n[key])) throw Error("对象坐标或样式无效");
    if (
      n.w <= 0 ||
      n.h <= 0 ||
      n.w > 16000 ||
      n.h > 16000 ||
      Math.abs(n.x) > 16000 ||
      Math.abs(n.y) > 16000 ||
      n.fontSize < 1 ||
      n.fontSize > 400 ||
      n.strokeWidth < 0 ||
      n.strokeWidth > 100 ||
      n.opacity < 0 ||
      n.opacity > 1
    )
      throw Error("对象尺寸或样式超出范围");
    for (const key of ["fill", "stroke", "color"]) n[key] = color(n[key]);
    for (const key of ['fillGradient','strokeGradient']) {
      const gradient=normalizeGradient(n[key]);
      if(gradient)n[key]=gradient;else delete n[key];
    }
    n.text = String(n.text || "").slice(0, 15000);
    n.name = String(n.name || n.type).slice(0, 120);
    n.radius = Math.max(0, Math.min(400, Number(n.radius) || 0));
    n.visible = n.visible !== false;
    n.locked = !!n.locked;
    n.bold = !!n.bold;
    n.italic = !!n.italic;
    n.wrap = n.wrap !== false;
    n.align = ["left", "center", "right"].includes(n.align) ? n.align : "left";
    n.dash = ["solid", "dash", "dot", "dashDot"].includes(n.dash)
      ? n.dash
      : "solid";
    n.fontFamily = [
      "Microsoft YaHei",
      "Arial",
      "Arial Narrow",
      "Times New Roman",
    ].includes(n.fontFamily)
      ? n.fontFamily
      : "Microsoft YaHei";
    if (n.type === "path") {
      const arity = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };
      if (
        !Array.isArray(n.commands) ||
        n.commands.length < 2 ||
        n.commands.length > 400 ||
        n.commands[0]?.cmd !== "M" ||
        !n.commands.every(
          (c) =>
            Object.hasOwn(arity, c.cmd) &&
            Array.isArray(c.values) &&
            c.values.length === arity[c.cmd] &&
            c.values.every((v) => Number.isFinite(v) && Math.abs(v) <= 10),
        )
      )
        throw Error("自由曲线路径无效");
    }
    if (
      !Number.isFinite(n.lineHeight) ||
      n.lineHeight < 0.7 ||
      n.lineHeight > 4 ||
      !Number.isFinite(n.baseline) ||
      n.baseline < 0.5 ||
      n.baseline > 1.5
    )
      throw Error("文字行高或基线无效");
    for (const k of ["layerGroup", "groupId"])
      if (n[k] !== undefined) n[k] = String(n[k]).slice(0, 150);
    if (
      n.type === "image" &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(n.src || "")
    )
      throw Error("图片必须为内嵌 PNG/JPEG/WebP");
    if (n.crop) {
      if (
        !["x", "y", "w", "h"].every((k) => Number.isFinite(n.crop[k])) ||
        n.crop.x < 0 ||
        n.crop.y < 0 ||
        n.crop.w <= 0 ||
        n.crop.h <= 0 ||
        n.crop.x + n.crop.w > 1.001 ||
        n.crop.y + n.crop.h > 1.001
      )
        throw Error("裁剪范围无效");
    }
    if (n.type === "arrow") {
      n.headStart = !!n.headStart;
      n.headEnd = n.headEnd !== false;
      if (n.points !== undefined) {
        if (
          !Array.isArray(n.points) ||
          n.points.length < 2 ||
          n.points.length > 1000 ||
          !n.points.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((v) => Number.isFinite(v) && Math.abs(v) <= 100),
          )
        )
          throw Error("连线路径无效：需要至少两个归一化坐标点");
      }
      if (
        n.headSize !== undefined &&
        (!Number.isFinite(n.headSize) || n.headSize < 1 || n.headSize > 200)
      )
        throw Error("箭头大小无效");
      n.from = typeof n.from === "string" ? n.from : undefined;
      n.to = typeof n.to === "string" ? n.to : undefined;
      n.route = ["straight", "elbow", "bottom", "manual"].includes(n.route)
        ? n.route
        : "elbow";
    }
    out.nodes.push(n);
  }
  return out;
}
function color(v) {
  if (v === "none" || v === "transparent" || /^#[0-9a-f]{6}$/i.test(v))
    return v;
  throw Error("颜色格式必须为 #RRGGBB 或 none");
}
export function arrowPoints(n, nodes) {
  if (n.points?.length)
    return n.points.map((p) => [n.x + p[0] * n.w, n.y + p[1] * n.h]);
  const a = nodes.find((o) => o.id === n.from),
    b = nodes.find((o) => o.id === n.to);
  if (!a || !b)
    return [
      [n.x, n.y],
      [n.x + n.w, n.y + n.h],
    ];
  if (n.route === "bottom") {
    const y = Math.max(a.y + a.h, b.y + b.h) + 50;
    return [
      [a.x + a.w / 2, a.y + a.h],
      [a.x + a.w / 2, y],
      [b.x + b.w / 2, y],
      [b.x + b.w / 2, b.y + b.h],
    ];
  }
  const forward = b.x >= a.x + a.w;
  if (forward) {
    const x1 = a.x + a.w,
      y1 = a.y + a.h / 2,
      x2 = b.x,
      y2 = b.y + b.h / 2;
    return n.route === "straight"
      ? [
          [x1, y1],
          [x2, y2],
        ]
      : [
          [x1, y1],
          [(x1 + x2) / 2, y1],
          [(x1 + x2) / 2, y2],
          [x2, y2],
        ];
  }
  const x1 = a.x + a.w / 2,
    y1 = a.y + a.h,
    x2 = b.x + b.w / 2,
    y2 = b.y;
  return [
    [x1, y1],
    [x1, (y1 + y2) / 2],
    [x2, (y1 + y2) / 2],
    [x2, y2],
  ];
}
export function bounds(n, nodes) {
  if (n.type !== "arrow") return n;
  const pts = arrowPoints(n, nodes);
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(12, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(12, Math.max(...ys) - Math.min(...ys)),
  };
}
export function template() {
  return {version:2,name:"未命名科研图",width:1440,height:900,background:"#ffffff",nodes:[]};
}
export function applyLocalCommand(scene, prompt, selected = []) {
  const out = clone(scene);
  const target = (
    selected.length
      ? out.nodes.filter((n) => selected.includes(n.id))
      : out.nodes
  ).filter((n) => !n.locked);
  let changed = 0;
  const lineStyle = [
    ["点划线", "dashDot"],
    ["虚线", "dash"],
    ["点线", "dot"],
    ["实线", "solid"],
  ].find(([word]) => prompt.includes(word));
  if (lineStyle) {
    for (const n of target)
      if (n.type !== "text" && n.type !== "image") {
        n.dash = lineStyle[1];
        changed++;
      }
    return {
      scene: out,
      message: `已将 ${changed} 个对象的线型改为${lineStyle[0]}。`,
    };
  }
  const replace = prompt.match(
    /(?:把|将)?[“「"](.+?)[”」"]\s*(?:替换为|改成|改为|替换成)\s*[“「"](.+?)[”」"]/,
  );
  if (replace) {
    for (const n of target)
      if (n.text?.includes(replace[1])) {
        n.text = n.text.replaceAll(replace[1], replace[2]);
        changed++;
      }
    return { scene: out, message: `已替换 ${changed} 个文字对象。` };
  }
  const hex = prompt.match(/#[0-9a-f]{6}/i)?.[0];
  const named = [
    ["绿色", "#427761"],
    ["蓝色", "#526f9e"],
    ["橙色", "#af7d4f"],
    ["黑色", "#253c37"],
  ].find(([k]) => prompt.includes(k));
  const col = hex || named?.[1];
  if (col) {
    for (const n of target) {
      if (n.locked) continue;
      if (n.type === "text") n.color = col;
      else n.stroke = col;
      changed++;
    }
    return {
      scene: out,
      message: `已更新 ${changed} 个对象的文字色或线条色。`,
    };
  }
  const size = prompt.match(
    /(?:字号|字体大小)(?:改为|设为|设置为|为)?\s*(\d+)/,
  );
  if (size) {
    const v = Number(size[1]);
    if (v < 1 || v > 400) throw Error("字号应在 1–400 之间");
    for (const n of target)
      if (n.type === "text") {
        n.fontSize = v;
        changed++;
      }
    return { scene: out, message: `已将 ${changed} 个文字对象设为 ${v}px。` };
  }
  throw Error(
    "本地指令支持：将“旧文字”改为“新文字”、改成蓝色、字号改为24。自由描述与自动拆图需要连接视觉模型。",
  );
}
