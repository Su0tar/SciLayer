import { clone, validateScene, bounds, arrowPoints, uid } from "./model.js";

export function pathNode(n, points) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys),
    w = Math.max(1, Math.max(...xs) - x),
    h = Math.max(1, Math.max(...ys) - y);
  return {
    ...n,
    x,
    y,
    w,
    h,
    route: "manual",
    from: undefined,
    to: undefined,
    points: points.map((p) => [(p[0] - x) / w, (p[1] - y) / h]),
  };
}
export function moveNodes(scene, ids, dx, dy) {
  return {
    ...scene,
    nodes: scene.nodes.map((n) => {
      if (!ids.includes(n.id) || n.locked) return n;
      if (n.type === "arrow" && (n.from || n.to)) {
        // A connector whose endpoints both move follows them; otherwise an explicitly dragged connector becomes a manual route.
        if (ids.includes(n.from) && ids.includes(n.to)) return n;
        return pathNode(
          n,
          arrowPoints(n, scene.nodes).map((p) => [p[0] + dx, p[1] + dy]),
        );
      }
      return { ...n, x: n.x + dx, y: n.y + dy };
    }),
  };
}
export function resizeNode(n, w, h) {
  return { ...n, w: Math.max(1, w), h: Math.max(1, h) };
}
export function applyOperations(scene, operations) {
  if (!Array.isArray(operations) || operations.length > 3000)
    throw Error("操作列表格式无效");
  const out = clone(scene);
  for (const op of operations) {
    if (op.type === "update") {
      if (
        !op.changes ||
        typeof op.changes !== "object" ||
        Array.isArray(op.changes)
      )
        throw Error("update操作需要changes对象");
      const n = out.nodes.find((v) => v.id === op.id);
      if (!n) throw Error("找不到对象：" + op.id);
      if (
        n.locked &&
        !(Object.keys(op.changes).length === 1 && op.changes.locked === false)
      )
        throw Error("对象已锁定：" + n.name);
      Object.assign(n, op.changes, { id: n.id, type: n.type });
    } else if (op.type === "add") out.nodes.push(op.node);
    else if (op.type === "delete") {
      if (out.nodes.find((n) => n.id === op.id)?.locked)
        throw Error("锁定对象不能删除");
      out.nodes = out.nodes.filter(
        (n) =>
          n.id !== op.id &&
          !(n.type === "arrow" && (n.from === op.id || n.to === op.id)),
      );
    } else if (op.type === "canvas") {
      const backdrops = out.nodes.filter(
        (n) =>
          n.locked &&
          n.type === "rect" &&
          n.x === 0 &&
          n.y === 0 &&
          n.w === out.width &&
          n.h === out.height,
      );
      for (const k of ["name", "width", "height", "background"])
        if (op.changes[k] !== undefined) out[k] = op.changes[k];
      for (const n of backdrops) {
        n.w = out.width;
        n.h = out.height;
        if (op.changes.background !== undefined) n.fill = out.background;
      }
    } else throw Error("不支持的操作：" + op.type);
  }
  return validateScene(out);
}
export function duplicateNodes(scene, ids) {
  const map = new Map(ids.map((id) => [id, uid()])),
    groups = new Map();
  const copies = scene.nodes
    .filter((n) => ids.includes(n.id) && !n.locked)
    .map((n) => {
      let copy = clone(n);
      if (
        n.type === "arrow" &&
        (n.from || n.to) &&
        !(map.has(n.from) && map.has(n.to))
      )
        copy = pathNode(copy, arrowPoints(n, scene.nodes));
      if (n.groupId && !groups.has(n.groupId)) groups.set(n.groupId, uid());
      return {
        ...copy,
        id: map.get(n.id),
        x: copy.x + 24,
        y: copy.y + 24,
        name: n.name + " 副本",
        from: map.get(n.from) || copy.from,
        to: map.get(n.to) || copy.to,
        groupId: groups.get(n.groupId),
      };
    });
  return {
    scene: { ...scene, nodes: [...scene.nodes, ...copies] },
    ids: copies.map((n) => n.id),
  };
}
export function alignNodes(scene, ids, mode) {
  const selected = scene.nodes.filter((n) => ids.includes(n.id) && !n.locked);
  if (selected.length < 2) return scene;
  const boxes = selected.map((n) => ({ n, b: bounds(n, scene.nodes) }));
  const left = Math.min(...boxes.map((v) => v.b.x)),
    top = Math.min(...boxes.map((v) => v.b.y)),
    right = Math.max(...boxes.map((v) => v.b.x + v.b.w)),
    bottom = Math.max(...boxes.map((v) => v.b.y + v.b.h));
  const next = clone(scene);
  for (const { n, b } of boxes) {
    let dx = 0,
      dy = 0;
    if (mode === "left") dx = left - b.x;
    if (mode === "center") dx = (left + right - b.w) / 2 - b.x;
    if (mode === "right") dx = right - b.w - b.x;
    if (mode === "top") dy = top - b.y;
    if (mode === "middle") dy = (top + bottom - b.h) / 2 - b.y;
    if (mode === "bottom") dy = bottom - b.h - b.y;
    const moved = moveNodes(scene, [n.id], dx, dy).nodes.find(
      (v) => v.id === n.id,
    );
    next.nodes[next.nodes.findIndex((v) => v.id === n.id)] = moved;
  }
  return next;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Three-way merge: independent property changes merge; concurrent edits to the same property stay explicit conflicts.
export function mergeScenes(base, local, remote) {
  const conflicts = [],
    out = clone(remote);
  const mergeRecord = (b, l, r, id) => {
    const result = { ...r };
    for (const key of new Set([
      ...Object.keys(b || {}),
      ...Object.keys(l || {}),
      ...Object.keys(r || {}),
    ])) {
      if (same(l?.[key], b?.[key])) continue;
      if (!same(r?.[key], b?.[key]) && !same(l?.[key], r?.[key]))
        conflicts.push({ id, key, local: l?.[key], remote: r?.[key] });
      result[key] = l?.[key];
    }
    return result;
  };
  for (const k of ["name", "width", "height", "background"]) {
    if (!same(local[k], base[k])) {
      if (!same(remote[k], base[k]) && !same(local[k], remote[k]))
        conflicts.push({
          id: "canvas",
          key: k,
          local: local[k],
          remote: remote[k],
        });
      out[k] = local[k];
    }
  }
  const bm = new Map(base.nodes.map((n) => [n.id, n])),
    lm = new Map(local.nodes.map((n) => [n.id, n])),
    rm = new Map(remote.nodes.map((n) => [n.id, n])),
    merged = new Map();
  for (const id of new Set([...bm.keys(), ...lm.keys(), ...rm.keys()])) {
    const b = bm.get(id),
      l = lm.get(id),
      r = rm.get(id);
    if (!b) {
      if (l && r && !same(l, r)) conflicts.push({ id, key: "added-node" });
      if (l || r) merged.set(id, l || r);
      continue;
    }
    if (!l || !r) {
      const survivor = l || r;
      if (survivor && !same(survivor, b))
        conflicts.push({ id, key: "deleted-node" });
      continue;
    }
    merged.set(id, mergeRecord(b, l, r, id));
  }
  const order = (s) => s.nodes.map((n) => n.id).filter((id) => bm.has(id));
  const localReordered = !same(order(local), order(base)),
    remoteReordered = !same(order(remote), order(base));
  if (localReordered && remoteReordered && !same(order(local), order(remote)))
    conflicts.push({ id: "canvas", key: "layer-order" });
  const sequence = localReordered ? local.nodes : remote.nodes;
  const ids = [
    ...sequence.map((n) => n.id),
    ...local.nodes.map((n) => n.id),
    ...remote.nodes.map((n) => n.id),
  ];
  out.nodes = [...new Set(ids)]
    .filter((id) => merged.has(id))
    .map((id) => merged.get(id));
  return { scene: validateScene(out), conflicts };
}
