/* MEXC public market stream. Schema: mexcdevelop/websocket-proto (tags 308/309/314).
 * Narrow, bounded protobuf reader; ignores unknown fields and never evaluates data.
 * No account keys or application credentials are sent to the exchange.
 */
(function(root){
'use strict';
const text=new TextDecoder(),positive=v=>Number.isFinite(Number(v))&&Number(v)>0;
function fields(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>1048576)throw Error('frame_size');
 let pos=0;const result=new Map();
 const varint=()=>{let value=0,factor=1;for(let i=0;i<8;i++){if(pos>=bytes.length)throw Error('truncated');const b=bytes[pos++];value+=(b&127)*factor;if(!Number.isSafeInteger(value))throw Error('integer_overflow');if(!(b&128))return value;factor*=128}throw Error('varint_overflow')};
 while(pos<bytes.length){const key=varint(),tag=Math.floor(key/8),wire=key%8;let value;if(!tag)throw Error('tag');
  if(wire===0)value=varint();else if(wire===2){const size=varint();if(pos+size>bytes.length)throw Error('truncated');value=bytes.subarray(pos,pos+size);pos+=size}
  else if(wire===1||wire===5){pos+=wire===1?8:4;if(pos>bytes.length)throw Error('truncated');continue}else throw Error('wire');
  if(!result.has(tag))result.set(tag,[]);result.get(tag).push(value);
 }return result;
}
const str=(f,k)=>{const v=f.get(k)?.[0];return v instanceof Uint8Array?text.decode(v):''};
const integer=(f,k)=>{const v=f.get(k)?.[0];return typeof v==='number'?v:null};
const intervals={Min15:'15m',Min30:'30m',Min60:'1h',Hour4:'4h',Day1:'1d',Week1:'1w'};
function decode(buffer,symbol,now=Date.now()){
 const f=fields(new Uint8Array(buffer)),channel=str(f,1),outer=str(f,3),sent=integer(f,6)||integer(f,5);
 if(!sent||sent>now+5000||now-sent>15000||(outer&&outer!==symbol))return null;
 const base={provider_at_utc:new Date(sent).toISOString(),retrieved_at_utc:new Date(now).toISOString(),transport:'websocket',source:'MEXC public WebSocket',status:'fresh'};
 if(f.has(309)&&channel===`spot@public.miniTicker.v3.api.pb@${symbol}@24H`){
  const m=fields(f.get(309)[0]);if(str(m,1)!==symbol)return null;
  const vals=[2,4,5,6,7,8].map(k=>str(m,k));if(vals.some(v=>v===''||!Number.isFinite(Number(v))))return null;
  const [price,rate,high,low,volume,quantity]=vals.map(Number);
  if(price<=0||low<=0||high<low||volume<0||quantity<0)return null;
  return {kind:'ticker',quote:{...base,price,change_24h_pct:rate*100,high_24h:high,low_24h:low,volume_24h_usdt:volume,base_volume_24h:quantity,stats_at_utc:base.provider_at_utc}};
 }
 if(f.has(314)&&channel===`spot@public.aggre.deals.v3.api.pb@100ms@${symbol}`){
  const m=fields(f.get(314)[0]);let latest=null;
  for(const raw of m.get(1)||[]){const d=fields(raw),price=Number(str(d,1)),time=integer(d,4);if(positive(price)&&time&&time<=now+5000&&now-time<=15000&&(!latest||time>=latest.time))latest={price,time}}
  return latest?{kind:'trade',quote:{...base,price:latest.price,provider_at_utc:new Date(latest.time).toISOString()}}:null;
 }
 if(f.has(308)){
  const m=fields(f.get(308)[0]),interval=str(m,1),frame=intervals[interval];
  if(!frame||channel!==`spot@public.kline.v3.api.pb@${symbol}@${interval}`)return null;
  const t=integer(m,2)*1000,end=integer(m,9)*1000,o=Number(str(m,3)),c=Number(str(m,4)),h=Number(str(m,5)),l=Number(str(m,6)),v=Number(str(m,7));
  if(![t,end,o,c,h,l,v].every(Number.isFinite)||t<=0||t>now+5000||end<=t||l<=0||l>Math.min(o,c)||h<Math.max(o,c)||v<0)return null;
  return {kind:'candle',frame,candle:{t,o,c,h,l,v,end,observed_utc:base.provider_at_utc}};
 }return null;
}
class Stream{
 constructor({symbol='STAMPUSDT',onData=()=>{},onState=()=>{},WebSocketClass=root.WebSocket}={}){
  if(!/^[A-Z0-9]{4,30}$/.test(symbol))throw Error('symbol');Object.assign(this,{symbol,onData,onState,WebSocketClass,stopped:true,attempt:0,lastFrame:0});
 }
 start(){if(!this.stopped)return;this.stopped=false;this.connect();this.watch=setInterval(()=>{if(this.socket?.readyState===1){if(Date.now()-this.lastFrame>20000){this.onState('stale');this.socket.close()}else this.socket.send(JSON.stringify({method:'PING'}))}},10000)}
 connect(){if(this.stopped||!this.WebSocketClass)return;this.onState('connecting');let ws;try{ws=new this.WebSocketClass('wss://wbs-api.mexc.com/ws')}catch(e){this.retry();return}this.socket=ws;ws.binaryType='arraybuffer';
  ws.onopen=()=>{this.lastFrame=Date.now();ws.send(JSON.stringify({method:'SUBSCRIPTION',params:[`spot@public.aggre.deals.v3.api.pb@100ms@${this.symbol}`,`spot@public.miniTicker.v3.api.pb@${this.symbol}@24H`,...Object.keys(intervals).map(tf=>`spot@public.kline.v3.api.pb@${this.symbol}@${tf}`)]}));this.onState('subscribing')};
  ws.onmessage=event=>{if(this.stopped||this.socket!==ws)return;try{if(typeof event.data==='string'){const ack=JSON.parse(event.data);if(ack.code&&ack.code!==0)this.onState('subscription_error');return}const update=decode(event.data,this.symbol);if(update){this.lastFrame=Date.now();this.attempt=0;this.onState('live');this.onData(update)}}catch(e){this.onState('invalid_frame')}};
  ws.onerror=()=>this.onState('reconnecting');ws.onclose=()=>{if(this.socket===ws){this.socket=null;this.retry()}};
 }
 retry(){if(this.stopped)return;this.onState('reconnecting');clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.connect(),Math.min(30000,1000*2**Math.min(this.attempt++,5)))}
 stop(){this.stopped=true;clearTimeout(this.retryTimer);clearInterval(this.watch);if(this.socket){const ws=this.socket;this.socket=null;ws.close()}}
}
root.StampMarket={decode,Stream};if(typeof module!=='undefined')module.exports=root.StampMarket;
})(typeof window!=='undefined'?window:globalThis);
