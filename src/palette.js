export const COMMON_COLORS = [
  ["#ffffff", "白色"],
  ["#111827", "深灰黑"],
  ["#6b7280", "灰色"],
  ["#2563eb", "蓝色"],
  ["#0f766e", "青绿色"],
  ["#16a34a", "绿色"],
  ["#eab308", "黄色"],
  ["#f97316", "橙色"],
  ["#dc2626", "红色"],
  ["#9333ea", "紫色"],
  ["#db2777", "粉色"],
  ["#7c5c3b", "棕色"],
];
const rgb = (hex) => hex.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
const hex = (channels) =>
  "#" +
  channels.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export function distinctColors(candidates, limit = 10) {
  const result = [];
  for (const item of candidates) {
    const value = (Array.isArray(item) ? item[0] : item).toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(value)) continue;
    const c = rgb(value),
      range = Math.max(...c) - Math.min(...c);
    if (Math.min(...c) > 235 || Math.max(...c) < 22 || range < 12) continue;
    if (result.every((v) => distance(c, rgb(v)) > 45)) result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}
export function declaredPalette(scene) {
  const counts = new Map();
  for (const n of scene.nodes.filter((n) => n.visible && n.opacity > 0)) {
    for(const g of [n.fillGradient,n.strokeGradient])for(const s of g?.stops||[])counts.set(s.color.toLowerCase(),(counts.get(s.color.toLowerCase())||0)+1);
    for (const value of n.type === "text"
      ? [n.color]
      : n.type === "image"
        ? []
        : n.type === "arrow"
          ? [n.stroke]
          : [n.fill, n.stroke])
      if (/^#[0-9a-f]{6}$/i.test(value || ""))
        counts.set(
          value.toLowerCase(),
          (counts.get(value.toLowerCase()) || 0) + 1,
        );
  }
  return distinctColors(
    [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c),
    8,
  );
}
export function pixelPalette(data, limit = 10) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 100) continue;
    const c = [data[i], data[i + 1], data[i + 2]];
    if (
      Math.min(...c) > 235 ||
      Math.max(...c) < 22 ||
      Math.max(...c) - Math.min(...c) < 12
    )
      continue;
    const key = c.map((v) => Math.floor(v / 32)).join(",");
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { sum: [0, 0, 0], count: 0 }));
    b.count++;
    c.forEach((v, j) => (b.sum[j] += v));
  }
  return distinctColors(
    [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .map((b) => hex(b.sum.map((v) => v / b.count))),
    limit,
  );
}
