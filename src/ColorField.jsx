import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  COMMON_COLORS,
  declaredPalette,
  pixelPalette,
  distinctColors,
} from "./palette.js";
import { drawNode } from "./canvas-render.js";
const cache = new Map();
async function image(src) {
  if (!cache.has(src)) {
    if (cache.size > 100) cache.clear();
    const im = new Image();
    im.src = src;
    cache.set(
      src,
      im.decode().then(() => im),
    );
  }
  return cache.get(src);
}
export function useScenePalette(scene) {
  const declared = useMemo(() => declaredPalette(scene), [scene]),
    [sampled, setSampled] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const scale = Math.min(224 / scene.width, 224 / scene.height),
          canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(scene.width * scale));
        canvas.height = Math.max(1, Math.round(scene.height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.scale(scale, scale);
        ctx.fillStyle = scene.background;
        ctx.fillRect(0, 0, scene.width, scene.height);
        for (const n of scene.nodes.filter((n) => n.visible))
          await drawNode(ctx, n, scene.nodes, image);
        const colors = pixelPalette(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          10,
        );
        if (!cancelled) setSampled(colors);
      } catch {
        if (!cancelled) setSampled([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scene]);
  return distinctColors([...declared, ...sampled], 10);
}
export function ColorField({
  label,
  value,
  onChange,
  palette = [],
  allowNone = false,
}) {
  const [open, setOpen] = useState(false),
    root = useRef();
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = (c) => {
    onChange(c);
    setOpen(false);
  };
  return (
    <div
      className="color-property palette-field"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <span>{label === "画布背景" ? "背景" : label}</span>
      <input
        aria-label={label}
        type="color"
        value={value?.startsWith("#") ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
      />
      <code>{value}</code>
      <button
        type="button"
        className="palette-trigger"
        aria-label={"打开" + label + "色板"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        色板
      </button>
      {allowNone && (
        <button type="button" onClick={() => choose("none")}>
          无
        </button>
      )}
      {open && (
        <div
          className="palette-popover"
          role="dialog"
          aria-label={label + "色板"}
        >
          <b>常用色</b>
          <div className="palette-grid">
            {COMMON_COLORS.map(([c, name]) => (
              <button
                key={c}
                type="button"
                aria-label={label + "：" + name + " " + c}
                title={name + " " + c}
                style={{ background: c }}
                className={value === c ? "selected" : ""}
                onClick={() => choose(c)}
              />
            ))}
          </div>
          <b>当前画面代表色</b>
          <div className="palette-grid">
            {palette.length ? (
              palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={label + "：画面色 " + c}
                  title={"画面色 " + c}
                  style={{ background: c }}
                  className={value === c ? "selected" : ""}
                  onClick={() => choose(c)}
                />
              ))
            ) : (
              <small>当前画面暂无彩色对象</small>
            )}
          </div>
          <small>来自可见文字、形状及图片；随画布更新</small>
        </div>
      )}
    </div>
  );
}
