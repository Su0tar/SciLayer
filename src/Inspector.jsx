import React, { useEffect, useState } from "react";
import {
  Type,
  Square,
  Circle,
  ArrowUpRight,
  ImagePlus,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  ChevronRight,
  ChevronDown,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Layers,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Scissors,
} from "lucide-react";
import { arrowPoints } from "./model.js";
import { pathNode, applyOperations } from "./operations.js";
import { ColorField, useScenePalette } from "./ColorField.jsx";
import {GradientField} from './GradientField.jsx';
export function NumberField({
  label,
  value,
  onChange,
  min = -16000,
  max = 16000,
  step = 1,
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(Math.round(value * 100) / 100));
  }, [value, focused]);
  function apply() {
    setFocused(false);
    const v = Number(draft);
    if (draft.trim() && Number.isFinite(v) && v >= min && v <= max) onChange(v);
    else setDraft(String(value));
  }
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
export function Inspector({
  state,
  store,
  setProperty,
  onDuplicate,
  onDelete,
  onReorder,
  onCrop,
  onReplace,
  onGroup,
  onUngroup,
  onVectorize,
  onEnhanceIcons,
}) {
  const { scene, selected } = state;
  const palette = useScenePalette(scene);
  const active = scene.nodes.find((n) => n.id === selected[0]);
  const [tab, setTab] = useState("properties"),
    [query, setQuery] = useState(""),
    [closed, setClosed] = useState(new Set()),
    [grouped, setGrouped] = useState(true);
  const set = (key, v) => setProperty(key, v);
  const groups = new Map();
  for (const n of [...scene.nodes].reverse()) {
    const name = grouped ? n.layerGroup || "未分组" : "全部对象";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(n);
  }
  const icon = (n) =>
    n.type === "text"
      ? Type
      : n.type === "arrow"
        ? ArrowUpRight
        : n.type === "image"
          ? ImagePlus
          : n.type === "ellipse"
            ? Circle
            : Square;
  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        <button
          className={tab === "properties" ? "on" : ""}
          onClick={() => setTab("properties")}
        >
          属性
        </button>
        <button
          className={tab === "layers" ? "on" : ""}
          onClick={() => setTab("layers")}
        >
          图层 <small>{scene.nodes.length}</small>
        </button>
      </div>
      <div className="inspector-content">
        {tab === "layers" ? (
          <>
            <div className="layer-search">
              <Search size={14} />
              <input
                aria-label="搜索图层"
                placeholder="搜索文字、名称或ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={grouped}
                onChange={(e) => setGrouped(e.target.checked)}
              />
              按原图分区显示
            </label>
            {[...groups].map(([name, ns]) => {
              const list = ns.filter(
                (n) =>
                  !query ||
                  (n.name + " " + n.text + " " + n.id)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              );
              if (!list.length) return null;
              const collapse = !query && closed.has(name);
              return (
                <section className="layer-section" key={name}>
                  <div className="layer-section-title">
                    <button
                      onClick={() =>
                        setClosed((prev) => {
                          const next = new Set(prev);
                          next.has(name) ? next.delete(name) : next.add(name);
                          return next;
                        })
                      }
                    >
                      {collapse ? (
                        <ChevronRight size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      )}
                      <span>{name}</span>
                      <small>{list.length}</small>
                    </button>
                    <button
                      title="选择整个分区"
                      aria-label={"选择分区 " + name}
                      onClick={() =>
                        store.select(
                          ns.filter((n) => !n.locked).map((n) => n.id),
                        )
                      }
                    >
                      <Layers size={12} />
                    </button>
                  </div>
                  {!collapse &&
                    list.map((n) => {
                      const Icon = icon(n);
                      return (
                        <div
                          key={n.id}
                          className={
                            "layer-row " +
                            (selected.includes(n.id) ? "selected" : "")
                          }
                        >
                          <button
                            className="layer-select"
                            title={n.id + " · " + n.name}
                            onClick={(e) =>
                              store.select(
                                e.shiftKey
                                  ? [...new Set([...selected, n.id])]
                                  : [n.id],
                              )
                            }
                          >
                            <Icon size={13} />
                            <span>{n.name}</span>
                          </button>
                          <button
                            aria-label={"显示或隐藏 " + n.id}
                            onClick={() =>
                              store.edit({
                                ...scene,
                                nodes: scene.nodes.map((v) =>
                                  v.id === n.id
                                    ? { ...v, visible: !v.visible }
                                    : v,
                                ),
                              })
                            }
                          >
                            {n.visible ? (
                              <Eye size={12} />
                            ) : (
                              <EyeOff size={12} />
                            )}
                          </button>
                          <button
                            aria-label={"锁定或解锁 " + n.id}
                            onClick={() =>
                              store.edit({
                                ...scene,
                                nodes: scene.nodes.map((v) =>
                                  v.id === n.id
                                    ? { ...v, locked: !v.locked }
                                    : v,
                                ),
                              })
                            }
                          >
                            {n.locked ? (
                              <LockKeyhole size={12} />
                            ) : (
                              <LockKeyholeOpen size={12} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                </section>
              );
            })}
          </>
        ) : active ? (
          <>
            <div className="property-heading">
              <b>
                {selected.length > 1
                  ? `选择了 ${selected.length} 个对象`
                  : active.name}
              </b>
              <button title="复制对象" onClick={onDuplicate}>
                <Copy size={15} />
              </button>
            </div>
            {active.type==='image'&&<button className="small-button" onClick={onVectorize}>识别并矢量化图标（预览）</button>}
            {active.type==='image'&&<button className="small-button" onClick={onEnhanceIcons}>先用 imagegen 清晰化（交给 Codex）</button>}
            <div className="object-type">
              {active.id} · {active.type} {active.groupId ? "· 组合对象" : ""}
            </div>
            {active.locked && (
              <div className="callout">
                对象已锁定{" "}
                <button
                  onClick={() =>
                    store.edit({
                      ...scene,
                      nodes: scene.nodes.map((n) =>
                        n.id === active.id ? { ...n, locked: false } : n,
                      ),
                    })
                  }
                >
                  解锁
                </button>
              </div>
            )}
            <fieldset disabled={active.locked}>
              <div className="prop-label">位置与尺寸</div>
              <div className="field-grid">
                {[
                  ["x", "X"],
                  ["y", "Y"],
                  ["w", "宽度"],
                  ["h", "高度"],
                ].map(([key, label]) => (
                  <NumberField
                    key={key + active.id}
                    label={label}
                    value={active[key]}
                    min={["w", "h"].includes(key) ? 1 : -16000}
                    onChange={(v) => set(key, v)}
                  />
                ))}
              </div>
              {active.type === "text" && (
                <>
                  <div className="prop-label">文字内容</div>
                  <textarea
                    aria-label="对象文字"
                    className="object-text"
                    value={active.text}
                    onChange={(e) => set("text", e.target.value)}
                  />
                  <select
                    aria-label="字体"
                    value={active.fontFamily}
                    onChange={(e) => set("fontFamily", e.target.value)}
                  >
                    {[
                      "Microsoft YaHei",
                      "Arial",
                      "Arial Narrow",
                      "Times New Roman",
                    ].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <div className="field-grid">
                    <NumberField
                      label="字号"
                      value={active.fontSize}
                      min={1}
                      max={400}
                      onChange={(v) => set("fontSize", v)}
                    />
                    <NumberField
                      label="行高"
                      value={active.lineHeight}
                      min={0.7}
                      max={4}
                      step={0.05}
                      onChange={(v) => set("lineHeight", v)}
                    />
                  </div>
                  <div className="toggle-row">
                    <button
                      className={active.bold ? "on" : ""}
                      aria-label="加粗"
                      onClick={() => set("bold", !active.bold)}
                    >
                      <b>B</b>
                    </button>
                    <button
                      className={active.italic ? "on" : ""}
                      aria-label="斜体"
                      onClick={() => set("italic", !active.italic)}
                    >
                      <i>I</i>
                    </button>
                    {[
                      [AlignLeft, "left", "左对齐"],
                      [AlignCenter, "center", "居中"],
                      [AlignRight, "right", "右对齐"],
                    ].map(([Icon, v, name]) => (
                      <button
                        key={v}
                        className={active.align === v ? "on" : ""}
                        aria-label={name}
                        onClick={() => set("align", v)}
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={active.wrap}
                      onChange={(e) => set("wrap", e.target.checked)}
                    />
                    在文本框内自动换行
                  </label>
                </>
              )}
              <div className="prop-label">外观</div>
              {(active.type === "text"
                ? [["color", "文字颜色"]]
                : active.type === "image"
                  ? []
                  : active.type === "arrow"
                    ? [["stroke", "线条颜色"]]
                    : [
                        ["fill", "填充"],
                        ["stroke", "线条颜色"],
                      ]
              ).map(([key, label]) => (
                <ColorField
                  key={key}
                  label={label}
                  value={active[key]}
                  onChange={(v) => set(key, v)}
                  palette={palette}
                  allowNone={key === "fill"}
                />
              ))}
              {!["text", "image"].includes(active.type) && (
                <>
                  {active.type!=='arrow'&&<GradientField node={active} paint="fill" label="填充" palette={palette} set={set}/>}
                  <GradientField node={active} paint="stroke" label="线条" palette={palette} set={set}/>
                  {active.type==='rect'&&<label className="check-field"><input aria-label="启用圆角" type="checkbox" checked={active.radius>0} onChange={e=>set('radius',e.target.checked?Math.min(24,active.w/2,active.h/2):0)}/>启用圆角</label>}
                  <div className="field-grid">
                    <NumberField
                      label="线宽"
                      value={active.strokeWidth}
                      min={0}
                      max={100}
                      step={0.5}
                      onChange={(v) => set("strokeWidth", v)}
                    />
                    {active.type === "rect" && (
                      <NumberField
                        label="圆角半径"
                        value={active.radius}
                        min={0}
                        max={Math.min(400,active.w/2,active.h/2)}
                        onChange={(v) => set("radius", v)}
                      />
                    )}
                  </div>
                  <div className="prop-label">线型</div>
                  <select
                    aria-label="线型"
                    value={active.dash}
                    onChange={(e) => set("dash", e.target.value)}
                  >
                    <option value="solid">实线 ━━━━━</option>
                    <option value="dash">虚线 ┄┄┄┄┄</option>
                    <option value="dot">点线 ········</option>
                    <option value="dashDot">点划线 ┄·┄·┄</option>
                  </select>
                </>
              )}
              {active.type === "arrow" && (
                <>
                  <div className="prop-label">箭头与路径</div>
                  <div className="check-pair">
                    <label>
                      <input
                        type="checkbox"
                        checked={active.headStart}
                        onChange={(e) => set("headStart", e.target.checked)}
                      />
                      起点箭头
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={active.headEnd}
                        onChange={(e) => set("headEnd", e.target.checked)}
                      />
                      终点箭头
                    </label>
                  </div>
                  <p className="property-help">
                    拖动连线的圆形控制点可修改路径。拖动整条连线可移动全部线段。
                  </p>
                  <button
                    className="small-button"
                    onClick={() => {
                      const p = arrowPoints(active, scene.nodes),
                        a = p[0],
                        b = p.at(-1);
                      store.edit({
                        ...scene,
                        nodes: scene.nodes.map((n) =>
                          n.id === active.id ? pathNode(n, [a, b]) : n,
                        ),
                      });
                    }}
                  >
                    改为直线路径
                  </button>
                  <details className="path-details">
                    <summary>
                      编辑路径点（{arrowPoints(active, scene.nodes).length}）
                    </summary>
                    {arrowPoints(active, scene.nodes).map((p, i) => (
                      <div key={i} className="field-grid">
                        <NumberField
                          label={"点" + (i + 1) + " X"}
                          value={p[0]}
                          onChange={(v) => {
                            const points = arrowPoints(active, scene.nodes);
                            points[i] = [v, p[1]];
                            store.edit({
                              ...scene,
                              nodes: scene.nodes.map((n) =>
                                n.id === active.id ? pathNode(n, points) : n,
                              ),
                            });
                          }}
                        />
                        <NumberField
                          label={"点" + (i + 1) + " Y"}
                          value={p[1]}
                          onChange={(v) => {
                            const points = arrowPoints(active, scene.nodes);
                            points[i] = [p[0], v];
                            store.edit({
                              ...scene,
                              nodes: scene.nodes.map((n) =>
                                n.id === active.id ? pathNode(n, points) : n,
                              ),
                            });
                          }}
                        />
                      </div>
                    ))}
                  </details>
                </>
              )}
              {active.type === "image" && (
                <div className="action-grid">
                  <button onClick={() => onCrop(active)}>
                    <Scissors size={14} />
                    裁剪图片
                  </button>
                  <button onClick={() => onReplace(active)}>
                    <ImagePlus size={14} />
                    替换图片
                  </button>
                </div>
              )}
              <label className="opacity-field">
                不透明度
                <input
                  aria-label="不透明度"
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={active.opacity}
                  onChange={(e) => set("opacity", +e.target.value)}
                />
                <small>{Math.round(active.opacity * 100)}%</small>
              </label>
            </fieldset>
            <div className="prop-label">对象操作</div>
            <div className="action-grid">
              <button onClick={() => onReorder(true)}>
                <ArrowUp size={14} />
                上移
              </button>
              <button onClick={() => onReorder(false)}>
                <ArrowDown size={14} />
                下移
              </button>
              <button onClick={onDuplicate}>
                <Copy size={14} />
                复制
              </button>
              <button className="danger" onClick={onDelete}>
                <Trash2 size={14} />
                删除
              </button>
              <button disabled={selected.length < 2} onClick={onGroup}>
                组合 Ctrl+G
              </button>
              <button disabled={!active.groupId} onClick={onUngroup}>
                解除组合
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="property-heading">
              <b>画布设置</b>
              <Layers size={16} />
            </div>
            <div className="prop-label">尺寸</div>
            <div className="field-grid">
              <NumberField
                label="画布宽度"
                value={scene.width}
                min={100}
                max={8000}
                onChange={(v) =>
                  store.edit(
                    applyOperations(scene, [
                      { type: "canvas", changes: { width: v } },
                    ]),
                  )
                }
              />
              <NumberField
                label="画布高度"
                value={scene.height}
                min={100}
                max={8000}
                onChange={(v) =>
                  store.edit(
                    applyOperations(scene, [
                      { type: "canvas", changes: { height: v } },
                    ]),
                  )
                }
              />
            </div>
            <ColorField
              label="画布背景"
              value={scene.background}
              palette={palette}
              onChange={(v) =>
                store.edit(
                  applyOperations(scene, [
                    { type: "canvas", changes: { background: v } },
                  ]),
                )
              }
            />
            <div className="selection-guide">
              <MousePointerGraphic />
              <b>选择图中的任意对象</b>
              <p>
                双击文字直接编辑
                <br />
                拖动控制点调整连线
                <br />
                Shift 多选，Alt 单独选组内对象
              </p>
            </div>
            <div className="callout">
              文字、线框和箭头可独立编辑。复杂插画使用图片图层，矢量图标可修改颜色和线宽。
            </div>
          </>
        )}
      </div>
      <footer className="inspector-bottom">
        <span className="green-dot" />
        统一场景数据 <code>v2</code>
      </footer>
    </aside>
  );
}
function MousePointerGraphic() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <path
        d="M9 5L26 17L17 19L13 28L9 5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
