import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sharp from 'sharp';
import {node,validateScene} from '../src/model.js';
import {sceneSvg} from '../src/render.js';
import {iconNodes} from '../src/icon-library.js';
import {exportBytes} from '../server-export.mjs';
import {recognizeIcon,packIconAtlas,vectorizeEnhancedAtlas} from '../server-icons.mjs';
const gradient={type:'linear',angle:0,stops:[{offset:0,color:'#ff0000'},{offset:1,color:'#0000ff'}]};
test('渐变方向、色标、圆角与PPTX原生几何保持一致',async()=>{
 const s=validateScene({width:400,height:200,nodes:[node('rect',{x:20,y:20,w:300,h:140,radius:28,fillGradient:gradient})]});
 assert.match(sceneSvg(s),/linearGradient/);
 const bytes=await sharp(await exportBytes(s,'png',{width:400})).removeAlpha().raw().toBuffer(),l=(90*400+50)*3,r=(90*400+290)*3;
 assert.ok(bytes[l]>bytes[l+2]+100);assert.ok(bytes[r+2]>bytes[r]+100);
 const xml=await(await JSZip.loadAsync(await exportBytes(s,'pptx'))).file('ppt/slides/slide1.xml').async('text');assert.match(xml,/<a:gradFill/);assert.match(xml,/fmla="val 20000"/);assert.ok(!xml.includes('<p:pic>'));
 assert.throws(()=>validateScene({...s,nodes:[{...s.nodes[0],fillGradient:{...gradient,stops:[...gradient.stops].reverse()}}]}));
});
async function icons(){
 const nodes=[];
 for(const [i,kind] of ['globe','search'].entries()){
  const source=node('path',{id:kind,x:0,y:0,w:96,h:96});const png=await exportBytes({width:100,height:100,background:'#ffffff',nodes:iconNodes(source,kind,'#000000',4)},'png',{width:100});
  nodes.push(node('image',{id:kind,x:20+i*140,y:20,w:96,h:96,src:'data:image/png;base64,'+png.toString('base64')}));
 }
 return validateScene({width:400,height:200,nodes});
}
test('图标识别提案与图集映射保留位置，内容改变时拒绝过期结果',async()=>{
 const original=await icons();for(const n of original.nodes)assert.equal((await recognizeIcon(n)).kind,n.id);
 const atlas=await packIconAtlas(original,['globe','search'],7),moved=structuredClone(original);moved.nodes[0].x+=25;
 const result=await vectorizeEnhancedAtlas(moved,atlas.manifest,atlas.png);assert.equal(result.scene.nodes.find(n=>n.id==='globe').x,moved.nodes[0].x);
 const changed=structuredClone(moved);changed.nodes[0].src=changed.nodes[1].src;await assert.rejects(()=>vectorizeEnhancedAtlas(changed,atlas.manifest,atlas.png),/内容已变化/);
});
