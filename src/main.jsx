import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Workflow,
  Sparkles,
  Type,
  Square,
  Circle,
  Diamond,
  ArrowUpRight,
  ImagePlus,
  Undo2,
  Redo2,
  Download,
  ChevronDown,
  Settings2,
  Terminal,
  Upload,
  FileJson,
  CheckCheck,
  Copy,
  Scissors,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  PanelLeft,
  History,
  Link2,
  Plus,
  Check,
  AlertTriangle,
  Group,
  Ungroup,
} from "lucide-react";
import {
  node,
  uid,
  clone,
  template,
  validateScene,
  arrowPoints,
  applyLocalCommand,
} from "./model.js";
import {
  applyOperations,
  duplicateNodes,
  alignNodes,
  pathNode,
  moveNodes,
} from "./operations.js";
import { auditScene, sceneSvg } from "./render.js";
import { download, loadImage } from "./export.js";
import { WorkbenchStore } from "./store.js";
import {
  createTransport,
  isMcpApp,
  mcpCall,
  sendToConversation,
} from "./api.js";
import { EditorCanvas } from "./EditorCanvas.jsx";
import { Inspector } from "./Inspector.jsx";
import { SCENE_GUIDE } from "./ai-schema.js";
import { workflowPlan } from './workflow.js';
import "./editor.css";
const Button = ({ icon: Icon, label, active, ...props }) => (
  <button
    className={"tool-button " + (active ? "on" : "")}
    aria-label={label}
    title={label}
    {...props}
  >
    {Icon && <Icon size={17} strokeWidth={1.7} />}
  </button>
);
function localStorageSafe() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function App() {
  const transport = useMemo(() => createTransport(), []),
    store = useMemo(
      () => new WorkbenchStore(transport, { storage: localStorageSafe() }),
      [transport],
    );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot),
    { scene, selected } = state;
  const [leftOpen, setLeftOpen] = useState(false),
    [referenceView, setReferenceView] = useState(new URLSearchParams(window.location.search).get('view')==='reference'),
    [modal, setModal] = useState(null),
    [prompt, setPrompt] = useState(""),
    [toast, setToast] = useState(""),
    [exportOpen, setExportOpen] = useState(false),
    [exporting, setExporting] = useState(""),
    [snap, setSnap] = useState(false),
    [showReference, setShowReference] = useState(false),
    [checks, setChecks] = useState(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(null),
    [history, setHistory] = useState([]),
    [examples,setExamples] = useState([]),
    [config, setConfig] = useState({ baseURL: "", model: "", key: "" }),
    [cropSource, setCropSource] = useState(null),
    [crop, setCrop] = useState(null),
    [messages, setMessages] = useState([]);
  const file = useRef(),
    projectFile = useRef(),
    replaceTarget = useRef(),
    cropSvg = useRef(),
    cropDrag = useRef();
  const active = scene.nodes.find((n) => n.id === selected[0]);
  const notify = (message) => setToast(message);
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  useEffect(() => {
    if (state.status.baseURL || state.status.model)
      setConfig((c) => ({
        ...c,
        baseURL: state.status.baseURL || "",
        model: state.status.model || "",
      }));
  }, [state.status]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4300);
    return () => clearTimeout(t);
  }, [toast]);
  function commit(next, options) {
    try {
      store.edit(next, options);
      setChecks(null);
    } catch (e) {
      notify(e.message);
    }
  }
  function property(key, value) {
    const s = store.state.scene,
      ids = store.state.selected;
    const textKeys = [
      "text",
      "fontSize",
      "lineHeight",
      "fontFamily",
      "bold",
      "italic",
      "align",
      "wrap",
      "color",
    ];
    const next = {
      ...s,
      nodes: s.nodes.map((n) => {
        if (
          !ids.includes(n.id) ||
          n.locked ||
          (textKeys.includes(key) && n.type !== "text")
        )
          return n;
        let v = n;
        if (
          n.type === "arrow" &&
          (n.from || n.to) &&
          ["x", "y", "w", "h"].includes(key)
        )
          v = pathNode(n, arrowPoints(n, s.nodes));
        v = { ...v, [key]: value };
        if (['fill','stroke'].includes(key) && ['none','transparent'].includes(value)) delete v[key+'Gradient'];
        if (key === "text") {
          v.name = value.slice(0, 120);
          if (!v.wrap) {
            const ctx = document.createElement("canvas").getContext("2d");
            ctx.font = `${v.bold ? "bold " : ""}${v.fontSize}px "${v.fontFamily}"`;
            v.w = Math.max(
              v.w,
              ...value.split("\n").map((t) => ctx.measureText(t).width + 4),
            );
            v.h = Math.max(
              v.h,
              (value.split("\n").length - 1) * v.fontSize * v.lineHeight +
                v.fontSize +
                3,
            );
          }
        }
        return v;
      }),
    };
    commit(next, { coalesce: ids.join(",") + key });
  }
  function add(type) {
    const s = store.state.scene;
    let n;
    if (type === "arrow" && store.state.selected.length === 2)
      n = node("arrow", {
        from: store.state.selected[0],
        to: store.state.selected[1],
        fill: "none",
      });
    else
      n = node(type, {
        x: s.width / 2 - 100,
        y: s.height / 2 - 40,
        text: type === "text" ? "双击编辑文字" : "",
        name: type === "text" ? "新文字" : undefined,
        fill: type === "text" || type === "arrow" ? "none" : "#edf4ef",
        stroke: type === "text" ? "none" : "#427761",
        h: 80,
      });
    commit({ ...s, nodes: [...s.nodes, n] });
    store.select([n.id]);
  }
  function remove() {
    try {
      const ids = store.state.selected.filter(
        (id) => !store.state.scene.nodes.find((n) => n.id === id)?.locked,
      );
      commit(
        applyOperations(
          store.state.scene,
          ids.map((id) => ({ type: "delete", id })),
        ),
      );
      store.select([]);
    } catch (e) {
      notify(e.message);
    }
  }
  function duplicate() {
    const result = duplicateNodes(store.state.scene, store.state.selected);
    if (result.ids.length) {
      commit(result.scene);
      store.select(result.ids);
    }
  }
  function reorder(up) {
    const s = clone(store.state.scene),
      ids = store.state.selected;
    if (up) {
      for (let i = s.nodes.length - 2; i >= 0; i--)
        if (
          ids.includes(s.nodes[i].id) &&
          !s.nodes[i].locked &&
          !ids.includes(s.nodes[i + 1].id)
        )
          [s.nodes[i], s.nodes[i + 1]] = [s.nodes[i + 1], s.nodes[i]];
    } else {
      for (let i = 1; i < s.nodes.length; i++)
        if (
          ids.includes(s.nodes[i].id) &&
          !s.nodes[i].locked &&
          !ids.includes(s.nodes[i - 1].id)
        )
          [s.nodes[i], s.nodes[i - 1]] = [s.nodes[i - 1], s.nodes[i]];
    }
    commit(s);
  }
  function group() {
    if (selected.length < 2) return;
    const id = uid();
    commit({
      ...scene,
      nodes: scene.nodes.map((n) =>
        selected.includes(n.id) && !n.locked ? { ...n, groupId: id } : n,
      ),
    });
  }
  function ungroup() {
    const ids = new Set(
      scene.nodes
        .filter((n) => selected.includes(n.id))
        .map((n) => n.groupId)
        .filter(Boolean),
    );
    commit({
      ...scene,
      nodes: scene.nodes.map((n) =>
        ids.has(n.groupId) ? { ...n, groupId: undefined } : n,
      ),
    });
  }
  useEffect(() => {
    const key = (e) => {
      if (
        e.target.closest(
          "input,textarea,select,[contenteditable],[role=dialog]",
        ) ||
        modal ||
        pending ||
        state.conflict
      )
        return;
      const ctrl = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (ctrl && k === "z") {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      } else if (ctrl && k === "y") {
        e.preventDefault();
        store.redo();
      } else if (ctrl && k === "a") {
        e.preventDefault();
        store.select(
          store.state.scene.nodes
            .filter((n) => n.visible && !n.locked)
            .map((n) => n.id),
        );
      } else if (ctrl && k === "d") {
        e.preventDefault();
        duplicate();
      } else if (ctrl && k === "g") {
        e.preventDefault();
        e.shiftKey ? ungroup() : group();
      } else if (ctrl && k === "s") {
        e.preventDefault();
        doExport("json");
      } else if (["Delete", "Backspace"].includes(e.key)) {
        e.preventDefault();
        remove();
      } else if (e.key === "Escape") store.select([]);
      else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        commit(
          moveNodes(
            store.state.scene,
            store.state.selected,
            e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0,
            e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0,
          ),
          { coalesce: "nudge" },
        );
      }
    };
    const paste = (e) => {
      if (e.target.closest("input,textarea,[contenteditable]")) return;
      const item = [...e.clipboardData.items].find((i) =>
        i.type.startsWith("image/"),
      );
      if (item) {
        e.preventDefault();
        importImage(item.getAsFile(), true);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("paste", paste);
    };
  });
  async function importImage(f, toCanvas = false) {
    try {
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) throw Error("单张图片请小于20MB");
      if (!["image/png", "image/jpeg", "image/webp"].includes(f.type))
        throw Error("支持PNG、JPEG、WebP");
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const im = await loadImage(src),
        r = {
          src,
          name: f.name || "剪贴板图片",
          width: im.naturalWidth,
          height: im.naturalHeight,
        };
      const s = store.state.scene;
      if (replaceTarget.current) {
        const id = replaceTarget.current;
        replaceTarget.current = null;
        commit({
          ...s,
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, src, crop: undefined, name: r.name } : n,
          ),
        });
        notify("图片已替换");
        return;
      }
      await store.setReference(r);
      if (toCanvas) {
        const w = Math.min(600, s.width * 0.6),
          n = node("image", {
            src,
            name: r.name,
            x: 50,
            y: 50,
            w,
            h: (w * r.height) / r.width,
            stroke: "none",
          });
        commit({ ...s, nodes: [...s.nodes, n] });
        store.select([n.id]);
      } else setLeftOpen(true);
      notify("图片已载入，本地参考图已保存");
    } catch (e) {
      notify(e.message);
    }
  }
  async function cropImage(n) {
    try {
      const src = n?.src || state.reference?.src;
      if (!src) throw Error("请先上传参考图");
      const im = await loadImage(src);
      setCropSource({
        src,
        width: im.naturalWidth,
        height: im.naturalHeight,
        node: n || null,
      });
      setCrop(
        n?.crop
          ? {
              x: n.crop.x * im.naturalWidth,
              y: n.crop.y * im.naturalHeight,
              w: n.crop.w * im.naturalWidth,
              h: n.crop.h * im.naturalHeight,
            }
          : null,
      );
      setModal("crop");
    } catch (e) {
      notify(e.message);
    }
  }
  function cropPoint(e) {
    const p = cropSvg.current.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(cropSvg.current.getScreenCTM().inverse());
    return {
      x: Math.max(0, Math.min(cropSource.width, q.x)),
      y: Math.max(0, Math.min(cropSource.height, q.y)),
    };
  }
  function applyCrop() {
    if (!crop || crop.w < 2 || crop.h < 2) return;
    const c = {
      x: crop.x / cropSource.width,
      y: crop.y / cropSource.height,
      w: crop.w / cropSource.width,
      h: crop.h / cropSource.height,
    };
    const s = store.state.scene;
    if (cropSource.node) {
      const n = cropSource.node;
      commit({
        ...s,
        nodes: s.nodes.map((v) =>
          v.id === n.id ? { ...v, crop: c, h: (v.w * crop.h) / crop.w } : v,
        ),
      });
    } else {
      const factor = Math.min(
          s.width / cropSource.width,
          s.height / cropSource.height,
        ),
        n = node("image", {
          name: "原图裁剪",
          src: cropSource.src,
          crop: c,
          x: crop.x * factor,
          y: crop.y * factor,
          w: crop.w * factor,
          h: crop.h * factor,
          stroke: "none",
        });
      commit({ ...s, nodes: [...s.nodes, n] });
      store.select([n.id]);
    }
    setModal(null);
  }
  async function changeWorkflow(changes) {
    if (busy) return;
    try { await store.setWorkflow({...store.state.workflow,...changes}); notify('偏好已保存；高清化仍需你单独确认'); }
    catch(e) { notify(e.message); }
  }
  async function inspectQuality() {
    if(busy)return;setBusy(true);
    try {
      await store.flush();
      const quality=isMcpApp()?await mcpCall('assess_image_quality'):await(await fetch('/api/image-quality')).json();
      if(quality.error)throw Error(quality.error);
      setMessages(m=>[...m,{role:'assistant',text:`清晰度初检：${quality.width} × ${quality.height}px。${quality.reasons.join('；')||quality.recommendation} 仅为尺寸与边缘统计，请结合原图检查小字；是否高清化由你决定。`}]);
    }catch(e){notify(e.message);}finally{setBusy(false);}
  }
  async function vectorizeSelection() {
    if(busy)return;setBusy(true);
    try {
      await store.flush();
      if(store.state.dirty||store.state.saving)throw Error('请等待画布保存完成后再识别');
      const source=JSON.stringify(store.state.scene);
      const result=await transport.vectorize(store.state.selected);
      if(JSON.stringify(store.state.scene)!==source || result.revision!==store.state.revision)throw Error('画布已更新，请重新识别');
      setPending({scene:validateScene(result.scene),source,title:'图标矢量化预览',note:result.matches.map(m=>`${m.id} → ${m.label}${m.needsReview?'（需重点核对）':''}`).join('；')+'。'+result.note});
    } catch(e){notify(e.message);}finally{setBusy(false);}
  }
  async function openProject(f) {
    try {
      if (!f) return;
      if (f.size > 30 * 1024 * 1024) throw Error("项目文件过大");
      commit(validateScene(JSON.parse(await f.text())));
      store.select([]);
      notify("项目已载入");
    } catch (e) {
      notify("载入失败：" + e.message);
    }
  }
  async function showExamples(){
    try{
      const d=await transport.examples();setExamples(d.examples);setModal('examples');
    }catch(e){notify('无法读取示例：'+e.message);}
  }
  async function previewExample(id){
    if(busy)return;
    setBusy(true);
    try{
      await store.flush();
      if(store.state.dirty||store.state.saving)throw Error('请等待当前画布保存完成');
      const source=JSON.stringify(store.state.scene),revision=store.state.revision;
      const example=await transport.example(id);
      setModal(null);
      setPending({scene:validateScene(example.scene),source,revision,example:true,title:example.name,
        note:example.description+' 载入将替换画布对象；原画布保存在历史中，也可撤销。你已上传的参考图会保留。'});
    }catch(e){notify(e.message);}finally{setBusy(false);}
  }
  async function doExport(format, nativeText = true) {
    setExportOpen(false);
    if (exporting) return;
    setExporting(format);
    try {
      const snapshot = clone(store.state.scene),
        blob = await transport.export(snapshot, format, { nativeText });
      const suffix =
        format === "json"
          ? ".figure"
          : format === "psd" && !nativeText
            ? "_像素图层.psd"
            : "." + format;
      download(blob, snapshot.name.replace(/[<>:"/\\|?*]/g, "_") + suffix);
      notify("已导出 " + format.toUpperCase() + "，使用当前画布的全部修改");
    } catch (e) {
      notify("导出失败：" + e.message);
    } finally {
      setExporting("");
    }
  }
  async function sendToCodex(text, pipeline = false) {
    const request =
      text +
      "\n请使用scilayer MCP读取当前画布和选区。保持对象ID，基于当前revision更新。若需拆图，读取get_reference_image和get_reconstruction_schema；完成后核对预览。" +
      (pipeline ? '\n先读取 get_workflow_plan，执行已保存的用户选择。\n' + workflowPlan(store.state.workflow).instruction : '');
    try {
      if (isMcpApp()) {
        await sendToConversation(request);
        notify("已发送到当前对话");
      } else if (window.openai?.sendFollowUpMessage) {
        await window.openai.sendFollowUpMessage({ prompt: request });
        notify("已发送到当前对话");
      } else {
        await navigator.clipboard.writeText(request);
        setModal("codex");
        notify("已复制指令，粘贴到旁边的Codex对话即可执行");
      }
    } catch (e) {
      notify(e.message);
    }
  }
  async function run(mode = "edit") {
    if (busy) return;
    const text =
      mode === "rebuild"
        ? '我已确认参考图，现在开始本次可编辑化：' +
          prompt
        : prompt.trim();
    if (!text) return;
    if (mode === 'rebuild') {
      if (!state.reference) return notify('请先上传你确认要进行可编辑化的参考图');
      await sendToCodex(text, true);
      return;
    }
    if (mode === "edit") {
      try {
        const result = applyLocalCommand(
          store.state.scene,
          text,
          store.state.selected,
        );
        commit(result.scene);
        setMessages((m) => [
          ...m,
          { role: "user", text },
          { role: "assistant", text: result.message + "（本地规则执行）" },
        ]);
        setPrompt("");
        return;
      } catch {}
    }
    if ((!config.key && !state.status.configured) || isMcpApp()) {
      await sendToCodex(text);
      return;
    }
    setBusy(true);
    const source = clone(store.state.scene);
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const result = await transport.ai({
        prompt: text,
        reference: state.reference?.src,
        scene: mode === "rebuild" ? undefined : source,
        selected,
        config,
      });
      setPending({
        scene: validateScene(result.scene),
        source: JSON.stringify(source),
      });
    } catch (e) {
      notify(e.message);
      setMessages((m) => [...m, { role: "error", text: e.message }]);
    } finally {
      setBusy(false);
    }
  }
  async function showHistory() {
    try {
      const d = isMcpApp()
        ? await mcpCall("get_history")
        : await (await fetch("/api/history")).json();
      setHistory(d.history);
      setModal("history");
    } catch (e) {
      notify(e.message);
    }
  }
  async function restore(entry) {
    try {
      await store.flush();
      if (isMcpApp())
        await mcpCall("restore_history", {
          id: entry.id,
          revision: store.state.revision,
        });
      else {
        const s = await (await fetch("/api/status")).json();
        const r = await fetch("/api/restore", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${s.token}`,
          },
          body: JSON.stringify({
            id: entry.id,
            revision: store.state.revision,
            actor: store.actor,
          }),
        });
        if (!r.ok) throw Error((await r.json()).error);
      }
      setModal(null);
      await store.refresh();
      notify("已恢复历史版本；本次恢复也可以撤销");
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <div className="editor-app">
      <header className="app-header">
        <div className="app-brand">
          <span>
            <Workflow size={21} />
          </span>
          SciLayer <small>LOCAL</small>
        </div>
        <input
          aria-label="项目名称"
          className="project-name"
          value={scene.name}
          onChange={(e) =>
            commit(
              { ...scene, name: e.target.value },
              { coalesce: "project-name" },
            )
          }
        />
        <div className="header-spacer" />
        <span className={"save-state " + (state.error ? "warn" : "")}>
          <span className="green-dot" />
          {!state.loaded
            ? "连接画布…"
            : state.error
              ? "保存需注意"
              : state.saving || state.dirty
                ? "保存中…"
                : "已保存 · r" + state.revision}
        </span>
        <button
          className="plain-button codex-button"
          onClick={() => setModal("codex")}
        >
          <Terminal size={15} />
          Codex / MCP
        </button>
        <div className="export-container">
          <button
            className="primary-button"
            onClick={() => setExportOpen(!exportOpen)}
            disabled={!!exporting}
          >
            <Download size={16} />
            {exporting ? "正在导出…" : "导出"}
            <ChevronDown size={13} />
          </button>
          {exportOpen && (
            <div className="export-menu">
              {[
                ["pptx", "PowerPoint", "原生文字、矢量形状与组合连线"],
                ["svg", "SVG矢量图", "完整保留可编辑对象"],
                ["psd", "PSD · 原生文字", "独立图层，含原生文字数据"],
                ["psd-pixel", "PSD · 像素图层", "每个对象一张透明图层"],
                ["png", "PNG高清预览", "2400px · 当前画布"],
                ["json", "项目源文件", "保留所有对象、路径和图片"],
              ].map(([format, title, desc]) => (
                <button
                  key={format}
                  onClick={() =>
                    doExport(
                      format === "psd-pixel" ? "psd" : format,
                      format !== "psd-pixel",
                    )
                  }
                >
                  <b>{title}</b>
                  <small>{desc}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className="app-toolbar">
        <Button
          icon={PanelLeft}
          label="显示或隐藏创作助手"
          active={leftOpen}
          onClick={() => setLeftOpen(!leftOpen)}
        />
        <span className="tool-divider" />
        {[
          [Type, "text", "添加文字"],
          [Square, "rect", "添加矩形"],
          [Circle, "ellipse", "添加椭圆"],
          [Diamond, "diamond", "添加菱形"],
          [ArrowUpRight, "arrow", "添加箭头（选两个对象可自动连接）"],
        ].map(([icon, type, label]) => (
          <Button
            key={type}
            icon={icon}
            label={label}
            onClick={() => add(type)}
          />
        ))}
        <Button
          icon={ImagePlus}
          label="插入图片"
          onClick={() => {
            replaceTarget.current = null;
            file.current.dataset.canvas = "yes";
            file.current.click();
          }}
        />
        <span className="tool-divider" />
        <Button
          icon={Undo2}
          label="撤销 Ctrl+Z"
          disabled={!state.undoCount}
          onClick={() => store.undo()}
        />
        <Button
          icon={Redo2}
          label="重做 Ctrl+Y"
          disabled={!state.redoCount}
          onClick={() => store.redo()}
        />
        <span className="tool-divider" />
        <Button
          icon={AlignLeft}
          label="左对齐所选对象"
          disabled={selected.length < 2}
          onClick={() => commit(alignNodes(scene, selected, "left"))}
        />
        <Button
          icon={AlignCenter}
          label="水平居中所选对象"
          disabled={selected.length < 2}
          onClick={() => commit(alignNodes(scene, selected, "center"))}
        />
        <Button
          icon={AlignRight}
          label="右对齐所选对象"
          disabled={selected.length < 2}
          onClick={() => commit(alignNodes(scene, selected, "right"))}
        />
        <Button
          icon={Group}
          label="组合 Ctrl+G"
          disabled={selected.length < 2}
          onClick={group}
        />
        <div className="toolbar-end">
          <button onClick={showExamples} disabled={busy||!state.loaded}>
            <Workflow size={15} />示例
          </button>
          <label>
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            4px吸附
          </label>
          <button
            onClick={() => {
              const result = auditScene(scene);
              setChecks(result);
              notify(
                result.length
                  ? `发现 ${result.length} 处几何问题，请逐项核对`
                  : "版式检查通过",
              );
            }}
          >
            <CheckCheck size={15} />
            检查
          </button>
          <button onClick={showHistory}>
            <History size={15} />
            历史
          </button>
          <button onClick={() => projectFile.current.click()}>
            <FileJson size={15} />
            打开
          </button>
        </div>
      </div>
      <div className="editor-body">
        {leftOpen && (
          <aside className="assistant-panel">
            <div className="assistant-title">
              <Sparkles size={17} />
              <b>科研图形助手</b>
              <button
                onClick={() => setModal("settings")}
                aria-label="模型连接"
              >
                <Settings2 size={15} />
              </button>
            </div>
            <div className="assistant-scroll">
              <p className="assistant-intro">
                当前画布与Codex共用同一份对象数据。基础修改可直接执行；复杂要求交给旁边的对话。
              </p>
              <button className="example-button" onClick={showExamples} disabled={busy||!state.loaded}>
                <Workflow size={17}/><span><b>内置示例</b><small>医学插画分层 · 规划矢量框图</small></span>
              </button>
              <div className="assistant-section">
                参考图 <small>PNG / JPEG / WebP</small>
              </div>
              <button
                className={
                  "reference-upload " + (state.reference ? "has-image" : "")
                }
                onClick={() => {
                  replaceTarget.current = null;
                  file.current.dataset.canvas = "";
                  file.current.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  importImage(e.dataTransfer.files[0]);
                }}
              >
                {state.reference ? (
                  <>
                    <img src={state.reference.src} />
                    <small>{state.reference.name}</small>
                  </>
                ) : (
                  <>
                    <Upload size={22} />
                    <b>上传或拖入参考图</b>
                    <small>原图保留在本机</small>
                  </>
                )}
              </button>
              {state.reference && (
                <div className="reference-options">
                  <button onClick={()=>setReferenceView(true)}>查看参考图</button>
                  <button onClick={inspectQuality} disabled={busy}>检测清晰度</button>
                  <button onClick={() => cropImage(null)}>
                    <Scissors size={13} />
                    框选裁剪
                  </button>
                  <button onClick={() => setShowReference(!showReference)}>
                    参考叠加 {showReference ? "开" : "关"}
                  </button>
                </div>
              )}
              <div className="workflow-options">
                <label>插画处理<select aria-label="插画处理方式" value={state.workflow.restorationMode} disabled={busy || !state.loaded}
                  onChange={e => changeWorkflow({ restorationMode: e.target.value })}>
                  <option value="imagegen">imagegen 清晰重绘（推荐）</option><option value="local-sr">本地超分（需自行配置）</option><option value="original">保留原始像素</option>
                </select></label>
                <small>先检测清晰度，再决定是否高清化；此处仅保存偏好，不会自动重绘。确认图片后再开始可编辑化。</small>
              </div>
              <button
                className="primary-button rebuild"
                disabled={busy}
                onClick={() => run("rebuild")}
              >
                <Sparkles size={15} />
                {busy ? '处理中…' : '确认参考图，开始可编辑化'}
              </button>
              <p className="assistant-note">
                在 Codex 中由视觉模型理解结构，脚本保存与导出原生对象。
              </p>
              <button className="redraw-button" onClick={() => sendToCodex('请读取当前画布并用 export_figure 导出 PNG，按我的要求使用 imagegen 重绘这张图。可以按需要继续迭代，不限制次数。生成后展示结果，由我决定是否再次进行可编辑化。' + prompt)}>将当前画布交给 imagegen 重绘</button>
              <div className="assistant-section">试试修改选中的对象</div>
              {[
                "将选中的线改成虚线",
                "将选中对象改成蓝色",
                "将选中文字的字号改为24",
              ].map((text) => (
                <button
                  className="prompt-suggestion"
                  key={text}
                  onClick={() => setPrompt(text)}
                >
                  {text}
                  <ArrowUpRight size={13} />
                </button>
              ))}
              <div className="chat-messages">
                {messages.map((m, i) => (
                  <div className={"chat-message " + m.role} key={i}>
                    {m.text}
                  </div>
                ))}
              </div>
            </div>
            <div className="prompt-box">
              <textarea
                aria-label="修改指令"
                placeholder="描述修改要求，Ctrl+Enter执行…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    run();
                  }
                }}
              />
              <div>
                <button
                  className="model-status"
                  onClick={() => setModal("settings")}
                >
                  {config.key || state.status.configured
                    ? "视觉接口已设置"
                    : "Codex / 本地规则"}
                </button>
                <button
                  className="send-button"
                  aria-label="执行指令"
                  onClick={() => run()}
                  disabled={busy}
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>
            </div>
          </aside>
        )}
        {referenceView && state.reference ? <main className="canvas-region reference-preview">
          <div className="canvas-caption"><span>参考图预览 · 尚未可编辑化</span><button onClick={()=>setReferenceView(false)}>返回编辑画布</button></div>
          <div className="reference-preview-image"><img src={state.reference.src} alt={state.reference.name||'参考图'} /></div>
        </main> : <EditorCanvas
          store={store}
          state={state}
          snap={snap}
          onDrop={importImage}
          onEditText={() => {}}
          showReference={showReference}
        />}
        <Inspector
          state={state}
          store={store}
          setProperty={property}
          onDuplicate={duplicate}
          onDelete={remove}
          onReorder={reorder}
          onCrop={cropImage}
          onReplace={(n) => {
            replaceTarget.current = n.id;
            file.current.click();
          }}
          onGroup={group}
          onUngroup={ungroup}
          onVectorize={vectorizeSelection}
          onEnhanceIcons={()=>sendToCodex('请对当前选中的图标 '+JSON.stringify(store.state.selected)+' 使用 prepare_icon_atlas 合并成图集。用 imagegen 清晰化图集，保持槽位、含义和笔画结构，不增加文字或3D装饰；之后使用 vectorize_icon_atlas 按槽位识别回原生矢量，展示结果，由我确认是否应用。')}
        />
      </div>
      {(state.error || state.notice) && (
        <div
          className={"sync-banner " + (state.error ? "error" : "")}
          role="status"
        >
          {state.error || state.notice}
          {state.error && (
            <button
              onClick={() => {
                store.refresh();
                store.flush();
              }}
            >
              重试
            </button>
          )}
        </div>
      )}
      {checks && (
        <div className="checks-panel">
          <header>
            <b>版式检查 · {checks.length} 项</b>
            <button onClick={() => setChecks(null)}>
              <X size={15} />
            </button>
          </header>
          {checks.length ? (
            checks.slice(0, 35).map((c, i) => (
              <button key={i} onClick={() => store.select([c.id])}>
                <AlertTriangle size={13} />
                {c.message}
              </button>
            ))
          ) : (
            <p>未发现文字高度溢出、越界或连线穿过文字框。</p>
          )}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          importImage(e.target.files[0], e.target.dataset.canvas === "yes");
          e.target.value = "";
          e.target.dataset.canvas = "";
        }}
      />
      <input
        ref={projectFile}
        type="file"
        accept=".figure,.json"
        hidden
        onChange={(e) => {
          openProject(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <div
            className={"modal " + (modal === "crop" ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <b>
                {modal === "codex"
                  ? "Codex 与画布双向连接"
                  : modal === "settings"
                    ? "连接视觉模型"
                    : modal === "history"
                      ? "历史版本"
                      : modal === "examples"
                        ? "SciLayer · 内置示例"
                      : "裁剪原始图片"}
              </b>
              <button aria-label="关闭对话框" onClick={() => setModal(null)}>
                <X size={18} />
              </button>
            </header>
            {modal === "codex" ? (
              <>
                <p>
                  这张画布由本地MCP提供读写接口。你可以拖动、改字，也可以在旁边对话中说：
                </p>
                <blockquote>
                  使用
                  scilayer，读取我的选区，把选中箭头改成蓝色虚线，然后更新画布。
                </blockquote>
                <p>修改会同步到此处，并可导出PPTX、SVG或PSD。</p>
                <div className="callout">
                  已提供MCP
                  Apps面板资源。支持的宿主可以直接打开；浏览器面板与MCP操作使用相同本机服务。
                </div>
                <pre>
                  项目：你的 SciLayer 克隆目录
                  <br />
                  安装：npm run install:codex
                  <br />
                  读取：node scripts/bridge.mjs get
                </pre>
                <p className="muted">
                  本次新注册MCP后，现有对话可能需重新加载工具列表。当前对话也可通过项目桥接脚本操作同一画布。
                </p>
                <button
                  className="primary-button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      "请使用 $scilayer 和 scilayer MCP 读取当前画布和选区，按我的要求修改。若MCP尚未加载，请在实际克隆目录运行 npm run doctor 检查连接。",
                    );
                    notify("已复制");
                  }}
                >
                  <Copy size={14} />
                  复制使用指令
                </button>
              </>
            ) : modal === "examples" ? (
              <>
                <p>选择一个示例先预览。确认载入后，才能替换当前画布。</p>
                <div className="demo-list">
                  {examples.map(example=><button key={example.id} disabled={busy} onClick={()=>previewExample(example.id)}>
                    <Workflow size={22}/><span><b>{example.name}</b><small>{example.description}</small><small>{example.objects} 个可编辑对象 · 预览后载入</small></span><ArrowUpRight size={18}/>
                  </button>)}
                </div>
              </>
            ) : modal === "settings" ? (
              <>
                <p>
                  可选接入支持图像输入的Chat
                  Completions兼容服务。MCP方式直接由Codex处理，无需另填API Key。
                </p>
                <label className="form-field">
                  API Base URL
                  <input
                    value={config.baseURL}
                    placeholder="https://你的服务地址/v1"
                    onChange={(e) =>
                      setConfig({ ...config, baseURL: e.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  模型ID
                  <input
                    value={config.model}
                    onChange={(e) =>
                      setConfig({ ...config, model: e.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  API Key
                  <input
                    type="password"
                    autoComplete="off"
                    value={config.key}
                    onChange={(e) =>
                      setConfig({ ...config, key: e.target.value })
                    }
                  />
                </label>
                <p className="muted">
                  密钥只保留在本次页面内存。执行视觉请求时，参考图和画布会发送到你配置的服务。
                </p>
                <div className="modal-actions">
                  <button
                    onClick={() => {
                      setConfig({ ...config, key: "" });
                      setModal(null);
                    }}
                  >
                    清除密钥
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setModal(null)}
                  >
                    保存本次连接
                  </button>
                </div>
              </>
            ) : modal === "history" ? (
              <>
                <p>最近50次保存。恢复操作也会创建历史记录。</p>
                <div className="history-list">
                  {history.length ? (
                    history.map((h) => (
                      <button key={h.id} onClick={() => restore(h)}>
                        <History size={16} />
                        <span>
                          <b>
                            {h.actor.startsWith("ui")
                              ? "手动编辑"
                              : "Codex修改"}{" "}
                            · {h.objects}个对象
                          </b>
                          <small>
                            {new Date(h.time).toLocaleString("zh-CN", {
                              timeZone: "Asia/Shanghai",
                            })}{" "}
                            · r{h.revision}
                          </small>
                        </span>
                        <span>恢复</span>
                      </button>
                    ))
                  ) : (
                    <p>暂无历史版本</p>
                  )}
                </div>
              </>
            ) : (
              cropSource && (
                <>
                  <p>框选后保留原始像素。图片裁剪与文字、连线独立保存。</p>
                  <svg
                    ref={cropSvg}
                    className="crop-svg"
                    viewBox={`0 0 ${cropSource.width} ${cropSource.height}`}
                    onPointerDown={(e) => {
                      cropDrag.current = cropPoint(e);
                      setCrop({ ...cropDrag.current, w: 0, h: 0 });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (!cropDrag.current) return;
                      const p = cropPoint(e),
                        a = cropDrag.current;
                      setCrop({
                        x: Math.min(a.x, p.x),
                        y: Math.min(a.y, p.y),
                        w: Math.abs(a.x - p.x),
                        h: Math.abs(a.y - p.y),
                      });
                    }}
                    onPointerUp={() => (cropDrag.current = null)}
                  >
                    <image
                      href={cropSource.src}
                      width={cropSource.width}
                      height={cropSource.height}
                    />
                    {crop && (
                      <rect
                        {...crop}
                        fill="#3d805b33"
                        stroke="#3d805b"
                        strokeWidth={cropSource.width / 350}
                      />
                    )}
                  </svg>
                  <div className="modal-actions">
                    <button
                      className="primary-button"
                      disabled={!crop || crop.w < 2}
                      onClick={applyCrop}
                    >
                      <Scissors size={15} />
                      应用裁剪
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
      {pending && (
        <div className="modal-backdrop">
          <div className="modal wide" role="dialog" aria-modal="true" aria-label={pending.title||'重建结果预览'}>
            <header className="modal-header">
              <b>{pending.title||'视觉模型重建结果'} · {pending.scene.nodes.length} 个对象</b>
              <button aria-label="关闭预览" disabled={busy} onClick={() => setPending(null)}>
                <X size={18} />
              </button>
            </header>
            <p>检查后应用到画布，原版本可撤销。</p>
            {pending.note&&<p className="property-help">{pending.note}</p>}
            <img
              className="ai-result-preview"
              alt={pending.example?'示例预览':'重建结果预览'}
              src={
                "data:image/svg+xml;charset=utf-8," +
                encodeURIComponent(sceneSvg(pending.scene))
              }
            />
            <div className="modal-actions">
              <button disabled={busy} onClick={() => setPending(null)}>放弃</button>
              <button
                className="primary-button"
                disabled={busy}
                onClick={async () => {
                  if(pending.example){
                    setBusy(true);
                    try{
                      await store.loadExample(pending.scene,pending.source,pending.revision);
                      setReferenceView(false);setShowReference(false);setChecks(null);setPending(null);
                      notify('示例已载入，可编辑、撤销或导出');
                    }catch(e){notify(e.message);}finally{setBusy(false);}
                    return;
                  }
                  if (JSON.stringify(store.state.scene) !== pending.source)
                    return notify("生成期间画布已变化，请重新生成以避免覆盖。");
                  commit(pending.scene);
                  setPending(null);
                }}
              >
                {busy?'正在载入…':pending.example?'载入示例（保留原版本）':'应用重建结果'}
              </button>
            </div>
          </div>
        </div>
      )}
      {state.conflict && (
        <div className="modal-backdrop">
          <div className="modal">
            <header className="modal-header">
              <b>同一属性被同时修改</b>
            </header>
            <p>
              你的编辑和Codex对同一属性产生了不同结果。两份场景已保留，不会静默覆盖。
            </p>
            {state.conflict.conflicts.slice(0, 8).map((c, i) => (
              <div className="conflict-row" key={i}>
                <b>
                  {c.id} · {c.key}
                </b>
                <small>
                  你的修改：{JSON.stringify(c.local)?.slice(0, 100)}
                  <br />
                  远端修改：{JSON.stringify(c.remote)?.slice(0, 100)}
                </small>
              </div>
            ))}
            <div className="modal-actions">
              <button onClick={() => store.resolveConflict("remote")}>
                采用远端版本
              </button>
              <button
                className="primary-button"
                onClick={() => store.resolveConflict("local")}
              >
                保留我的版本
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
