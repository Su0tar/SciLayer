import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { arrowPoints } from "./model.js";
import { sceneSvg, textLines, esc } from "./render.js";
const rgb = (c) =>
  c === "none" || c === "transparent" ? "FFFFFF" : c.replace("#", "").toUpperCase();
function pptxScene(scene) {
  return {...scene,nodes:scene.nodes.map(n=>{
    if(n.type!=='arrow'||!n.strokeGradient)return n;
    const p=arrowPoints(n,scene.nodes),x=Math.min(...p.map(q=>q[0])),y=Math.min(...p.map(q=>q[1])),w=Math.max(1,Math.max(...p.map(q=>q[0]))-x),h=Math.max(1,Math.max(...p.map(q=>q[1]))-y);
    return {...n,type:'path',x,y,w,h,commands:p.map((q,i)=>({cmd:i?'L':'M',values:[(q[0]-x)/w,(q[1]-y)/h]}))};
  })};
}
export async function createPptx(scene, { cropImage } = {}) {
  scene=pptxScene(scene);
  const p = new PptxGenJS();
  const scale = 1 / 100;
  p.defineLayout({
    name: "FIGURE",
    width: scene.width * scale,
    height: scene.height * scale,
  });
  p.layout = "FIGURE";
  p.author = "SciLayer";
  p.subject = "Editable scientific figure";
  p.title = scene.name;
  p.lang = "zh-CN";
  const slide = p.addSlide();
  slide.background = { color: rgb(scene.background) };
  for (const n of scene.nodes.filter((n) => n.visible)) {
    const common = {
      x: n.x * scale,
      y: n.y * scale,
      w: n.w * scale,
      h: n.h * scale,
      objectName: n.id + " " + n.name,
      transparency: (1 - n.opacity) * 100,
    };
    if (n.type === "text") {
      slide.addText(textLines(n).join("\n"), {
        ...common,
        fontFace: n.fontFamily || "Microsoft YaHei",
        fontSize: n.fontSize * 0.72,
        color: rgb(n.color),
        bold: n.bold,
        italic: n.italic,
        margin: 0,
        breakLine: false,
        valign: "top",
        align: n.align || "left",
        paraSpaceAfter: 0,
        lineSpacingMultiple: n.lineHeight || 1.4,
        transparency: (1 - n.opacity) * 100,
      });
    } else if (n.type === "arrow") {
      const pts = arrowPoints(n, scene.nodes);
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) continue;
        slide.addShape(p.ShapeType.line, {
          x: Math.min(a[0], b[0]) * scale,
          y: Math.min(a[1], b[1]) * scale,
          w: Math.abs(b[0] - a[0]) * scale,
          h: Math.abs(b[1] - a[1]) * scale,
          flipH: b[0] < a[0],
          flipV: b[1] < a[1],
          line: {
            color: rgb(n.stroke),
            width: n.strokeWidth * 0.72,
            beginArrowType: n.headStart && i === 1 ? "triangle" : undefined,
            endArrowType:
              n.headEnd !== false && i === pts.length - 1
                ? "triangle"
                : undefined,
            dashType: n.dash === "dot" ? "sysDot" : n.dash || "solid",
            transparency: (1 - n.opacity) * 100,
          },
          objectName: n.id + " " + n.name,
        });
      }
    } else if (n.type === "image") {
      const data = n.crop && cropImage ? await cropImage(n) : n.src;
      slide.addImage({ ...common, data });
    } else
      slide.addShape(
        n.type === "ellipse"
          ? p.ShapeType.ellipse
          : n.type === "diamond"
            ? p.ShapeType.diamond
            : n.radius
              ? p.ShapeType.roundRect
              : p.ShapeType.rect,
        {
          ...common,
          rectRadius: n.radius * scale,
          fill: {
            color: rgb(n.fill),
            transparency:
              n.fill === "none" || n.fill === "transparent"
                ? 100
                : (1 - n.opacity) * 100,
          },
          line: {
            color: rgb(n.stroke),
            width: n.stroke === "none" ? 0 : n.strokeWidth * 0.72,
            beginArrowType: n.type==='path'&&n.headStart?'triangle':undefined,
            endArrowType: n.type==='path'&&n.headEnd?'triangle':undefined,
            dashType: n.dash === "dot" ? "sysDot" : n.dash || "solid",
            transparency: n.stroke === "none" ? 100 : (1 - n.opacity) * 100,
          },
        },
      );
  }
  return p;
}
export async function pptxBytes(scene, options = {}) {
  scene=pptxScene(scene);
  const p = await createPptx(scene, options);
  const zip = await JSZip.loadAsync(
    await p.write({ outputType: "arraybuffer" }),
  );
  let xml = await zip.file("ppt/slides/slide1.xml").async("text"),
    groupId = 10000;
  for (const n of scene.nodes.filter((n) => n.visible && n.type === "arrow")) {
    const parts = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
      .map((m) => m[0])
      .filter((s) => s.includes(`name="${esc(n.id)} `));
    if (!parts.length) continue;
    const pts = arrowPoints(n, scene.nodes),
      xs = pts.map((v) => v[0]),
      ys = pts.map((v) => v[1]);
    const x = Math.round((Math.min(...xs) - 12) * 9144),
      y = Math.round((Math.min(...ys) - 12) * 9144),
      w = Math.round((Math.max(...xs) - Math.min(...xs) + 24) * 9144),
      h = Math.round((Math.max(...ys) - Math.min(...ys) + 24) * 9144);
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${groupId++}" name="${esc(n.id + " " + n.name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${parts.join("")}</p:grpSp>`;
    for (const segment of parts.slice(1)) xml = xml.replace(segment, "");
    xml = xml.replace(parts[0], group);
  }
  for (const n of scene.nodes.filter((n) => n.visible && n.type === "path")) {
    const shape = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
      .map((m) => m[0])
      .find((s) => s.includes(`name="${esc(n.id)} `));
    if (!shape) continue;
    const pt = (x, y) =>
      `<a:pt x="${Math.round(x * 100000)}" y="${Math.round(y * 100000)}"/>`;
    const commands = n.commands
      .map((c) => {
        const a = c.values;
        if (c.cmd === "Z") return "<a:close/>";
        const tag = { M: "moveTo", L: "lnTo", C: "cubicBezTo", Q: "quadBezTo" }[
          c.cmd
        ];
        let points = "";
        for (let i = 0; i < a.length; i += 2) points += pt(a[i], a[i + 1]);
        return `<a:${tag}>${points}</a:${tag}>`;
      })
      .join("");
    const geometry = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="w" b="h"/><a:pathLst><a:path w="100000" h="100000">${commands}</a:path></a:pathLst></a:custGeom>`;
    xml = xml.replace(
      shape,
      shape.replace(/<a:prstGeom[^>]*>[\s\S]*?<\/a:prstGeom>/, geometry).replace(/<a:ln\b(?!To)([^>]*)>/,'<a:ln cap="rnd"$1>'),
    );
  }
  const gradXml=(g,opacity)=>`<a:gradFill rotWithShape="1"><a:gsLst>${g.stops.map(s=>`<a:gs pos="${Math.round(s.offset*100000)}"><a:srgbClr val="${rgb(s.color)}"><a:alpha val="${Math.round(opacity*100000)}"/></a:srgbClr></a:gs>`).join('')}</a:gsLst><a:lin ang="${Math.round(g.angle*60000)}" scaled="0"/><a:tileRect/></a:gradFill>`;
  for(const n of scene.nodes.filter(n=>n.visible && (n.fillGradient||n.strokeGradient||n.type==='rect'))) {
    const shape=[...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(m=>m[0]).find(s=>s.includes(`name="${esc(n.id)} `));
    if(!shape)continue;
    let changed=shape;
    if(n.type==='rect' && n.radius>0)changed=changed.replace(/<a:prstGeom[^>]*>[\s\S]*?<\/a:prstGeom>/,`<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(.5,n.radius/Math.min(n.w,n.h))*100000)}"/></a:avLst></a:prstGeom>`);
    changed=changed.replace(/<p:spPr>([\s\S]*?)<\/p:spPr>/,(all,inside)=>{
      const index=inside.search(/<a:ln\b/),before=index<0?inside:inside.slice(0,index),after=index<0?'':inside.slice(index);
      const fillPattern=/<a:solidFill>[\s\S]*?<\/a:solidFill>|<a:noFill\s*\/>/;
      const fill=n.fillGradient?before.replace(fillPattern,gradXml(n.fillGradient,n.opacity)):before;
      const line=n.strokeGradient?after.replace(/<a:ln\b([^>]*)>([\s\S]*?)<\/a:ln>/,(a,attrs,content)=>`<a:ln${attrs}>${content.replace(fillPattern,gradXml(n.strokeGradient,n.opacity))}</a:ln>`):after;
      return '<p:spPr>'+fill+line+'</p:spPr>';
    });
    xml=xml.replace(shape,changed);
  }
  const iconGroups=new Map();
  for(const n of scene.nodes.filter(n=>n.visible&&n.groupId?.startsWith('vector-icon-'))){if(!iconGroups.has(n.groupId))iconGroups.set(n.groupId,[]);iconGroups.get(n.groupId).push(n);}
  for(const [name,members] of iconGroups){
    if(members.length<2)continue;
    const parts=members.map(n=>[...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(m=>m[0]).find(s=>s.includes(`name="${esc(n.id)} `))).filter(Boolean);
    if(parts.length!==members.length)continue;
    const left=Math.min(...members.map(n=>n.x)),top=Math.min(...members.map(n=>n.y)),right=Math.max(...members.map(n=>n.x+n.w)),bottom=Math.max(...members.map(n=>n.y+n.h));
    const x=Math.round(left*9144),y=Math.round(top*9144),w=Math.round((right-left)*9144),h=Math.round((bottom-top)*9144);
    const group=`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${groupId++}" name="${esc(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${parts.join('')}</p:grpSp>`;
    for(const part of parts.slice(1))xml=xml.replace(part,'');xml=xml.replace(parts[0],group);
  }
  zip.file("ppt/slides/slide1.xml", xml);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export async function loadImage(src) {
  const im = new Image();
  im.src = src;
  await im.decode();
  return im;
}
export async function cropRaster(n) {
  const im = await loadImage(n.src),
    c = n.crop || { x: 0, y: 0, w: 1, h: 1 };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(im.naturalWidth * c.w));
  canvas.height = Math.max(1, Math.round(im.naturalHeight * c.h));
  canvas
    .getContext("2d")
    .drawImage(
      im,
      c.x * im.naturalWidth,
      c.y * im.naturalHeight,
      c.w * im.naturalWidth,
      c.h * im.naturalHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return canvas.toDataURL("image/png");
}
export async function exportFigure(scene, format) {
  const name = scene.name.replace(/[<>:"/\\|?*]/g, "_");
  if (format === "json")
    return download(
      new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" }),
      name + ".figure.json",
    );
  if (format === "svg")
    return download(
      new Blob([sceneSvg(scene)], { type: "image/svg+xml;charset=utf-8" }),
      name + ".svg",
    );
  if (format === "pptx") {
    return download(
      new Blob([await pptxBytes(scene, { cropImage: cropRaster })], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      name + ".pptx",
    );
  }
  const svg = new Blob([sceneSvg(scene)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svg);
  try {
    const im = await loadImage(url),
      canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = Math.round((scene.height / scene.width) * 2400);
    canvas.getContext("2d").drawImage(im, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw Error("PNG 导出失败");
    download(blob, name + ".png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
