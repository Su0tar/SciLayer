import { arrowPoints } from "./model.js";
import { gradientLine, pathHeads } from './paint.js';
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function wrapText(text, width, fontSize) {
  const result = [];
  for (const para of text.split("\n")) {
    let line = "",
      w = 0;
    for (const ch of para) {
      const cw = /[\u0000-\u00ff]/.test(ch) ? fontSize * 0.56 : fontSize;
      if (w + cw > width && line) {
        result.push(line);
        line = "";
        w = 0;
      }
      line += ch;
      w += cw;
    }
    result.push(line);
  }
  return result;
}
export const textLines = (n) =>
  n.wrap === false ? n.text.split("\n") : wrapText(n.text, n.w, n.fontSize);
export function dashArray(n) {
  const u = Math.max(1, n.strokeWidth);
  return (
    {
      dash: [u * 5, u * 3],
      dot: [u, u * 2.5],
      dashDot: [u * 5, u * 2, u, u * 2],
    }[n.dash] || []
  );
}
export function headPolygon(a, b, size) {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return [
    b,
    [
      b[0] - size * Math.cos(angle - 0.44),
      b[1] - size * Math.sin(angle - 0.44),
    ],
    [
      b[0] - size * Math.cos(angle + 0.44),
      b[1] - size * Math.sin(angle + 0.44),
    ],
  ];
}
export function nodeSvg(n, nodes) {
  const { x, y, w, h } = n;
  const defs=[];
  const paint=key=>{
    const g=n[key+'Gradient'];if(!g)return esc(n[key]);
    const id='paint-'+key+'-'+Array.from(n.id).map(c=>c.codePointAt(0).toString(16)).join('-');
    const [x1,y1,x2,y2]=gradientLine(n,g);
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${g.stops.map(s=>`<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('')}</linearGradient>`);
    return `url(#${id})`;
  };
  const fillPaint=paint('fill'),strokePaint=paint('stroke');
  const dash = dashArray(n);
  const style = `fill="${fillPaint}" stroke="${strokePaint}" stroke-width="${n.strokeWidth}" ${dash.length ? `stroke-dasharray="${dash.join(" ")}"` : ""}`;
  let body = "";
  if (n.type === "path")
    body = `<path d="${n.commands.map((c) => c.cmd + " " + c.values.map((v, i) => (i % 2 ? n.y + v * n.h : n.x + v * n.w)).join(" ")).join(" ")}" ${style} stroke-linejoin="round" stroke-linecap="round"/>`;
  if (n.type === "rect")
    body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(n.radius,w/2,h/2)}" ${style}/>`;
  if (n.type === "ellipse")
    body = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${style}/>`;
  if (n.type === "diamond")
    body = `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${style}/>`;
  if (n.type === "text") {
    const lines = textLines(n);
    const xx =
      n.align === "center" ? x + w / 2 : n.align === "right" ? x + w : x;
    body = `<text x="${xx}" y="${y + n.fontSize * (n.baseline || 1)}" fill="${esc(n.color)}" font-family="${esc(n.fontFamily || "Microsoft YaHei")},sans-serif" font-size="${n.fontSize}" font-weight="${n.bold ? 700 : 400}" font-style="${n.italic ? "italic" : "normal"}" text-anchor="${n.align === "center" ? "middle" : n.align === "right" ? "end" : "start"}">${lines.map((t, i) => `<tspan x="${xx}" dy="${i ? n.fontSize * (n.lineHeight || 1.4) : 0}">${esc(t)}</tspan>`).join("")}</text>`;
  }
  if (n.type === "arrow") {
    const p = arrowPoints(n, nodes),
      size = n.headSize || 8 + n.strokeWidth * 1.5;
    body = `<polyline points="${p.map((v) => v.join(",")).join(" ")}" fill="none" stroke="${strokePaint}" stroke-width="${n.strokeWidth}" stroke-linejoin="round" ${dash.length ? `stroke-dasharray="${dash.join(" ")}"` : ""}/>`;
    for (const [a, b] of [
      ...(n.headEnd !== false
        ? [
            [
              [...p]
                .reverse()
                .find(
                  (q) =>
                    Math.hypot(q[0] - p.at(-1)[0], q[1] - p.at(-1)[1]) > 0.01,
                ) || p[0],
              p.at(-1),
            ],
          ]
        : []),
      ...(n.headStart
        ? [
            [
              p.find(
                (q) => Math.hypot(q[0] - p[0][0], q[1] - p[0][1]) > 0.01,
              ) || p.at(-1),
              p[0],
            ],
          ]
        : []),
    ])
      body += `<polygon points="${headPolygon(a, b, size)
        .map((v) => v.join(","))
        .join(" ")}" fill="${strokePaint}"/>`;
  }
  if (n.type === "image") {
    const c = n.crop || { x: 0, y: 0, w: 1, h: 1 };
    body = `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${c.x} ${c.y} ${c.w} ${c.h}" preserveAspectRatio="none"><image href="${esc(n.src)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none"/></svg>`;
  }
  if(n.type==='path')for(const [a,b] of pathHeads(n))body+=`<polygon points="${headPolygon(a,b,n.headSize||8+n.strokeWidth*1.5).map(p=>p.join(',')).join(' ')}" fill="${strokePaint}"/>`;
  return `<g data-id="${esc(n.id)}" opacity="${n.opacity}" aria-label="${esc(n.name)}">${defs.length?'<defs>'+defs.join('')+'</defs>':''}${body}</g>`;
}
export function sceneSvg(s) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}"><rect width="100%" height="100%" fill="${esc(s.background)}"/>${s.nodes
    .filter((n) => n.visible)
    .map((n) => nodeSvg(n, s.nodes))
    .join("")}</svg>`;
}
export function auditScene(scene) {
  const findings = [];
  for (const n of scene.nodes.filter((n) => n.visible)) {
    if (
      n.type === "text" &&
      ((textLines(n).length - 1) * (n.lineHeight || 1.4) + 1) * n.fontSize >
        n.h + 6
    )
      findings.push({ id: n.id, message: `文字可能超出文本框：${n.name}` });
    if (
      n.type !== "arrow" &&
      (n.x < 0 ||
        n.y < 0 ||
        n.x + n.w > scene.width ||
        n.y + n.h > scene.height)
    )
      findings.push({ id: n.id, message: `对象超出画布：${n.name}` });
    if (n.type === "arrow") {
      const pts = arrowPoints(n, scene.nodes);
      for (const t of scene.nodes.filter(
        (v) => v.visible && v.type === "text",
      )) {
        let hit = false;
        for (let i = 1; i < pts.length; i++) {
          const [a, b] = [pts[i - 1], pts[i]];
          for (let k = 0; k <= 30; k++) {
            const x = a[0] + ((b[0] - a[0]) * k) / 30,
              y = a[1] + ((b[1] - a[1]) * k) / 30;
            if (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h) {
              hit = true;
              break;
            }
          }
          if (hit) break;
        }
        if (hit)
          findings.push({ id: n.id, message: `箭头经过文字框：${t.name}` });
      }
    }
  }
  return findings;
}
