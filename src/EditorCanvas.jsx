import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize, Hand, MousePointer2 } from "lucide-react";
import { bounds, arrowPoints, clone } from "./model.js";
import { moveNodes, resizeNode, pathNode } from "./operations.js";
import { nodeSvg } from "./render.js";

export function EditorCanvas({
  store,
  state,
  snap,
  onDrop,
  onEditText,
  showReference,
  onSelection,
}) {
  const { scene, selected } = state;
  const viewport = useRef(),
    svg = useRef(),
    drag = useRef(),
    space = useRef(false),
    scaling = useRef();
  const [scale, setScale] = useState(0.65),
    [fit, setFit] = useState(true),
    [hand, setHand] = useState(false),
    [inline, setInline] = useState(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useLayoutEffect(() => {
    if (!fit || !viewport.current) return;
    const observer = new ResizeObserver(([e]) =>
      setScale(
        Math.max(
          0.08,
          Math.min(
            (e.contentRect.width - 100) / scene.width,
            (e.contentRect.height - 100) / scene.height,
            1.5,
          ),
        ),
      ),
    );
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [fit, scene.width, scene.height]);
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest("input,textarea,select,[contenteditable]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        space.current = e.type === "keydown";
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, []);
  function zoom(next, client) {
    const el = viewport.current,
      old = scale,
      n = Math.min(4, Math.max(0.08, next)),
      rect = el.getBoundingClientRect(),
      x = client ? client[0] - rect.left : rect.width / 2,
      y = client ? client[1] - rect.top : rect.height / 2;
    const px = (el.scrollLeft + x) / old,
      py = (el.scrollTop + y) / old;
    setFit(false);
    setScale(n);
    scaling.current = { left: px * n - x, top: py * n - y };
  }
  useLayoutEffect(() => {
    if (scaling.current) {
      viewport.current.scrollLeft = scaling.current.left;
      viewport.current.scrollTop = scaling.current.top;
      scaling.current = null;
    }
  }, [scale]);
  useEffect(() => {
    const el = viewport.current;
    const wheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(scale * Math.exp(-e.deltaY * 0.003), [e.clientX, e.clientY]);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [scale]);
  function point(e) {
    const p = svg.current.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.current.getScreenCTM().inverse());
  }
  function start(e, n, kind = "move", index) {
    if (e.button === 1 || space.current || hand) {
      e.preventDefault();
      e.stopPropagation();
      drag.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        left: viewport.current.scrollLeft,
        top: viewport.current.scrollTop,
      };
      svg.current.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();
    if (inline) return;
    if (!n) {
      store.select([]);
      return;
    }
    if (n.locked) {
      store.select([n.id]);
      return;
    }
    let ids = selected.includes(n.id) ? selected : [n.id];
    if (n.groupId && !e.altKey && !e.shiftKey)
      ids = scene.nodes.filter((v) => v.groupId === n.groupId).map((v) => v.id);
    if (e.shiftKey && kind === "move") {
      store.select(
        selected.includes(n.id)
          ? selected.filter((id) => id !== n.id)
          : [...selected, n.id],
      );
      return;
    }
    store.select(ids);
    onSelection?.();
    drag.current = {
      kind,
      ids,
      index,
      id: n.id,
      start: point(e),
      original: clone(scene),
      moved: false,
    };
    store.beginGesture();
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      viewport.current.scrollLeft = d.left - (e.clientX - d.x);
      viewport.current.scrollTop = d.top - (e.clientY - d.y);
      return;
    }
    const p = point(e);
    let dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 1.5) return;
    if (!d.moved) svg.current.setPointerCapture(e.pointerId);
    d.moved = true;
    if (snap && !e.altKey) {
      dx = Math.round(dx / 4) * 4;
      dy = Math.round(dy / 4) * 4;
    }
    let next;
    if (d.kind === "move") next = moveNodes(d.original, d.ids, dx, dy);
    else {
      next = clone(d.original);
      const i = next.nodes.findIndex((v) => v.id === d.id),
        n = next.nodes[i];
      if (d.kind === "resize") {
        let w = Math.max(12, n.w + dx),
          h = Math.max(12, n.h + dy);
        if (e.shiftKey || (n.type === "image" && !e.altKey))
          h = (w * n.h) / n.w;
        next.nodes[i] = resizeNode(n, w, h);
      } else {
        const points = arrowPoints(n, d.original.nodes);
        points[d.index] = [points[d.index][0] + dx, points[d.index][1] + dy];
        next.nodes[i] = pathNode(n, points);
      }
    }
    store.preview(next);
  }
  function end(e) {
    if (!drag.current) return;
    if (drag.current.kind !== "pan") store.endGesture();
    drag.current = null;
    try {
      svg.current.releasePointerCapture(e.pointerId);
    } catch {}
  }
  useEffect(() => {
    const finish = (e) => {
      end(e);
      space.current = false;
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, []);
  function editText(n) {
    if (n.type !== "text" || n.locked) return;
    store.select([n.id]);
    setInline({ id: n.id, text: n.text, original: n.text });
    onEditText?.();
  }
  function finishText(cancel = false) {
    const draft = inline;
    if (!draft) return;
    setInline(null);
    if (cancel) return;
    const s = store.state.scene;
    const n = s.nodes.find((v) => v.id === draft.id);
    if (!n || n.text === draft.text) return;
    let w = n.w,
      h = n.h;
    if (!n.wrap) {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `${n.bold ? "bold " : ""}${n.fontSize}px "${n.fontFamily}"`;
      w = Math.max(
        w,
        ...draft.text.split("\n").map((t) => ctx.measureText(t).width + 4),
      );
      h = Math.max(
        h,
        (draft.text.split("\n").length - 1) * n.fontSize * n.lineHeight +
          n.fontSize +
          4,
      );
    }
    store.edit(
      {
        ...s,
        nodes: s.nodes.map((v) =>
          v.id === draft.id
            ? { ...v, text: draft.text, name: draft.text.slice(0, 120), w, h }
            : v,
        ),
      },
      { coalesce: "text-" + draft.id },
    );
  }
  return (
    <main className="canvas-region">
      <div className="canvas-caption">
        <span>
          <span className="green-dot" />
          画板 01{" "}
          <i>
            {scene.width} × {scene.height}
          </i>
        </span>
        <span>文字与矢量可编辑 · v2 场景</span>
      </div>
      <div
        ref={viewport}
        className={"canvas-viewport " + (hand ? "hand-mode" : "")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(e.dataTransfer.files[0], true);
        }}
      >
        <div
          className="canvas-space"
          style={{
            width: scene.width * scale + 100,
            height: scene.height * scale + 100,
          }}
        >
          <div
            className="board"
            style={{ width: scene.width * scale, height: scene.height * scale }}
          >
            <svg
              ref={svg}
              className="scene-svg"
              aria-label="可编辑科研图画布"
              role="img"
              width={scene.width * scale}
              height={scene.height * scale}
              viewBox={`0 0 ${scene.width} ${scene.height}`}
              onPointerDown={(e) => {
                if (e.target === svg.current || e.target.dataset.background)
                  start(e, null);
              }}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <rect
                data-background="true"
                width={scene.width}
                height={scene.height}
                fill={scene.background}
              />
              {(showReference || scene.nodes.length===0) && state.reference && (
                <image
                  href={state.reference.src}
                  width={scene.width}
                  height={scene.height}
                  opacity={scene.nodes.length===0 ? 1 : .25}
                  pointerEvents="none"
                />
              )}
              {scene.nodes
                .filter((n) => n.visible)
                .map((n) => (
                  <g
                    key={n.id}
                    data-node-id={n.id}
                    data-type={n.type}
                    onPointerDown={(e) => start(e, n)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      editText(n);
                    }}
                    style={{
                      cursor: n.locked ? "default" : hand ? "grab" : "move",
                      pointerEvents: n.locked ? "none" : undefined,
                      visibility: inline?.id === n.id ? "hidden" : undefined,
                    }}
                  >
                    <g
                      dangerouslySetInnerHTML={{
                        __html: nodeSvg(n, scene.nodes),
                      }}
                    />
                    {n.type === "text" && (
                      <rect
                        x={n.x}
                        y={n.y}
                        width={n.w}
                        height={n.h}
                        fill="transparent"
                      />
                    )}
                    {n.type === "arrow" && (
                      <polyline
                        className="arrow-hit"
                        points={arrowPoints(n, scene.nodes)
                          .map((p) => p.join(","))
                          .join(" ")}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(12 / scale, n.strokeWidth + 7)}
                        pointerEvents="stroke"
                      />
                    )}
                  </g>
                ))}
              {selected.map((id) => {
                const n = scene.nodes.find((v) => v.id === id);
                if (!n || !n.visible) return null;
                const b = bounds(n, scene.nodes);
                return (
                  <g key={"select" + id}>
                    <rect
                      x={b.x - 3 / scale}
                      y={b.y - 3 / scale}
                      width={b.w + 6 / scale}
                      height={b.h + 6 / scale}
                      fill="none"
                      stroke="#35946a"
                      strokeWidth={1 / scale}
                      pointerEvents="none"
                      strokeDasharray={
                        n.locked ? `${4 / scale} ${3 / scale}` : undefined
                      }
                    />
                    {!n.locked &&
                      selected.length === 1 &&
                      n.type !== "arrow" && (
                        <rect
                          data-handle="resize"
                          x={b.x + b.w - 5 / scale}
                          y={b.y + b.h - 5 / scale}
                          width={10 / scale}
                          height={10 / scale}
                          fill="white"
                          stroke="#35946a"
                          strokeWidth={1 / scale}
                          cursor="nwse-resize"
                          onPointerDown={(e) => start(e, n, "resize")}
                        />
                      )}
                    {!n.locked &&
                      selected.length === 1 &&
                      n.type === "arrow" &&
                      arrowPoints(n, scene.nodes).map((p, index) => (
                        <circle
                          key={index}
                          data-point-index={index}
                          cx={p[0]}
                          cy={p[1]}
                          r={4.5 / scale}
                          fill="white"
                          stroke="#35946a"
                          strokeWidth={1 / scale}
                          cursor="crosshair"
                          onPointerDown={(e) => start(e, n, "point", index)}
                        />
                      ))}
                  </g>
                );
              })}
              {inline &&
                (() => {
                  const n = scene.nodes.find((v) => v.id === inline.id);
                  if (!n) return null;
                  return (
                    <foreignObject
                      x={n.x - 2}
                      y={n.y - 2}
                      width={Math.max(n.w, 170)}
                      height={Math.max(n.h + 20, n.fontSize * 3)}
                    >
                      <textarea
                        autoFocus
                        aria-label="画布内编辑文字"
                        className="inline-text"
                        style={{
                          fontFamily: n.fontFamily,
                          fontSize: n.fontSize,
                          lineHeight: n.lineHeight,
                          fontWeight: n.bold ? 700 : 400,
                          color: n.color,
                          textAlign: n.align,
                        }}
                        value={inline.text}
                        onChange={(e) =>
                          setInline({ ...inline, text: e.target.value })
                        }
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={() => finishText()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Escape") {
                            e.preventDefault();
                            finishText(true);
                          } else if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            finishText();
                          }
                        }}
                      />
                    </foreignObject>
                  );
                })()}
            </svg>
          </div>
        </div>
      </div>
      <footer className="canvas-bottom">
        <span>
          {scene.nodes.length} 个对象 ·{" "}
          {selected.length
            ? `已选 ${selected.length} 个`
            : "双击文字编辑 · Shift多选 · 空格拖动视图"}
        </span>
        <div className="zoom-controls">
          <button
            aria-label="选择工具"
            className={!hand ? "on" : ""}
            onClick={() => setHand(false)}
          >
            <MousePointer2 size={15} />
          </button>
          <button
            aria-label="平移视图"
            className={hand ? "on" : ""}
            onClick={() => setHand(!hand)}
          >
            <Hand size={15} />
          </button>
          <em />
          <button aria-label="缩小" onClick={() => zoom(scale / 1.2)}>
            <Minus size={15} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button aria-label="放大" onClick={() => zoom(scale * 1.2)}>
            <Plus size={15} />
          </button>
          <button aria-label="适合窗口" onClick={() => setFit(true)}>
            <Maximize size={15} />
          </button>
        </div>
      </footer>
    </main>
  );
}
