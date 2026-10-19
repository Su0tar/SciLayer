import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorkflow,workflowPlan} from '../src/workflow.js';
import {WorkbenchStore} from '../src/store.js';
import {fixture} from './fixture.mjs';
test('偏好不构成增强授权，转换由用户发起，不限定生图预算',()=>{
 assert.deepEqual(normalizeWorkflow(),{restorationMode:'imagegen'});
 for(const restorationMode of ['imagegen','local-sr','original']){
  const plan=workflowPlan({restorationMode});assert.equal(plan.enhancementRequiresUserChoice,true);
  assert.equal(plan.imagegenBudget,undefined);assert.match(plan.generationPolicy,/不设置固定调用次数/);
  assert.match(plan.startCondition,/用户明确要求/);
 }
 assert.throws(()=>normalizeWorkflow({restorationMode:'bad'}));
});
test('延迟的远端偏好不能覆盖用户新选择，相同画布版本仍同步偏好',async()=>{
 let remote=normalizeWorkflow(),finish;
 const api={start:async()=>({}),get:async()=>({scene:fixture(),revision:0,workflow:remote}),workflow:async v=>{remote=v;},listen:()=>()=>{}};
 const store=new WorkbenchStore(api);
 try{await store.start();api.get=async()=>{const workflow=remote;await new Promise(r=>finish=r);return{scene:store.state.scene,revision:0,workflow};};
  const pending=store.refresh();await store.setWorkflow({restorationMode:'local-sr'});finish();await pending;assert.equal(store.state.workflow.restorationMode,'local-sr');
  api.get=async()=>({scene:store.state.scene,revision:0,workflow:{restorationMode:'original'}});await store.refresh();assert.equal(store.state.workflow.restorationMode,'original');
 }finally{store.stop();}
});
