import React from 'react';
import {ColorField} from './ColorField.jsx';
export function GradientField({node,paint,label,palette,set}) {
  const key=paint+'Gradient',g=node[key];
  const update=patch=>set(key,{...g,...patch});
  return <div className="gradient-field">
    <label className="check-field"><input type="checkbox" aria-label={label+'渐变'} checked={!!g} onChange={e=>set(key,e.target.checked?{type:'linear',angle:0,stops:[{offset:0,color:/^#/.test(node[paint])?node[paint]:'#b7d7d0'},{offset:1,color:'#b8b4d2'}]}:null)}/>{label}渐变</label>
    {g&&<>
      <label className="gradient-angle">方向 <select aria-label={label+'渐变方向'} value={g.angle} onChange={e=>update({angle:Number(e.target.value)})}>{[0,45,90,135,180,225,270,315,...(![0,45,90,135,180,225,270,315].includes(g.angle)?[g.angle]:[])].map(v=><option key={v} value={v}>{v}°</option>)}</select><input style={{width:60}} aria-label={label+'渐变角度'} type="number" min={0} max={359} step={1} value={g.angle} onChange={e=>{const a=e.target.valueAsNumber;if(Number.isFinite(a)&&a>=0&&a<360)update({angle:a});}}/></label>
      {g.stops.map((s,i)=><div className="gradient-stop" key={i}>
        <ColorField label={label+'色标'+(i+1)} value={s.color} palette={palette} onChange={color=>update({stops:g.stops.map((v,j)=>i===j?{...v,color}:v)})}/>
        <small>{Math.round(s.offset*100)}%</small>
        {i>0&&i<g.stops.length-1&&<button aria-label={'删除'+label+'色标'+(i+1)} onClick={()=>update({stops:g.stops.filter((_,j)=>j!==i)})}>×</button>}
      </div>)}
      {g.stops.length<8&&<button className="small-button" onClick={()=>{let index=0;for(let i=0;i<g.stops.length-1;i++)if(g.stops[i+1].offset-g.stops[i].offset>g.stops[index+1].offset-g.stops[index].offset)index=i;const stops=[...g.stops];stops.splice(index+1,0,{offset:(stops[index].offset+stops[index+1].offset)/2,color:'#d4e3df'});update({stops});}}>增加中间色标</button>}
    </>}
  </div>;
}
