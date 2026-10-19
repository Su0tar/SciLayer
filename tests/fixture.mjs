import {node,validateScene} from '../src/model.js';
export function fixture(){return validateScene({name:'Geometry regression fixture',width:1440,height:900,nodes:[
 node('rect',{id:'frame',name:'Module',x:80,y:80,w:280,h:180}),
 node('text',{id:'label',x:110,y:130,w:220,h:45,text:'样本数据',fill:'none',stroke:'none'}),
 node('rect',{id:'target',x:550,y:80,w:280,h:180}),
 node('arrow',{id:'connector',name:'connector',from:'frame',to:'target',route:'straight',stroke:'#526f9e',fill:'none'}),
 node('arrow',{id:'feedback',name:'feedback',from:'target',to:'frame',route:'bottom',stroke:'#526f9e',fill:'none'})
]});}
