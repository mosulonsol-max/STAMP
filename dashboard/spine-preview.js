'use strict';
(() => {
 const tau = Math.PI * 2;
 const colors = {
  trades:'#e7ba70', liquidity:'#72dad9', candles:'#91adff',
  collect:'#7dceda', compute:'#aebafe', forecast:'#ffca83', verify:'#82ddb0', learn:'#ccacf9'
 };
 const turns=Array.from({length:97},(_,i)=>i*tau/96);
 const major=124, minor=49;
 function draw(ctx,{w,h,angle,stage,available,evidence,matched,trace,reduceMotion,now}){
  const scale=Math.min(w/590,h/470);
  const project=(x,y,z)=>{
   const depth=z*Math.cos(angle)+x*Math.sin(angle);
   const k=720/(720-depth);
   return {x:w*.49+(x*Math.cos(angle)-z*Math.sin(angle))*scale*k,y:h*.47+(y+.16*depth)*scale*k,z:depth};
  };
  const torus=(u,v)=>{
   const radius=major+minor*Math.cos(v);
   return project(.83*radius*Math.cos(u)+.65*minor*Math.sin(v),radius*Math.sin(u),
    minor*Math.sin(v)-.56*radius*Math.cos(u));
  };
  const stroke=(points,color,width,dash=[])=>{
   if(points.length<2)return;
   ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
   for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
   ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
  };
  const dot=(p,color,r)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r,0,tau);ctx.fill()};
  const label=(p,value,color,align='left')=>{
   ctx.font='600 '+Math.max(10,12*scale)+'px ui-monospace, monospace';
   ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;
   ctx.fillText(value,p.x,p.y);
  };
  const middle=project(0,0,0);
  ctx.save();
  for(let x=middle.x%24;x<w;x+=24)stroke([{x,y:0},{x,y:h}],'#20304766',.65);
  for(let y=middle.y%24;y<h;y+=24)stroke([{x:0,y},{x:w,y}],'#20304766',.65);
  stroke([{x:0,y:middle.y},{x:w,y:middle.y}],'#4255737a',.8,[4,5]);
  stroke([{x:middle.x,y:0},{x:middle.x,y:h}],'#4255737a',.8,[4,5]);
  const glow=ctx.createRadialGradient(middle.x,middle.y,8,middle.x,middle.y,200*scale);
  glow.addColorStop(0,'#3678a216');glow.addColorStop(.7,'#3d64b01d');glow.addColorStop(1,'#05081600');
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  for(let lane=0;lane<37;lane++){
   const v=lane*tau/37;
   stroke(turns.map(u=>torus(u,v)),'#8bb7ef52',.68);
   stroke(turns.map(u=>torus(u,v+u*(lane%2===0?2:-2))),
    lane%3===0?'#9deae44f':'#b7cafa40',.68);
  }
  for(let lane=0;lane<48;lane++){
   const u=lane*tau/48,v=lane*2.399963;
   stroke(turns.filter((_,i)=>i%4===0).map(t=>torus(u,t)),'#a3beff36',.6);
   const p=torus(u,v);
   dot(p,p.z>0?'#d8edffb5':'#a1c6e560',lane%8===0?1.8:1);
  }
  const gates={
   trades:project(-269,-124,0),liquidity:project(-273,-17,0),candles:project(-268,100,0),
   collect:torus(3.35,.3), compute:torus(4.72,1.25),
   forecast:project(245,-83,0),verify:torus(.71,.2),learn:torus(1.43,1.35),
   liquidityContext:torus(2.75,.4),quote:project(-269,-124,0)
  };
  const names={trades:'TRADES',liquidity:'DEPTH',candles:'CANDLES',collect:'COLLECT',compute:'MODEL',
   forecast:'FORECAST',verify:'VERIFY',learn:'LEARN'};
  const segments=[
   ['trades','collect'],['quote','collect'],['liquidity','liquidityContext'],['candles','collect'],
   ['collect','compute'],['compute','forecast'],['forecast','verify'],['verify','learn'],['learn','compute']
  ];
  for(const [from,to] of segments){
   if(from==='quote')continue;
   const ready=available[from]??(to==='forecast'?matched:false);
   stroke([gates[from],gates[to]],ready?colors[from]:'#647da481',ready?1.3:.9,ready?[]:[3,5]);
  }
  const observed=(values,valueOf,start,length,color)=>{
   const peak=values.reduce((max,item)=>Math.max(max,Math.abs(valueOf(item))||0),0);
   if(!peak)return;
   values.forEach((item,i)=>{
    const magnitude=Math.abs(valueOf(item))/peak;
    if(!Number.isFinite(magnitude))return;
    const u=start+length*i/Math.max(1,values.length-1);
    const v=.64+magnitude*1.25;
    dot(torus(u,v),typeof color==='function'?color(item):color,1.15+magnitude*1.45);
   });
  };
  observed(evidence.trades,t=>Number(t.notional),2.85,1.45,t=>t.side==='sell'?'#ff826f':'#66ecc0');
  const size=level=>Number(Array.isArray(level)?level[1]:level?.quantity??level?.size);
  observed(evidence.bids.slice(0,14),size,1.6,.7,'#66e8b9');
  observed(evidence.asks.slice(0,14),size,2.28,.65,'#e98c8d');
  observed(evidence.candles,c=>Number(c.c)-Number(c.o),4.2,1.4,c=>c.c<c.o?'#ff826f':'#b3cfff');
  let activeNode=null;
  if(trace){
   const route=trace.path.map(id=>gates[id]);
   const progress=reduceMotion?1:Math.min(1,Math.max(0,(now-trace.at)/trace.duration));
   const step=progress*(route.length-1);
   const index=Math.min(route.length-2,Math.floor(step));
   const a=route[index],b=route[index+1],t=step-index;
   activeNode=trace.path[t>.83?index+1:index];
   stroke(route.slice(0,index+1),trace.color,1.6);
   stroke([a,b],trace.color,.9,[3,4]);
   const tail=Array.from({length:12},(_,i)=>{
    const s=Math.max(0,t-(11-i)*.022);
    const ripple=reduceMotion?0:Math.sin(i*1.8+now/65)*Math.sin(i*Math.PI/11)*3;
    return {x:a.x+(b.x-a.x)*s,y:a.y+(b.y-a.y)*s+ripple};
   });
   ctx.shadowColor=trace.color;ctx.shadowBlur=18;
   stroke(tail,trace.color,2.2);dot(tail.at(-1),trace.color,4.6);ctx.shadowBlur=0;
  }
  const hits=[];
  for(const [id,name] of Object.entries(names)){
   const p=gates[id],source=Object.hasOwn(available,id);
   const tone=id===activeNode?trace.color:source&&!available[id]?'#8e9eac':colors[id];
   dot(p,'#060b12',7);dot(p,tone,id===activeNode?6:id===stage?5:3.2);
   label({x:p.x,y:p.y-14},name,tone,source?'left':'center');
   hits.push({x:p.x,y:p.y-6,radius:22,kind:source?'source':'stage',id});
  }
  ctx.restore();
  return hits;
 }
 window.StampSpine={draw};
})();
