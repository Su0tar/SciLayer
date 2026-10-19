import { arrowPoints } from "./model.js";
import { textLines, dashArray, headPolygon } from "./render.js";
import { canvasPaint,pathHeads } from './paint.js';
export async function drawNode(ctx, n, nodes, loadImage) {
  ctx.save();
  ctx.globalAlpha = n.opacity ?? 1;
  ctx.lineJoin='round';ctx.lineCap='round';
  if (n.type === "text") {
    ctx.font = `${n.italic ? "italic " : ""}${n.bold ? "bold " : ""}${n.fontSize}px "${n.fontFamily || "Microsoft YaHei"}"`;
    ctx.fillStyle = n.color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = n.align || "left";
    const x =
      n.align === "center"
        ? n.x + n.w / 2
        : n.align === "right"
          ? n.x + n.w
          : n.x;
    textLines(n).forEach((t, i) =>
      ctx.fillText(
        t,
        x,
        n.y +
          n.fontSize * (n.baseline || 1) +
          i * n.fontSize * (n.lineHeight || 1.4),
      ),
    );
  } else if (n.type === "image") {
    const im = await loadImage(n.src),
      c = n.crop || { x: 0, y: 0, w: 1, h: 1 },
      w = im.naturalWidth || im.width,
      h = im.naturalHeight || im.height;
    ctx.drawImage(im, c.x * w, c.y * h, c.w * w, c.h * h, n.x, n.y, n.w, n.h);
  } else if (n.type === "arrow") {
    const pts = arrowPoints(n, nodes);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.lineWidth = n.strokeWidth;
    ctx.strokeStyle = canvasPaint(ctx,n,'stroke');
    ctx.lineJoin = "round";
    ctx.setLineDash(dashArray(n));
    if (n.strokeWidth > 0 && (n.strokeGradient || n.stroke !== "none")) ctx.stroke();
    ctx.setLineDash([]);
    const size = n.headSize || 8 + n.strokeWidth * 1.5;
    for (const [a, b] of [
      ...(n.headEnd !== false
        ? [
            [
              [...pts]
                .reverse()
                .find(
                  (q) =>
                    Math.hypot(q[0] - pts.at(-1)[0], q[1] - pts.at(-1)[1]) >
                    0.01,
                ) || pts[0],
              pts.at(-1),
            ],
          ]
        : []),
      ...(n.headStart
        ? [
            [
              pts.find(
                (q) => Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) > 0.01,
              ) || pts.at(-1),
              pts[0],
            ],
          ]
        : []),
    ]) {
      const tri = headPolygon(a, b, size);
      ctx.beginPath();
      tri.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
      ctx.closePath();
      ctx.fillStyle = canvasPaint(ctx,n,'stroke');
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    if (n.type === "path") {
      for (const c of n.commands) {
        const a = c.values.map((v, i) =>
          i % 2 ? n.y + v * n.h : n.x + v * n.w,
        );
        if (c.cmd === "M") ctx.moveTo(...a);
        else if (c.cmd === "L") ctx.lineTo(...a);
        else if (c.cmd === "C") ctx.bezierCurveTo(...a);
        else if (c.cmd === "Q") ctx.quadraticCurveTo(...a);
        else ctx.closePath();
      }
    } else if (n.type === "rect")
      ctx.roundRect(
        n.x,
        n.y,
        n.w,
        n.h,
        Math.min(n.radius || 0, n.w / 2, n.h / 2),
      );
    else if (n.type === "ellipse")
      ctx.ellipse(
        n.x + n.w / 2,
        n.y + n.h / 2,
        n.w / 2,
        n.h / 2,
        0,
        0,
        Math.PI * 2,
      );
    else {
      ctx.moveTo(n.x + n.w / 2, n.y);
      ctx.lineTo(n.x + n.w, n.y + n.h / 2);
      ctx.lineTo(n.x + n.w / 2, n.y + n.h);
      ctx.lineTo(n.x, n.y + n.h / 2);
      ctx.closePath();
    }
    if (n.fillGradient || (n.fill !== "none" && n.fill !== "transparent")) {
      ctx.fillStyle = canvasPaint(ctx,n,'fill');
      ctx.fill();
    }
    if ((n.strokeGradient || n.stroke !== "none") && n.strokeWidth > 0) {
      ctx.lineWidth = n.strokeWidth;
      ctx.strokeStyle = canvasPaint(ctx,n,'stroke');
      ctx.setLineDash(dashArray(n));
      ctx.stroke();
    }
    if(n.type==='path')for(const [a,b] of pathHeads(n)){
      const tri=headPolygon(a,b,n.headSize||8+n.strokeWidth*1.5);ctx.beginPath();tri.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=canvasPaint(ctx,n,'stroke');ctx.fill();
    }
  }
  ctx.restore();
}
