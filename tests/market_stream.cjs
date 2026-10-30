'use strict';
const assert=require('node:assert/strict');
const {decode,Stream}=require('../dashboard/market-stream.js');
const vi=v=>{let n=BigInt(v),a=[];do{let b=Number(n&127n);n>>=7n;a.push(b|(n?128:0))}while(n);return Buffer.from(a)};
const field=(tag,value)=>{if(typeof value==='number')return Buffer.concat([vi(tag*8),vi(value)]);const b=Buffer.isBuffer(value)?value:Buffer.from(value);return Buffer.concat([vi(tag*8+2),vi(b.length),b])};
const message=(type,body,channel,symbol='STAMPUSDT',time=Date.now())=>Buffer.concat([field(1,channel),field(3,symbol),field(6,time),field(type,body)]);
const ticker=(price='0.001',time=Date.now())=>message(309,Buffer.concat([field(1,'STAMPUSDT'),field(2,price),field(4,'.025'),field(5,'.002'),field(6,'.0005'),field(7,'50000'),field(8,'1000000')]),'spot@public.miniTicker.v3.api.pb@STAMPUSDT@24H','STAMPUSDT',time);
if(require.main===module){
 let d=decode(ticker(),'STAMPUSDT');assert.equal(d.quote.change_24h_pct,2.5);assert.equal(d.quote.price,.001);assert.equal(d.quote.volume_24h_usdt,50000);
 assert.equal(decode(ticker(),'BTCUSDT'),null);assert.equal(decode(ticker('NaN'),'STAMPUSDT'),null);assert.equal(decode(ticker('0.001',Date.now()-20000),'STAMPUSDT'),null);assert.equal(decode(ticker('0.001',Date.now()+6000),'STAMPUSDT'),null);
 assert.throws(()=>decode(Buffer.from([10,255]),'STAMPUSDT'));
 const now=Date.now(),trade=message(314,field(1,Buffer.concat([field(1,'.0011'),field(2,'5'),field(4,now)])),'spot@public.aggre.deals.v3.api.pb@100ms@STAMPUSDT');assert.equal(decode(trade,'STAMPUSDT').quote.price,.0011);
 const t=Math.floor(now/900000)*900,body=Buffer.concat([field(1,'Min15'),field(2,t),field(3,'.001'),field(4,'.0011'),field(5,'.0012'),field(6,'.0009'),field(7,'50'),field(9,t+900)]);
 d=decode(message(308,body,'spot@public.kline.v3.api.pb@STAMPUSDT@Min15'),'STAMPUSDT');assert.equal(d.frame,'15m');assert.equal(d.candle.t,t*1000);
 class WS{constructor(){this.readyState=1;WS.last=this}send(s){this.sent=JSON.parse(s)}close(){this.onclose?.()}}
 let got=0;const states=[];const s=new Stream({WebSocketClass:WS,onData:()=>got++,onState:x=>states.push(x)});s.start();WS.last.onopen();assert.equal(WS.last.sent.params.length,8);WS.last.onmessage({data:ticker()});assert.equal(got,1);assert(states.includes('live'));WS.last.onclose();assert(states.includes('reconnecting'));s.stop();assert.equal(s.stopped,true);console.log('PASS protobuf data validation, symbol isolation, clock checks, candle decoding and reconnect lifecycle');
}
module.exports={field,message,ticker};
