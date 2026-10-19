import test from 'node:test';
import assert from 'node:assert/strict';
import {template,node,validateScene,arrowPoints,applyLocalCommand} from '../src/model.js';
import {sceneSvg,auditScene} from '../src/render.js';
import {parseAIJSON} from '../src/ai-schema.js';
import {fixture} from './fixture.mjs';
test('首次使用空白画布；校验拒绝重复ID、无穷坐标和远程图片',()=>{
 assert.deepEqual(template().nodes,[]);assert.equal(template().background,'#ffffff');
 const a=fixture();a.nodes.push(a.nodes[0]);assert.throws(()=>validateScene(a),/重复/);
 const b=fixture();b.nodes[0].x=Infinity;assert.throws(()=>validateScene(b));
 const c=fixture();c.nodes.push(node('image',{src:'https://invalid.example/image.png'}));assert.throws(()=>validateScene(c),/内嵌/);
});
test('文本规则修改真实对象且不修改原场景，SVG转义文字',()=>{
 const s=fixture(),next=applyLocalCommand(s,'将“样本数据”改为“校验数据”').scene;
 assert.equal(next.nodes.find(n=>n.id==='label').text,'校验数据');assert.equal(s.nodes.find(n=>n.id==='label').text,'样本数据');
 assert.equal(applyLocalCommand(s,'改成蓝色',['label']).scene.nodes.find(n=>n.id==='label').color,'#526f9e');
 next.nodes.push(node('text',{text:'<script> & 科研'}));assert.match(sceneSvg(next),/&lt;script&gt; &amp; 科研/);assert.ok(!sceneSvg(next).includes('<script>'));
});
test('连接线跟随目标，布局检查能发现压字与溢出，JSON拒绝无效响应',()=>{
 const s=fixture(),a=s.nodes.find(n=>n.id==='connector'),p=arrowPoints(a,s.nodes);s.nodes.find(n=>n.id==='target').x+=100;
 assert.equal(arrowPoints(a,s.nodes).at(-1)[0],p.at(-1)[0]+100);
 const bad={width:1000,height:800,nodes:[node('text',{x:20,y:20,w:30,h:10,text:'超长文字超长文字',fontSize:30}),node('arrow',{x:0,y:25,w:100,h:1})]};
 assert.ok(auditScene(bad).some(x=>x.message.includes('经过')));assert.ok(auditScene(bad).some(x=>x.message.includes('超出')));
 assert.deepEqual(parseAIJSON('```json\n{"a":1}\n```'),{a:1});assert.throws(()=>parseAIJSON('invalid'));
});
