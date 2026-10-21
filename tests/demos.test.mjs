import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sharp from 'sharp';
import {listExamples,readExample} from '../server-demos.mjs';
import {exportBytes} from '../server-export.mjs';

test('两个内置示例自包含，可渲染PNG并导出原生PPTX文字和形状',async()=>{
  assert.deepEqual(listExamples().map(e=>e.id),['medical','planning']);
  await assert.rejects(()=>readExample('../data/current'),/示例不存在/);
  for(const item of listExamples()){
    const {scene}=await readExample(item.id);
    assert.equal(scene.nodes.length,item.objects);
    for(const n of scene.nodes.filter(n=>n.type==='image'))assert.match(n.src,/^data:image\/png;base64,/);
    const png=await exportBytes(scene,'png',{width:1000});
    assert.equal((await sharp(png).metadata()).width,1000);
    const stats=await sharp(png).stats();assert.ok(stats.channels.some(c=>c.stdev>10));
    const pptx=await JSZip.loadAsync(await exportBytes(scene,'pptx'));
    const xml=await pptx.file('ppt/slides/slide1.xml').async('string');
    assert.match(xml,/<a:t>/);assert.match(xml,/<p:sp>/);
    if(item.id==='medical')assert.match(xml,/<p:pic>/);
    if(item.id==='planning')assert.ok(!scene.nodes.some(n=>n.type==='image'));
  }
});
