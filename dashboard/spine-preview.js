'use strict';
(() => {
 function draw(ctx,{w,h,angle,stage,available,matched,events,now,lifetime}) {
  const scale=Math.min(w/585,h/400);
  const project=(x,y,z)=>{
   const d=z*Math.cos(angle)+x*Math.sin(angle), k=770/(770-d);
   return {x:w*.49+(x*Math.cos(angle)-z*Math.sin(angle))*scale*k,y:h*.5+(y+d*.12)*scale*k,z:d};
  };
  const ribbon=(t,v)=>project(153*Math.sin(t),43*t+v*35,65*Math.cos(t));
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
  const stops=Array.from({length:101},(_,i)=> -3.6+i*.072);
  const panels=stops.slice(1).map((b,i)=>{
   const a=stops[i],corners=[ribbon(a,-1),ribbon(b,-1),ribbon(b,1),ribbon(a,1)];
   return {corners,depth:corners.reduce((sum,p)=>sum+p.z,0)/4,light:.5+.5*Math.sin((a+b)*.5+angle)};
  });
  for(const {corners:p,light} of panels.sort((a,b)=>a.depth-b.depth)){
   const g=ctx.createLinearGradient(p[0].x,p[0].y,p[3].x,p[3].y);
   g.addColorStop(0,'rgba(148,181,200,.9)');
   g.addColorStop(.11,'rgba(74,104,124,.94)');
   g.addColorStop(.48,'rgba(32,53,69,.96)');
   g.addColorStop(.87,'rgba(10,21,30,.96)');
   g.addColorStop(1,'rgba(95,135,153,.85)');
   ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);p.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));ctx.closePath();
   ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=g;ctx.lineWidth=.85;ctx.stroke();
   ctx.fillStyle='rgba(218,239,248,'+(light*.1)+')';ctx.fill();
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
   trace([item.at,{x:item.tip.x*.55+item.at.x*.45,y:item.at.y},item.tip],color,1.45,item.name==='Candles'?[]:[3,4]);
   point(item.at,color,3.8);label({x:item.at.x,y:item.at.y-15},item.name,color);
  }
  trace(stops.map(t=>ribbon(t,0)),'#79c8d145',1);
  trace([nodes.compute,nodes.forecast],matched?'#ffc990':'#7f8b96',1.5,matched?[]:[3,4]);
  const hits=[];
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
