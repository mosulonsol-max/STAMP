'use strict';
(() => {
 function draw(ctx,{w,h,angle,stage,available,evidence,matched,events,now,lifetime}) {
  const scale=Math.min(w/535,h/408);
  const project=(x,y,z)=>{
   const d=z*Math.cos(angle)+x*Math.sin(angle), k=770/(770-d);
   return {x:w*.49+(x*Math.cos(angle)-z*Math.sin(angle))*scale*k,y:h*.5+(y+d*.12)*scale*k,z:d};
  };
  const ribbon=(t,v)=>project(173*Math.sin(t)-24,43*t+v*(25+8*Math.cos(t)*Math.cos(t)),84*Math.cos(t)+v*8);
  const trace=(points,color,width,dash=[])=>{
   ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
   for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
   ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
  };
  const point=(p,color,r)=>{
   ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
  };
  const label=(p,text,color,align='left')=>{
   ctx.font='600 '+Math.max(9,12*scale)+'px system-ui';ctx.textAlign=align;ctx.textBaseline='middle';
   ctx.fillStyle=color;ctx.fillText(text,p.x,p.y);
  };
  const stops=Array.from({length:161},(_,i)=>-3.9+i*.048125);
  const panels=stops.slice(1).map((b,i)=>{
   const a=stops[i],corners=[ribbon(a,-1),ribbon(b,-1),ribbon(b,1),ribbon(a,1)];
   return {corners,depth:corners.reduce((sum,p)=>sum+p.z,0)/4,light:.5+.5*Math.sin((a+b)*.5+angle)};
  });
  for(const {corners:p,light} of panels.sort((a,b)=>a.depth-b.depth)){
   const g=ctx.createLinearGradient(p[0].x,p[0].y,p[3].x,p[3].y);
   const spec=Math.pow(light,6);
   g.addColorStop(0,`rgb(${102+78*spec} ${134+70*spec} ${151+73*spec})`);
   g.addColorStop(.065,`rgb(${51+52*light} ${68+57*light} ${81+63*light})`);
   g.addColorStop(.37,`rgb(${24+53*spec} ${34+52*spec} ${43+58*spec})`);
   g.addColorStop(.75,`rgb(${14+29*light} ${22+32*light} ${29+34*light})`);
   g.addColorStop(.96,`rgb(${55+42*light} ${78+43*light} ${91+51*light})`);
   g.addColorStop(1,'#425661');
   ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);p.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));ctx.closePath();
   ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=g;ctx.lineWidth=.85;ctx.stroke();

  }
  trace(stops.map(t=>ribbon(t,-1)),'#b9d2e286',.8);
  trace(stops.map(t=>ribbon(t,1)),'#79a6b76e',.8);
  const plot=(rows,from,to,measure,color)=>{
   const valid=rows.map(measure).filter(value=>Number.isFinite(value)&&value>0).slice(0,18);
   const peak=Math.max(...valid);
   valid.forEach((value,i)=>{
    const t=from+(to-from)*i/Math.max(1,valid.length-1);
    trace([ribbon(t,.48),ribbon(t,.48-value/peak*.92)],color,Math.max(1,3*scale));
   });
  };
  plot(evidence?.trades||[],-2.82,-1.85,row=>row.notional,'#e8b783ae');
  plot([...(evidence?.bids||[]).slice(0,8),...(evidence?.asks||[]).slice(0,8)],-.7,.6,row=>Number(row.qty??row.quantity),'#72d2caae');
  const candles=evidence?.candles||[];
  if(candles.length){
   const low=Math.min(...candles.map(c=>c.l)),high=Math.max(...candles.map(c=>c.h));
   const v=value=>.56-(value-low)/Math.max(high-low,Math.abs(high)*1e-12,1e-16)*1.12;
   candles.forEach((c,i)=>{
    const t=1.8+1.15*i/Math.max(1,candles.length-1),color=c.c>=c.o?'#8ee1ce':'#e49a85';
    trace([ribbon(t,v(c.h)),ribbon(t,v(c.l))],color,.8);
    trace([ribbon(t,v(c.o)),ribbon(t,v(c.c))],color,Math.max(1.4,3.4*scale));
   });
  }
  const nodes={
   quote:project(-233,-112,0),collect:ribbon(-2.72,0),compute:ribbon(-.82,0),
   forecast:project(198,5,0),verify:ribbon(1.28,0),learn:ribbon(2.67,0)
  };
  for(const key of ['15m','1h','4h','1d'])nodes[key]=nodes.forecast;
  const paths=[
   {name:'Trades',at:project(-233,-112,0),tip:nodes.collect,ready:available.trades,color:'#eab77b'},
   {name:'Liquidity',at:project(-233,-12,0),tip:ribbon(0,0),ready:available.liquidity,color:'#80c7cb'},
   {name:'Candles',at:project(-233,95,0),tip:nodes.compute,ready:available.candles,color:'#92dfd2'}
  ];
  for(const item of paths){
   const color=item.ready?item.color:'#697982';
   ctx.shadowColor=color;ctx.shadowBlur=item.ready?8:0;
   trace([item.at,{x:item.tip.x*.55+item.at.x*.45,y:item.at.y},item.tip],color,1.45,item.name==='Candles'?[]:[3,4]);
   ctx.shadowBlur=0;
   point(item.at,color,3.8);label({x:item.at.x,y:item.at.y-15},item.name,color);
  }
  trace(stops.map(t=>ribbon(t,0)),'#79c8d145',1);
  trace([nodes.compute,nodes.forecast],matched?'#ffc990':'#7f8b96',1.5,matched?[]:[3,4]);
  const hits=paths.map(item=>({x:item.at.x,y:item.at.y-7,kind:'source',id:item.name.toLowerCase(),radius:22}));
  for(const [id,p] of Object.entries(nodes).slice(1,6)){
   const color=id===stage?'#ffd199':id==='forecast'&&matched?'#ffca88':'#95c6ca';
   point(p,'#122330',8);point(p,color,id===stage?5:3.5);
   hits.push({x:p.x,y:p.y,kind:'stage',id,radius:18});
  }
  label({x:nodes.forecast.x,y:nodes.forecast.y-16},'Forecast',matched?'#ffca88':'#a1abb6','center');
  for(const event of events){
   const f=(now-event.at)/lifetime;
   const route=event.path.map(k=>nodes[k]).filter(Boolean);
   if(f<0||f>=1||route.length<2)continue;
   const pos=f*(route.length-1),idx=Math.floor(pos),a=route[idx],b=route[idx+1],t=pos-idx;
   if(a===b)continue;
   const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
   ctx.shadowBlur=15;ctx.shadowColor=event.color;point(p,event.color,4);ctx.shadowBlur=0;
  }
  return hits;
 }
 window.StampSpine={draw};
})();
