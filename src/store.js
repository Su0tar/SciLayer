import { clone, template, validateScene } from "./model.js";
import { mergeScenes } from "./operations.js";
import { normalizeWorkflow } from './workflow.js';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class WorkbenchStore {
  constructor(transport, { initial = template(), storage = null } = {}) {
    this.transport = transport;
    this.storage = storage;
    this.actor = "ui-" + globalThis.crypto.randomUUID();
    this.listeners = new Set();
    this.past = [];
    this.future = [];
    this.counter = 0;
    this.saving = false;
    this.gesture = null;
    this.base = null;
    this.timer = null;
    this.stopped = false;
    this.state = {
      scene: validateScene(initial),
      selected: [],
      reference: null,
      workflow: normalizeWorkflow(),
      revision: 0,
      loaded: false,
      connected: false,
      dirty: false,
      saving: false,
      error: "",
      conflict: null,
      notice: "",
      activity: [],
      undoCount: 0,
      redoCount: 0,
      status: {},
    };
  }
  getSnapshot = () => this.state;
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  emit(patch = {}) {
    this.state = {
      ...this.state,
      ...patch,
      undoCount: this.past.length,
      redoCount: this.future.length,
    };
    for (const fn of this.listeners) fn();
  }
  remember(scene) {
    this.past.push(clone(scene));
    if (this.past.length > 80) this.past.shift();
    this.future = [];
  }
  persist() {
    try {
      const json = JSON.stringify(this.state.scene);
      // Large embedded atlases are already persisted by the local service.
      // Avoid repeatedly exhausting the browser's much smaller localStorage quota.
      if (json.length > 4_000_000) { this.storage?.removeItem('scilayer-scene'); return; }
      this.storage?.setItem('scilayer-scene', json);
    } catch {
      this.emit({
        notice: "浏览器存储空间不足，请导出项目；本机服务仍会保存画布。",
      });
    }
  }
  async start() {
    try {
      const status = await this.transport.start();
      this.emit({ status });
      const d = await this.transport.get();
      this.base = validateScene(d.scene);
      this.emit({
        scene: this.base,
        revision: d.revision,
        reference: d.reference || null,
        workflow: normalizeWorkflow(d.workflow),
        selected: d.selected || [],
        activity: d.activity || [],
        loaded: true,
        connected: true,
      });
      this.persist();
      this.unlisten = this.transport.listen(() => this.refresh());
      this.retry = setInterval(() => {
        if (this.state.dirty) this.flush();
        else this.refresh();
      }, 4000);
    } catch (e) {
      this.emit({ loaded: true, error: e.message, connected: false });
    }
  }
  stop() {
    this.stopped = true;
    this.unlisten?.();
    clearTimeout(this.timer);
    clearTimeout(this.selectionTimer);
    clearInterval(this.retry);
  }
  edit(scene, { coalesce } = {}) {
    if(this.replacing)throw Error('正在载入示例，请稍候');
    const next = validateScene(scene);
    if (equal(next, this.state.scene)) return;
    if (
      !coalesce ||
      this.lastKey !== coalesce ||
      Date.now() - this.lastTime > 900
    )
      this.remember(this.state.scene);
    this.lastKey = coalesce;
    this.lastTime = Date.now();
    this.counter++;
    this.emit({
      scene: next,
      dirty: true,
      error: "",
      notice: "",
      conflict: null,
    });
    this.persist();
    this.schedule();
  }
  beginGesture() {
    if (!this.gesture) this.gesture = clone(this.state.scene);
  }
  preview(scene) {
    this.emit({ scene });
  }
  endGesture() {
    if (!this.gesture) return;
    const original = this.gesture;
    this.gesture = null;
    if (!equal(original, this.state.scene)) {
      this.remember(original);
      this.counter++;
      this.emit({ dirty: true });
      this.persist();
      this.schedule();
    }
  }
  undo() {
    const p = this.past.pop();
    if (!p) return;
    this.future.push(clone(this.state.scene));
    this.counter++;
    this.emit({ scene: p, selected: [], dirty: true, conflict: null });
    this.select([]);
    this.persist();
    this.schedule();
  }
  redo() {
    const p = this.future.pop();
    if (!p) return;
    this.past.push(clone(this.state.scene));
    this.counter++;
    this.emit({ scene: p, selected: [], dirty: true, conflict: null });
    this.select([]);
    this.persist();
    this.schedule();
  }
  select(ids) {
    const valid = ids.filter((id) =>
      this.state.scene.nodes.some((n) => n.id === id),
    );
    const epoch = (this.selectionEpoch = (this.selectionEpoch || 0) + 1);
    this.selectionPending = true;
    this.emit({ selected: valid });
    clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => this.sendSelection(epoch,valid),120);
  }
  async sendSelection(epoch,valid) {
    if(this.stopped || epoch!==this.selectionEpoch)return;
    // New example/inserted nodes must exist on the server before syncing their IDs.
    if(this.state.dirty||this.saving){
      await this.flush();
      if(this.stopped || epoch!==this.selectionEpoch)return;
      if(this.state.dirty||this.saving){this.selectionTimer=setTimeout(()=>this.sendSelection(epoch,valid),400);return;}
    }
    try { await this.transport.select(valid); }
    catch { return; }
    finally { if(this.selectionEpoch===epoch)this.selectionPending=false; }
  }
  async setReference(reference) {
    this.referenceEpoch = (this.referenceEpoch || 0) + 1;
    await this.transport.reference(reference);
    this.emit({ reference });
  }
  async setWorkflow(value) {
    const epoch = this.workflowEpoch = (this.workflowEpoch || 0) + 1;
    const workflow = normalizeWorkflow(value);
    this.workflowPending = true;
    try {
      await this.transport.workflow(workflow);
      if (epoch === this.workflowEpoch) this.emit({ workflow });
    } finally {
      if (epoch === this.workflowEpoch) this.workflowPending = false;
    }
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 320);
  }
  async flush() {
    if (
      this.stopped ||
      !this.state.loaded ||
      !this.state.dirty ||
      this.saving ||
      this.gesture ||
      this.state.conflict
    )
      return;
    this.saving = true;
    const snapshot = clone(this.state.scene),
      count = this.counter,
      revision = this.state.revision;
    this.emit({ saving: true });
    try {
      const result = await this.transport.put(snapshot, revision, this.actor);
      this.base = snapshot;
      this.emit({
        revision: result.revision,
        dirty: this.counter !== count,
        error: "",
        connected: true,
      });
    } catch (e) {
      if (e.status === 409 || /版本|并发|冲突|已.*更新/.test(e.message)) {
        try {
          await this.reconcile();
        } catch (err) {
          this.emit({
            error: "合并修改失败：" + err.message,
            connected: false,
          });
        }
      } else
        this.emit({ error: "本机保存失败：" + e.message, connected: false });
    } finally {
      this.saving = false;
      this.emit({ saving: false });
      if (this.state.dirty && !this.state.conflict && this.state.connected)
        this.schedule();
    }
  }
  async loadExample(scene, source, expectedRevision) {
    const candidate=validateScene(scene);
    await this.flush();
    if(this.state.dirty||this.saving||this.gesture||this.state.conflict||!this.state.connected)
      throw Error('请先完成当前画布的保存或冲突处理');
    if(JSON.stringify(this.state.scene)!==source||this.state.revision!==expectedRevision)
      throw Error('预览期间画布已变化，请重新预览示例后载入');
    this.replacing=true;
    this.replacementEpoch=(this.replacementEpoch||0)+1;
    this.saving=true;
    this.emit({saving:true});
    try {
      // Full replacement uses the reviewed revision and never merges unrelated scenes.
      // The service saves the previous scene in history before acknowledging this write.
      const result=await this.transport.put(candidate,expectedRevision,this.actor);
      this.remember(this.state.scene);
      this.base=candidate;
      this.counter++;
      this.emit({scene:candidate,revision:result.revision,selected:[],dirty:false,error:'',notice:'示例已载入；可撤销或从历史恢复原画布。'});
      this.persist();
      this.select([]);
    } finally {
      this.replacing=false;
      this.saving=false;
      this.emit({saving:false});
    }
  }
  async reconcile() {
    const remote = await this.transport.get();
    const result = mergeScenes(
      this.base,
      this.state.scene,
      validateScene(remote.scene),
    );
    if (result.conflicts.length) {
      this.emit({
        conflict: { ...result, remote, local: clone(this.state.scene) },
        error: "同一对象属性被同时修改，请选择保留版本。",
      });
      return;
    }
    this.base = validateScene(remote.scene);
    this.counter++;
    this.emit({
      scene: result.scene,
      revision: remote.revision,
      dirty: !equal(result.scene, this.base),
      connected: true,
      notice: "已合并你与Codex对不同属性的修改。",
      activity: remote.activity || [],
    });
    this.persist();
  }
  async refresh() {
    if (this.stopped || this.saving || this.gesture || this.state.conflict)
      return;
    const epoch = this.selectionEpoch;
    const selectionWasPending = this.selectionPending;
    const referenceEpoch = this.referenceEpoch;
    const workflowEpoch = this.workflowEpoch, workflowWasPending = this.workflowPending;
    const replacementEpoch=this.replacementEpoch||0;
    try {
      const d = await this.transport.get();
      if(this.replacing||replacementEpoch!==(this.replacementEpoch||0))return;
      const workflowPatch = d.workflow && !workflowWasPending && !this.workflowPending && workflowEpoch === this.workflowEpoch
        ? { workflow: normalizeWorkflow(d.workflow) } : {};
      const referencePatch =
        "reference" in d && referenceEpoch === this.referenceEpoch
          ? { reference: d.reference }
          : {};
      const selection =
        Array.isArray(d.selected) &&
        !selectionWasPending &&
        !this.selectionPending &&
        epoch === this.selectionEpoch
          ? { selected: d.selected }
          : {};
      if (d.revision === this.state.revision) {
        if (
          !equal(d.activity || [], this.state.activity) ||
          (workflowPatch.workflow && !equal(workflowPatch.workflow, this.state.workflow)) ||
          ("reference" in referencePatch &&
            !equal(referencePatch.reference, this.state.reference)) ||
          (selection.selected &&
            !equal(selection.selected, this.state.selected)) ||
          !this.state.connected
        )
          this.emit({
            activity: d.activity || [],
            ...selection,
            ...referencePatch,
            ...workflowPatch,
            connected: true,
            error: "",
          });
        return;
      }
      if (this.state.dirty) {
        await this.reconcile();
        if (this.state.dirty) this.schedule();
        return;
      }
      const next = validateScene(d.scene);
      if (!equal(next, this.state.scene)) this.remember(this.state.scene);
      this.base = next;
      this.emit({
        scene: next,
        ...referencePatch,
        ...workflowPatch,
        revision: d.revision,
        connected: true,
        activity: d.activity || [],
        notice: "已同步Codex对画布的修改。",
        selected: (selection.selected || this.state.selected).filter((id) =>
          next.nodes.some((n) => n.id === id),
        ),
      });
      this.persist();
    } catch (e) {
      this.emit({ connected: false, error: e.message });
    }
  }
  resolveConflict(choice) {
    const c = this.state.conflict;
    if (!c) return;
    try {
      this.storage?.setItem(
        "scilayer-conflict-backup",
        JSON.stringify(c.local),
      );
    } catch {}
    this.base = validateScene(c.remote.scene);
    this.counter++;
    this.emit({
      scene: choice === "remote" ? this.base : c.local,
      revision: c.remote.revision,
      dirty: choice !== "remote",
      conflict: null,
      error: "",
      connected: true,
    });
    this.persist();
    if (choice !== "remote") this.schedule();
  }
}
