import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {assessImageQuality} from '../server-quality.mjs';
const image=async(w,blur=false)=>{
 let s=sharp(Buffer.from(`<svg width="${w}" height="${w}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><path d="M${w*.1} ${w*.1} H${w*.9} V${w*.9} H${w*.1}Z" fill="none" stroke="black" stroke-width="${w*.01}"/></svg>`));
 if(blur)s=s.blur(6);return s.png().toBuffer();
};
test('低分辨率先建议复核，高分也不保证科学正确，所有检测均不增强',async()=>{
 const low=await assessImageQuality(await image(300));assert.equal(low.status,'review-recommended');assert.ok(low.reasons.length);
 const sharpResult=await assessImageQuality(await image(2000)),soft=await assessImageQuality(await image(2000,true));
 assert.ok(sharpResult.sampledEdgeVariance>soft.sampledEdgeVariance);
 for(const q of [low,sharpResult,soft]){assert.equal(q.enhancementRequiresUserChoice,true);assert.equal(q.automaticallyEnhanced,false);}
 const blank=await sharp({create:{width:1200,height:1200,channels:3,background:'white'}}).png().toBuffer();
 assert.equal((await assessImageQuality(blank)).status,'inconclusive');await assert.rejects(()=>assessImageQuality(Buffer.from('invalid')));
});
