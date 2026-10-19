import sharp from 'sharp';
import {ICONS,iconNodes} from './src/icon-library.js';
import {sceneSvg} from './src/render.js';
import {croppedData} from './server-export.mjs';
import {createHash} from 'node:crypto';
const fingerprint=n=>createHash('sha256').update(n.src+JSON.stringify(n.crop||null)).digest('hex');
const side=64;
function distance(mask){const d=Float32Array.from(mask,v=>v?0:999);for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=y*side+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y)d[i]=Math.min(d[i],d[i-side]+1);if(x&&y)d[i]=Math.min(d[i],d[i-side-1]+1.414);if(y&&x<side-1)d[i]=Math.min(d[i],d[i-side+1]+1.414);}for(let y=side-1;y>=0;y--)for(let x=side-1;x>=0;x--){const i=y*side+x;if(x<side-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<side-1)d[i]=Math.min(d[i],d[i+side]+1);if(x<side-1&&y<side-1)d[i]=Math.min(d[i],d[i+side+1]+1.414);if(x&&y<side-1)d[i]=Math.min(d[i],d[i+side-1]+1.414);}return d;}
async function maskFor(buffer){
  buffer=await sharp(buffer).resize(128,128,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const {data,info}=await sharp(buffer).flatten({background:'#ffffff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let xs=[],ys=[],colors=[];for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels,p=[data[i],data[i+1],data[i+2]];if(Math.min(...p)<170 && (Math.max(...p)-Math.min(...p)>20 || Math.max(...p)<170)){xs.push(x);ys.push(y);colors.push(p);}}
  if(xs.length<8)throw Error('没有足够的清晰图标笔画');
  const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left+1,height=Math.max(...ys)-top+1;
  const pixels=await sharp(buffer).extract({left,top,width,height}).flatten({background:'#ffffff'}).resize(56,56,{fit:'fill'}).extend({top:4,bottom:4,left:4,right:4,background:'#ffffff'}).removeAlpha().raw().toBuffer();
  const mask=Uint8Array.from({length:side*side},(_,i)=>Math.min(pixels[i*3],pixels[i*3+1],pixels[i*3+2])<170?1:0);
  colors.sort((a,b)=>a.reduce((s,v)=>s+v,0)-b.reduce((s,v)=>s+v,0));const core=colors.slice(0,Math.max(1,Math.round(colors.length*.4))),c=[0,1,2].map(i=>Math.round(core.reduce((s,p)=>s+p[i],0)/core.length));
  return {mask,dist:distance(mask),color:'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')};
}
let templates;
async function prototypes(){if(!templates)templates=(async()=>{const out=[];for(const kind of Object.keys(ICONS))for(const width of [1.2,1.6,2,2.5]){const nodes=iconNodes({id:'prototype',x:0,y:0,w:120,h:120},kind,'#000000',width*5);const png=await sharp(Buffer.from(sceneSvg({width:120,height:120,background:'#ffffff',nodes}).replaceAll('stroke-linecap="round"','stroke-linecap="butt"'))).png().toBuffer();out.push({kind,width,...await maskFor(png)});}return out;})();return templates;}
export async function recognizeIcon(n,{kind}={}) {
  if(n.type!=='image')throw Error('请选择独立图片图标');
  const raw=Buffer.from((await croppedData(n)).split(',')[1],'base64'),input=await maskFor(raw),candidates=[];
  for(const p of await prototypes()){
    let sumA=0,sumB=0,numA=0,numB=0,intersection=0,union=0;
    for(let i=0;i<input.mask.length;i++){const weight=1;if(input.mask[i]){sumA+=p.dist[i]*weight;numA+=weight;}if(p.mask[i]){sumB+=input.dist[i]*weight;numB+=weight;}if(input.mask[i]&&p.mask[i])intersection++;if(input.mask[i]||p.mask[i])union++;}
    candidates.push({kind:p.kind,width:p.width,score:(sumA/numA+sumB/numB)/2+(1-intersection/union)*1.5});
  }
  candidates.sort((a,b)=>a.score-b.score);const best=kind?candidates.find(c=>c.kind===kind):candidates[0],second=candidates.find(c=>c.kind!==best.kind);
  if(!best)throw Error('不支持此图标类型');
  return {id:n.id,kind:best.kind,label:ICONS[best.kind].label,score:best.score,margin:second.score-best.score,needsReview:best.score>2.5||second.score-best.score<.15,strokePolicy:'Clean stroke at 72% of bitmap-matched width, to avoid baking blurred edge halos into vector strokes',nodes:iconNodes(n,best.kind,input.color,best.width*Math.min(n.w,n.h)/24*.72),alternatives:candidates.filter((v,i,a)=>a.findIndex(q=>q.kind===v.kind)===i).slice(0,3).map(({kind,score})=>({kind,score}))};
}
export async function vectorizeIcons(scene,ids,options={}) {
  const selected=scene.nodes.filter(n=>ids.includes(n.id));
  if(!selected.length||selected.length>40||selected.some(n=>n.type!=='image'||n.locked))throw Error('请选择1–40个未锁定的独立图片图标');
  const matches=[];for(const n of selected)matches.push(await recognizeIcon(n,options));
  const changes=new Map(matches.map(m=>[m.id,m.nodes]));
  return {scene:{...scene,nodes:scene.nodes.flatMap(n=>changes.get(n.id)||[n])},matches:matches.map(({nodes,...m})=>m),note:'通过有限语义模板的轮廓匹配重建；不是通用位图描摹。请核对预览，原图可撤销恢复。'};
}
export async function packIconAtlas(scene,ids,revision) {
  const selected=scene.nodes.filter(n=>ids.includes(n.id));
  if(!selected.length||selected.length>40||selected.some(n=>n.type!=='image'||n.locked))throw Error('请选择1–40个未锁定的独立图标');
  const columns=Math.ceil(Math.sqrt(selected.length)),cell=224,width=columns*cell,height=width,composite=[],assets=[];
  for(let i=0;i<selected.length;i++){
    const n=selected[i],data=Buffer.from((await croppedData(n)).split(',')[1],'base64');
    const scaled=await sharp(data).resize(176,176,{fit:'inside'}).png().toBuffer(),meta=await sharp(scaled).metadata();
    const x=i%columns*cell+Math.round((cell-meta.width)/2),y=Math.floor(i/columns)*cell+Math.round((cell-meta.height)/2);
    composite.push({input:scaled,left:x,top:y});assets.push({id:n.id,slot:[x,y,meta.width,meta.height],fingerprint:fingerprint(n)});
  }
  return {png:await sharp({create:{width,height,channels:3,background:'white'}}).composite(composite).png().toBuffer(),manifest:{version:1,width,height,revision,assets},instruction:'保持图集尺寸、各槽位位置、图标含义和笔画拓扑。仅清晰化；单色线条、平面图标，不添加文字、阴影或3D装饰。生成后按实际图集尺寸切回，再匹配语义路径，用户核对预览。'};
}
export async function vectorizeEnhancedAtlas(scene,manifest,imageBytes) {
  if(manifest.version!==1||!Array.isArray(manifest.assets)||manifest.assets.length<1||manifest.assets.length>40||!(manifest.width>0&&manifest.height>0))throw Error('图集映射无效');
  const meta=await sharp(imageBytes).metadata();if(Math.abs(meta.width/meta.height-manifest.width/manifest.height)>.02)throw Error('重绘图集比例改变，请核对槽位');
  const matches=[],replacements=new Map();
  for(const a of manifest.assets){
    const current=scene.nodes.find(n=>n.id===a.id);
    if(!current||current.type!=='image'||current.locked||fingerprint(current)!==a.fingerprint)throw Error('图标内容已变化，请重新准备图集：'+a.id);
    const [x,y,w,h]=a.slot;
    if(![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>manifest.width||y+h>manifest.height)throw Error('槽位无效');
    const left=Math.round(x/manifest.width*meta.width),top=Math.round(y/manifest.height*meta.height),right=Math.min(meta.width,Math.round((x+w)/manifest.width*meta.width)),bottom=Math.min(meta.height,Math.round((y+h)/manifest.height*meta.height));
    const png=await sharp(imageBytes).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();
    const match=await recognizeIcon({...current,src:'data:image/png;base64,'+png.toString('base64'),crop:undefined});
    replacements.set(a.id,match.nodes);const {nodes,...summary}=match;matches.push(summary);
  }
  return {scene:{...scene,nodes:scene.nodes.flatMap(n=>replacements.get(n.id)||[n])},matches,note:'图集清晰化后重新识别。保留用户当前的位置、尺寸和其他编辑；重绘结果仍需核对图标含义和拓扑。'};
}
