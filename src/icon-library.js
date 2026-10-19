import {node} from './model.js';
const circle=(x,y,r)=>{const k=r*.55228475;return [['M',x+r,y],['C',x+r,y+k,x+k,y+r,x,y+r],['C',x-k,y+r,x-r,y+k,x-r,y],['C',x-r,y-k,x-k,y-r,x,y-r],['C',x+k,y-r,x+r,y-k,x+r,y],['Z']];};
const box=(x,y,w,h)=>[['M',x,y],['L',x+w,y],['L',x+w,y+h],['L',x,y+h],['Z']];
const document=[['M',4,2],['L',15,2],['L',21,8],['L',21,22],['L',4,22],['Z'],['M',15,2],['L',15,8],['L',21,8],['M',7,8],['L',11,8],['M',7,12],['L',17,12],['M',7,16],['L',17,16],['M',7,19],['L',13,19]];
export const ICONS={
  document:{label:'文档',commands:document},
  users:{label:'责任主体',commands:[...circle(12,6,4),...circle(5,9,3),...circle(19,9,3),['M',5,22],['L',5,17],['C',5,10,19,10,19,17],['L',19,22],['Z'],['M',5,14],['C',1,14,1,17,1,22],['L',5,22],['M',19,14],['C',23,14,23,17,23,22],['L',19,22]]},
  globe:{label:'地球',commands:[...circle(12,12,10),['M',12,2],['C',3,7,3,17,12,22],['C',21,17,21,7,12,2],['M',12,2],['L',12,22],['M',3,8],['C',9,9,15,9,21,8],['M',2,12],['L',22,12],['M',3,17],['C',9,16,15,16,21,17]]},
  search:{label:'放大镜',commands:[...circle(10,10,7.5),['M',15.5,15.5],['L',22,22]]},
  anchor:{label:'锚点',commands:[...circle(12,4,2.6),['M',12,7],['L',12,22],['M',6,9],['L',18,9],['M',2,15],['C',3,24,21,24,22,15],['M',2,15],['L',2,19],['M',2,15],['L',6,17],['M',22,15],['L',22,19],['M',22,15],['L',18,17]]},
  clipboard:{label:'补证清单',commands:[...box(4,4,16,18),['M',9,4],['L',9,2],['L',11,2],['Q',12,-.5,13,2],['L',15,2],['L',15,5],['L',9,5],['M',8,10],['L',8.1,10],['M',11,10],['L',17,10],['M',8,14],['L',8.1,14],['M',11,14],['L',17,14],['M',8,18],['L',8.1,18],['M',11,18],['L',17,18]]},
  hierarchy:{label:'统筹层级',commands:[...box(10,2,4,5),...box(2,17,4,5),...box(10,17,4,5),...box(18,17,4,5),['M',12,7],['L',12,17],['M',4,17],['L',4,12],['L',20,12],['L',20,17]]},
  refresh:{label:'转换路径',commands:[['M',3,10],['C',4,0,18,0,21,6],['M',17,6],['L',21,6],['L',21,1],['M',21,14],['C',20,24,6,24,3,18],['M',7,18],['L',3,18],['L',3,23]]},
  stop:{label:'停止标志',commands:[['M',7,1],['L',17,1],['L',23,7],['L',23,17],['L',17,23],['L',7,23],['L',1,17],['L',1,7],['Z']],hand:[['M',8,13],['L',8,6],['Q',8,4,10,5],['L',10,11],['L',10,4],['Q',11,2,12,4],['L',12,11],['L',12,4],['Q',14,3,14,5],['L',14,11],['L',14,6],['Q',16,5,16,7],['L',16,15],['Q',16,20,12,20],['Q',9,20,7,17],['L',5,13],['Q',5,11,7,12],['Z']]},
};
export function iconNodes(source,kind,color='#344c58',strokeWidth=1.6) {
  const icon=ICONS[kind];if(!icon)throw Error('未知图标');
  const make=(commands,fill,stroke,sw,id)=>node('path',{...source,type:'path',src:undefined,crop:undefined,id,name:'矢量图标_'+icon.label+(id===source.id?'':'_手势'),groupId:'vector-icon-'+source.id,commands:commands.map(([cmd,...values])=>({cmd,values:values.map(v=>v/24)})),fill,stroke,strokeWidth:sw,iconKind:kind,fillGradient:undefined,strokeGradient:undefined,radius:0});
  return kind==='stop'?[make(icon.commands,'#d43b2b','none',0,source.id),make(icon.hand,'#ffffff','none',0,source.id+'__hand')]:[make(icon.commands,'none',color,strokeWidth,source.id)];
}
