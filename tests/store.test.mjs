import test from "node:test";
import assert from "node:assert/strict";
import { WorkbenchStore } from "../src/store.js";
import { validateScene, clone } from "../src/model.js";
import { fixture as template } from "./fixture.mjs";

test("Codex选区同步到属性栏，延迟的远端响应不能覆盖用户的新选择", async () => {
  const api = backend(),
    originalGet = api.get;
  let remoteSelected = [],
    remoteReference = null;
  api.get = async () => ({
    ...(await originalGet()),
    selected: remoteSelected,
    reference: remoteReference,
  });
  const s = new WorkbenchStore(api);
  try {
    await s.start();
    const [first, second] = s.state.scene.nodes;
    remoteSelected = [first.id];
    remoteReference = {
      src: "data:image/png;base64,AA==",
      name: "原图",
      width: 1,
      height: 1,
    };
    await s.refresh();
    assert.deepEqual(s.state.selected, [first.id]);
    assert.equal(s.state.reference.name, "原图");
    let finish;
    api.get = async () => {
      const snapshot = { ...(await originalGet()), selected: [first.id] };
      await new Promise((r) => (finish = r));
      return snapshot;
    };
    const pending = s.refresh();
    await new Promise((r) => setTimeout(r, 0));
    s.select([second.id]);
    finish();
    await pending;
    assert.deepEqual(s.state.selected, [second.id]);
  } finally {
    s.stop();
  }
});
function backend() {
  let scene = validateScene(template()),
    revision = 0;
  return {
    start: async () => ({}),
    get: async () => ({ scene: clone(scene), revision, activity: [] }),
    put: async (next, expected) => {
      if (expected !== revision) {
        const e = Error("版本冲突");
        e.status = 409;
        throw e;
      }
      scene = clone(next);
      return { revision: ++revision };
    },
    listen: () => () => {},
    select: async () => {},
    reference: async () => {},
    remote(fn) {
      scene = fn(clone(scene));
      revision++;
    },
    current: () => ({ scene, revision }),
  };
}
test('示例载入可撤销；预览后的本机或远端修改均不能被示例覆盖',async()=>{
  const api=backend(),store=new WorkbenchStore(api);
  try{
    await store.start();
    const old=clone(store.state.scene),example={...clone(old),name:'示例副本'};
    const source=JSON.stringify(old);
    await store.loadExample(example,source,store.state.revision);
    assert.equal(api.current().scene.name,'示例副本');
    store.undo();await store.flush();
    assert.deepEqual(api.current().scene,old);
    const previewRevision=store.state.revision;
    const modified=clone(old);modified.nodes[0].x+=10;store.edit(modified);
    await assert.rejects(()=>store.loadExample(example,source,previewRevision),/预览期间/);
    await store.flush();
    const remoteSource=JSON.stringify(store.state.scene),remoteRevision=store.state.revision;
    api.remote(s=>({...s,name:'远端新修改'}));
    await assert.rejects(()=>store.loadExample(example,remoteSource,remoteRevision),/版本冲突/);
    assert.equal(api.current().scene.name,'远端新修改');
    assert.notEqual(store.state.scene.name,'示例副本');
  }finally{store.stop();}
});
test('示例写入前发起的延迟读取不会把新示例倒退成旧画布',async()=>{
  const api=backend(),store=new WorkbenchStore(api);
  try{
    await store.start();
    const source=JSON.stringify(store.state.scene),revision=store.state.revision;
    const read=api.get;let release;
    api.get=async()=>{const old=await read();await new Promise(r=>release=r);return old;};
    const refresh=store.refresh();
    await new Promise(r=>setTimeout(r,0));
    await store.loadExample({...clone(store.state.scene),name:'已载入示例'},source,revision);
    release();await refresh;
    assert.equal(store.state.scene.name,'已载入示例');
    assert.equal(store.state.revision,api.current().revision);
  }finally{store.stop();}
});
test('新载入的对象先保存再同步选区，不因服务端尚无该ID而取消选择', async()=>{
  const api=backend(),put=api.put;let release,remoteSelected=[];
  api.put=async(...args)=>{await new Promise(r=>release=r);return put(...args);};
  api.select=async ids=>{remoteSelected=ids.filter(id=>api.current().scene.nodes.some(n=>n.id===id));};
  const get=api.get;api.get=async()=>({...await get(),selected:remoteSelected});
  const s=new WorkbenchStore(api);
  try{
    await s.start();s.edit({...s.state.scene,nodes:[...s.state.scene.nodes,{...s.state.scene.nodes[0],id:'newly-loaded'}]});s.select(['newly-loaded']);
    await new Promise(r=>setTimeout(r,170));
    assert.equal(s.selectionPending,true);assert.deepEqual(remoteSelected,[]);
    release();await new Promise(r=>setTimeout(r,450));await s.refresh();
    assert.deepEqual(remoteSelected,['newly-loaded']);assert.deepEqual(s.state.selected,['newly-loaded']);
  }finally{s.stop();}
});
test("画布保存期间的新修改不会被较早响应覆盖", async () => {
  const api = backend(),
    original = api.put;
  let release;
  api.put = async (...args) => {
    await new Promise((r) => (release = r));
    return original(...args);
  };
  const s = new WorkbenchStore(api);
  try {
    await s.start();
    const n = clone(s.state.scene);
    n.nodes[0].x = 200;
    s.edit(n);
    const pending = s.flush();
    const later = clone(n);
    later.nodes[0].x = 230;
    s.edit(later);
    release();
    await pending;
    assert.equal(s.state.scene.nodes[0].x, 230);
    assert.equal(s.state.dirty, true);
    api.put = original;
    await s.flush();
    assert.equal(api.current().scene.nodes[0].x, 230);
  } finally {
    s.stop();
  }
});
test("Codex与用户修改不同属性自动合并，冲突不丢本地修改", async () => {
  const api = backend(),
    s = new WorkbenchStore(api);
  try {
    await s.start();
    const local = clone(s.state.scene);
    local.nodes[0].x += 15;
    s.edit(local);
    api.remote((scene) => {
      scene.nodes[0].fill = "#123456";
      return scene;
    });
    await s.flush();
    assert.equal(s.state.conflict, null);
    assert.equal(s.state.scene.nodes[0].x, local.nodes[0].x);
    assert.equal(s.state.scene.nodes[0].fill, "#123456");
    await s.flush();
    const next = clone(s.state.scene);
    next.nodes[0].x = 330;
    s.edit(next);
    api.remote((scene) => {
      scene.nodes[0].x = 550;
      return scene;
    });
    await s.flush();
    assert.ok(s.state.conflict);
    assert.equal(s.state.scene.nodes[0].x, 330);
    s.resolveConflict("remote");
    assert.equal(s.state.scene.nodes[0].x, 550);
    assert.equal(s.state.dirty, false);
  } finally {
    s.stop();
  }
});
test("远端修改进入撤销历史，拖动手势只形成一个历史步骤", async () => {
  const api = backend(),
    s = new WorkbenchStore(api);
  try {
    await s.start();
    const original = s.state.scene.nodes[0].x;
    api.remote((scene) => {
      scene.nodes[0].x += 17;
      return scene;
    });
    await s.refresh();
    assert.equal(s.past.length, 1);
    s.undo();
    assert.equal(s.state.scene.nodes[0].x, original);
    await s.flush();
    const count = s.past.length;
    s.beginGesture();
    for (let i = 1; i < 5; i++) {
      const next = clone(s.state.scene);
      next.nodes[0].x = original + i;
      s.preview(next);
    }
    s.endGesture();
    assert.equal(s.past.length, count + 1);
    s.undo();
    assert.equal(s.state.scene.nodes[0].x, original);
  } finally {
    s.stop();
  }
});
