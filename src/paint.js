export function normalizeGradient(g) {
  if (g == null) return undefined;
  if (g.type !== 'linear' || !Number.isFinite(g.angle) || !Array.isArray(g.stops) || g.stops.length < 2 || g.stops.length > 8)
    throw Error('渐变格式无效：线性渐变需要2–8个色标');
  const stops = g.stops.map(s => {
    if (!Number.isFinite(s.offset) || s.offset < 0 || s.offset > 1 || !/^#[0-9a-f]{6}$/i.test(s.color)) throw Error('渐变色标无效');
    return { offset:s.offset, color:s.color };
  });
  if (stops[0].offset!==0 || stops.at(-1).offset!==1 || stops.some((s,i)=>i && s.offset<=stops[i-1].offset)) throw Error('渐变色标须从0到1递增');
  return { type:'linear', angle:((g.angle%360)+360)%360, stops };
}
export function gradientLine(n,g) {
  const a=g.angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),length=Math.abs(dx)*n.w+Math.abs(dy)*n.h;
  return [n.x+n.w/2-dx*length/2,n.y+n.h/2-dy*length/2,n.x+n.w/2+dx*length/2,n.y+n.h/2+dy*length/2];
}
export function canvasPaint(ctx,n,key) {
  const g=n[key+'Gradient']; if (!g) return n[key];
  const paint=ctx.createLinearGradient(...gradientLine(n,g));
  for(const s of g.stops)paint.addColorStop(s.offset,s.color);
  return paint;
}
export function pathHeads(n) {
  let start,current,firstDirection,lastDirection;
  for(const c of n.commands||[]) {
    const a=c.values.map((v,i)=>i%2?n.y+v*n.h:n.x+v*n.w);
    if(c.cmd==='M'){current=a;if(!start)start=a;}
    else if(c.cmd!=='Z') {
      const end=a.slice(-2), first=c.cmd==='L'?end:a.slice(0,2),previous=c.cmd==='C'?a.slice(2,4):c.cmd==='Q'?a.slice(0,2):current;
      if(!firstDirection && Math.hypot(first[0]-current[0],first[1]-current[1])>.01)firstDirection=first;
      lastDirection=previous;current=end;
    }
  }
  return [...(n.headStart&&start&&firstDirection?[[firstDirection,start]]:[]),...(n.headEnd&&current&&lastDirection?[[lastDirection,current]]:[])];
}
