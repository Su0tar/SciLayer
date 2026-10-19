import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {readPsd} from 'ag-psd';
import {node,arrowPoints,clone,applyLocalCommand} from '../src/model.js';
import {moveNodes,pathNode,mergeScenes,applyOperations} from '../src/operations.js';
import {exportBytes} from '../server-export.mjs';
import {fixture} from './fixture.mjs';
test('复杂连接线整体移动与单点编辑，锁定与三方合并保护用户修改',()=>{
 const base=fixture(),route=node('arrow',{id:'manual',x:20,y:400,w:400,h:200,route:'manual',points:[[0,0],[.2,.3],[.4,.4],[.6,.6],[1,1]],headStart:true});base.nodes.push(route);
 const old=arrowPoints(route,base.nodes),m=moveNodes(base,['manual'],20,-10);
 assert.deepEqual(arrowPoints(m.nodes.at(-1),m.nodes),old.map(([x,y])=>[x+20,y-10]));
 const changed=pathNode(route,old.map((p,i)=>i===2?[p[0]+40,p[1]]:p));assert.ok(Math.abs(arrowPoints(changed,base.nodes)[2][0]-old[2][0]-40)<.001);
 const l=clone(base),r=clone(base);l.nodes[0].x+=20;r.nodes[0].color='#123456';assert.deepEqual(mergeScenes(base,l,r).conflicts,[]);r.nodes[0].x+=80;assert.ok(mergeScenes(base,l,r).conflicts.length);
 base.nodes[0].locked=true;assert.throws(()=>applyOperations(base,[{type:'update',id:'frame',changes:{x:123}}]),/锁定/);
});
test('当前修改贯穿PPTX、SVG、PNG和PSD独立文字图层',async()=>{
 const s=fixture();s.nodes.find(n=>n.id==='label').text='修改验证';const a=s.nodes.find(n=>n.id==='connector');a.dash='dot';a.headStart=true;
 const zip=await JSZip.loadAsync(await exportBytes(s,'pptx')),xml=await zip.file('ppt/slides/slide1.xml').async('text');
 assert.match(xml,/修改验证/);assert.match(xml,/sysDot/);assert.ok(!xml.includes('<p:pic>'));
 assert.match((await exportBytes(s,'svg')).toString(),/修改验证/);
 const psd=readPsd(await exportBytes(s,'psd'),{skipThumbnail:true});const leaves=ls=>ls.flatMap(n=>n.children?leaves(n.children):[n]);
 assert.ok(leaves(psd.children).some(n=>n.text?.text==='修改验证'));
 assert.equal((await exportBytes(s,'png',{width:1200})).subarray(1,4).toString(),'PNG');
 assert.equal(applyLocalCommand(s,'改成虚线',['connector']).scene.nodes.find(n=>n.id==='connector').dash,'dash');
});
