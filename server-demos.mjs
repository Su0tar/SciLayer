import {readFile} from 'node:fs/promises';
import {validateScene} from './src/model.js';

const catalog = [
  {id:'medical',name:'医学 · 壳聚糖生物材料',description:'独立文字、框线与箭头，搭配可移动的复杂插画图层。',objects:137},
  {id:'planning',name:'规划 · 规则与实施核查',description:'原生文字、框线、连接线与单色矢量图标。',objects:211},
];
export function listExamples(){return catalog.map(item=>({...item}));}
export async function readExample(id){
  const item=catalog.find(item=>item.id===id);
  if(!item)throw Error('示例不存在');
  const scene=validateScene(JSON.parse(await readFile(new URL(`./demo/${item.id}.figure.json`,import.meta.url),'utf8')));
  return {...item,scene};
}
