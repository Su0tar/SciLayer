import express from "express";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { template, validateScene } from "./src/model.js";
import { normalizeWorkflow, workflowPlan } from "./src/workflow.js";
import { SCENE_GUIDE, parseAIJSON } from "./src/ai-schema.js";
import { applyOperations } from "./src/operations.js";
import { exportBytes, mimeTypes } from "./server-export.mjs";
import {vectorizeIcons} from './server-icons.mjs';
import {assessImageQuality} from './server-quality.mjs';
import {listExamples,readExample} from './server-demos.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const data = (process.env.SCILAYER_DATA_DIR || process.env.FIGURE_DATA_DIR) || path.join(root, "data");
await mkdir(data, { recursive: true });
const token = randomBytes(32).toString("hex");
await writeFile(path.join(data, "bridge-token"), token, { mode: 0o600 });
let scene = template(),
  revision = 0;
try {
  scene = validateScene(
    JSON.parse(await readFile(path.join(data, "current.figure.json"), "utf8")),
  );
} catch {}
let selected = [],
  activity = [],
  history = [];
try {
  const saved = JSON.parse(
    await readFile(path.join(data, "state.snapshot.json"), "utf8"),
  );
  scene = validateScene(saved.scene);
  revision = saved.revision;
  activity = saved.activity || [];
} catch {}
try {
  history = JSON.parse(await readFile(path.join(data, "history.json"), "utf8"));
} catch {}
const clients = new Set();
const broadcast = (event) => {
  for (const response of clients)
    response.write(`data: ${JSON.stringify(event)}\n\n`);
};
let reference = null;
try {
  reference = JSON.parse(
    await readFile(path.join(data, "reference.json"), "utf8"),
  );
} catch {}
const app = express();
let workflow = normalizeWorkflow();
try { workflow = normalizeWorkflow(JSON.parse(await readFile(path.join(data, 'workflow.json'), 'utf8'))); } catch {}
let workflowQueue = Promise.resolve();
const port = Number(process.env.PORT || 4317);
const origin = `http://127.0.0.1:${port}`;
app.use("/api", (req, res, next) => {
  const o = req.get("Origin"),
    host = req.hostname;
  if (
    !["127.0.0.1", "localhost"].includes(host) ||
    (o && o !== origin && o !== `http://localhost:${port}`)
  )
    return res.status(403).json({ error: "仅允许本机工作台访问" });
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "30mb" }));
app.get("/api/status", (req, res) =>
  res.json({
    ok: true,
    application: "scilayer",
    version: "0.6.0",
    token,
    revision,
    configured: !!(process.env.SCILAYER_API_KEY || process.env.FIGURE_API_KEY),
    model: (process.env.SCILAYER_MODEL || process.env.FIGURE_MODEL) || "",
    baseURL: (process.env.SCILAYER_API_BASE || process.env.FIGURE_API_BASE) || "",
  }),
);
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.get("Authorization") !== `Bearer ${token}`)
    return res.status(401).json({ error: "工作台会话已过期，请刷新页面" });
  next();
});
app.get("/api/scene", (req, res) => res.json({ scene, revision }));
app.get('/api/examples',(req,res)=>res.json({examples:listExamples()}));
app.get('/api/examples/:id',async(req,res,next)=>{
  try{res.json(await readExample(req.params.id));}catch(e){next(e);}
});
app.get('/api/image-quality',async(req,res,next)=>{try{
  if(!reference?.src)throw Error('请先上传参考图');
  res.json(await assessImageQuality(Buffer.from(reference.src.split(',')[1],'base64')));
}catch(e){next(e);}});
app.post('/api/vectorize-icons',async(req,res,next)=>{try{const snapshot=scene,baseRevision=revision;res.json({...await vectorizeIcons(snapshot,req.body.ids||[],{kind:req.body.kind}),revision:baseRevision});}catch(e){next(e);}});
app.get("/api/state", (req, res) =>
  res.json({ scene, revision, reference, selected, activity, workflow }),
);
app.get('/api/workflow', (req, res) => res.json(workflowPlan(workflow)));
app.put('/api/workflow', (req, res, next) => {
  const operation = workflowQueue.then(async () => {
    const candidate = normalizeWorkflow(req.body);
    const target = path.join(data, 'workflow.json');
    await writeFile(target + '.tmp', JSON.stringify(candidate));
    await rename(target + '.tmp', target);
    workflow = candidate;
    res.json(workflowPlan(workflow));
    broadcast({ revision, workflow: true });
  });
  workflowQueue = operation.catch(() => {});
  operation.catch(next);
});
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ revision })}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => {
    clients.delete(res);
    clearInterval(heartbeat);
  });
});
app.put("/api/selection", (req, res) => {
  if (!Array.isArray(req.body.ids))
    return res.status(400).json({ error: "选区格式无效" });
  selected = req.body.ids.filter((id) => scene.nodes.some((n) => n.id === id));
  res.json({ selected });
  broadcast({ revision, selection: true });
});
app.get("/api/history", (req, res) =>
  res.json({
    history: history.map(({ scene, ...entry }) => ({
      ...entry,
      objects: scene.nodes.length,
    })),
  }),
);
app.get("/api/reference", (req, res) => res.json({ reference }));
app.put("/api/reference", async (req, res, next) => {
  try {
    const r = req.body.reference;
    if(r===null){reference=null;await writeFile(path.join(data,'reference.json'),'null');res.json({ok:true});broadcast({revision,reference:true});return;}
    if (
      !r ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
        r.src || "",
      ) ||
      !Number.isFinite(r.width) ||
      !Number.isFinite(r.height)
    )
      throw Error("参考图无效");
    reference = {
      src: r.src,
      name: String(r.name || "参考图"),
      width: r.width,
      height: r.height,
    };
    await writeFile(
      path.join(data, "reference.json"),
      JSON.stringify(reference),
    );
    res.json({ ok: true });
    broadcast({ revision, reference: true });
  } catch (e) {
    next(e);
  }
});
let saveQueue = Promise.resolve();
function mutate(req, res, next, build) {
  const operation = saveQueue.then(async () => {
    if (req.body.revision !== revision)
      return res
        .status(409)
        .json({ error: "画布版本已更新，请重新读取后合并修改", revision });
    const candidate = validateScene(await build());
    const actor = String(req.body.actor || "codex").slice(0, 120),
      time = new Date().toISOString();
    const entry = {
      id: randomBytes(8).toString("hex"),
      revision,
      time,
      actor,
      scene,
    };
    const nextHistory = [entry, ...history].slice(0, 50);
    await writeFile(
      path.join(data, "history.json"),
      JSON.stringify(nextHistory),
    );
    const nextActivity = [
      { revision: revision + 1, time, actor, objects: candidate.nodes.length },
      ...activity,
    ].slice(0, 20);
    const temp = path.join(data, "current.figure.json.tmp");
    await writeFile(temp, JSON.stringify(candidate, null, 2));
    const snapshotTemp = path.join(data, "state.snapshot.json.tmp");
    await writeFile(
      snapshotTemp,
      JSON.stringify({
        scene: candidate,
        revision: revision + 1,
        activity: nextActivity,
      }),
    );
    await rename(snapshotTemp, path.join(data, "state.snapshot.json"));
    try {
      await rename(temp, path.join(data, "current.figure.json"));
    } catch {
      console.error(
        "Scene snapshot saved; compatibility JSON mirror could not be replaced.",
      );
    }
    scene = candidate;
    revision++;
    history = nextHistory;
    selected = selected.filter((id) => scene.nodes.some((n) => n.id === id));
    activity = nextActivity;
    broadcast({ revision, actor });
    res.json({ ok: true, revision });
  });
  saveQueue = operation.catch(() => {});
  operation.catch(next);
}
app.put("/api/scene", (req, res, next) =>
  mutate(req, res, next, () => req.body.scene),
);
app.post("/api/operations", (req, res, next) =>
  mutate(req, res, next, () => applyOperations(scene, req.body.operations)),
);
app.post("/api/restore", (req, res, next) =>
  mutate(req, res, next, () => {
    const entry = history.find((h) => h.id === req.body.id);
    if (!entry) throw Error("历史版本不存在");
    return entry.scene;
  }),
);
app.post("/api/export", async (req, res, next) => {
  try {
    const { scene: input, format, nativeText = true, width = 2400 } = req.body;
    if (!mimeTypes[format]) throw Error("不支持的导出格式");
    const snapshot = validateScene(input || scene);
    const bytes = await exportBytes(snapshot, format, {
      nativeText,
      width: Math.max(100, Math.min(4000, Number(width) || 2400)),
    });
    res.setHeader("Content-Type", mimeTypes[format]);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(snapshot.name + "." + format)}`,
    );
    res.send(bytes);
  } catch (e) {
    next(e);
  }
});
app.post("/api/ai", async (req, res, next) => {
  try {
    const {
      prompt,
      reference,
      config = {},
      scene: current,
      selected = [],
    } = req.body;
    if (typeof prompt !== "string" || prompt.length > 20000)
      throw Error("请输入有效指令（最多20000字）");
    const key = config.key || (process.env.SCILAYER_API_KEY || process.env.FIGURE_API_KEY);
    const base = (config.baseURL || (process.env.SCILAYER_API_BASE || process.env.FIGURE_API_BASE) || "").replace(
      /\/$/,
      "",
    );
    const model = config.model || (process.env.SCILAYER_MODEL || process.env.FIGURE_MODEL);
    if (!key || !base || !model)
      return res.status(428).json({
        error:
          "请先在「模型连接」中设置兼容接口地址、模型与 API Key。普通编辑、本地指令和导出无需模型。",
      });
    const endpoint = new URL(base + "/chat/completions");
    if (!["http:", "https:"].includes(endpoint.protocol))
      throw Error("接口地址需要 http 或 https");
    if (
      reference &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(reference)
    )
      throw Error("参考图格式无效");
    const clean = current ? validateScene(current) : null;
    const summary = clean
      ? {
          ...clean,
          nodes: clean.nodes.map((n) =>
            n.type === "image" ? { ...n, src: "EXISTING:" + n.id } : n,
          ),
        }
      : null;
    const content = [
      {
        type: "text",
        text:
          prompt +
          (summary
            ? "\n当前画布JSON（保留未要求修改的对象，src EXISTING:id 引用原图）:\n" +
              JSON.stringify(summary)
            : "") +
          "\n选中对象ID:" +
          JSON.stringify(selected),
      },
    ];
    if (reference)
      content.push({ type: "image_url", image_url: { url: reference } });
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SCENE_GUIDE },
          { role: "user", content },
        ],
        max_tokens: 16000,
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (!upstream.ok) {
      return res.status(502).json({
        error: `模型服务返回 HTTP ${upstream.status}。请检查接口、模型权限或额度。`,
      });
    }
    const response = await upstream.json();
    const output = parseAIJSON(response.choices?.[0]?.message?.content || "");
    for (const n of output.nodes || []) {
      if (n.type === "image") {
        if (n.src === "REFERENCE" && reference) n.src = reference;
        else if (n.src?.startsWith("EXISTING:")) {
          const old = clean?.nodes.find(
            (v) => v.id === n.src.slice(9) && v.type === "image",
          );
          if (!old) throw Error("模型引用了不存在的图片");
          n.src = old.src;
        }
      }
    }
    res.json({
      scene: validateScene(output),
      message: "模型已生成可编辑对象。请检查标注和结构，确认后应用。",
    });
  } catch (e) {
    if (e.name === "TimeoutError")
      return res.status(504).json({ error: "模型请求超时，画布未修改。" });
    next(e);
  }
});
if (process.argv.includes("--production"))
  app.use(express.static(path.join(root, "dist")));
else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((err, req, res, next) =>
  res.status(400).json({
    error:
      err.type === "entity.too.large"
        ? "文件过大，请使用30MB以下图片"
        : err.message || "请求失败",
  }),
);
app.listen(port, "127.0.0.1", () =>
  console.log(`SciLayer ready: ${origin}`),
);
