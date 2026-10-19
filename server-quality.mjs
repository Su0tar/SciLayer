import sharp from 'sharp';

// Screening only: edge statistics depend on content, scale and antialiasing.
export async function assessImageQuality(bytes, {targetWidth=2000}={}) {
  if(!Number.isFinite(targetWidth)||targetWidth<100||targetWidth>8000)throw Error('目标宽度应为100–8000');
  const image=sharp(bytes,{limitInputPixels:40_000_000}).rotate();
  const meta=await image.metadata();
  if(!['png','jpeg','webp'].includes(meta.format))throw Error('仅支持PNG/JPEG/WebP');
  const {data,info}=await image.clone().flatten({background:'#ffffff'}).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).greyscale().raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height;let sum=0,sum2=0,count=0,ink=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,c=data[i]; if(c<245)ink++;
    // Ignore uniform background so whitespace does not itself imply blur.
    const hi=Math.max(c,data[i-1],data[i+1],data[i-w],data[i+w]),lo=Math.min(c,data[i-1],data[i+1],data[i-w],data[i+w]);
    if(hi-lo<8)continue;
    const lap=4*c-data[i-1]-data[i+1]-data[i-w]-data[i+w];sum+=lap;sum2+=lap*lap;count++;
  }
  const variance=count?sum2/count-(sum/count)**2:0;
  const orientationSwap=[5,6,7,8].includes(meta.orientation),width=orientationSwap?meta.height:meta.width,height=orientationSwap?meta.width:meta.height;
  const reasons=[];
  if(Math.min(width,height)<800)reasons.push('短边不足800px，小字和细线可能不够清楚');
  if(width<targetWidth*.65)reasons.push(`原始宽度${width}px，低于目标预览${targetWidth}px的65%`);
  if(count>100&&variance<300)reasons.push('局部边缘偏软，需检查小字、轮廓或已有放大痕迹');
  const contentFraction=ink/Math.max(1,(w-2)*(h-2));
  const inconclusive=count<100||contentFraction<.002;
  return {width,height,targetWidth,sampledEdgeVariance:Math.round(variance),sampledEdges:count,
    status:inconclusive?'inconclusive':reasons.length?'review-recommended':'no-obvious-resolution-issue',reasons,
    recommendation:inconclusive?'图像内容或边缘不足，请人工查看。':reasons.length?'结合原图检查具体区域；可向用户推荐imagegen清晰重绘，也可保留原图转换。':'无需仅因尺寸主动要求高清化；仍需视觉核对。',
    enhancementRequiresUserChoice:true,automaticallyEnhanced:false,
    limitations:'启发式筛查，不做OCR；高分不能证明小字可读、没有遮挡或科学内容正确。不会调用模型或修改画布。'};
}
