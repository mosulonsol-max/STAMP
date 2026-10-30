/* Live upstream integration check, separate from deterministic fixture tests. */
const {decode}=require('../dashboard/market-stream.js');
const ws=new WebSocket('wss://wbs-api.mexc.com/ws');let found=false;
const timer=setTimeout(()=>{console.error('No validated STAMP ticker/candle frame received within 20s');ws.close();process.exitCode=1},20000);
ws.addEventListener('open',()=>ws.send(JSON.stringify({method:'SUBSCRIPTION',params:['spot@public.miniTicker.v3.api.pb@STAMPUSDT@24H','spot@public.kline.v3.api.pb@STAMPUSDT@Min15','spot@public.aggre.deals.v3.api.pb@100ms@STAMPUSDT']})));
ws.addEventListener('message',async event=>{try{if(typeof event.data==='string'){console.log('Exchange control response:',event.data);return}const bytes=event.data instanceof Blob?await event.data.arrayBuffer():event.data;const value=decode(bytes,'STAMPUSDT');if(value&&!found){found=true;clearTimeout(timer);console.log(JSON.stringify({live_market_verified:true,kind:value.kind,source:'MEXC',received_at_utc:new Date().toISOString()}));ws.close()}}catch(e){console.error('Invalid exchange frame:',e.message)}});
ws.addEventListener('error',()=>{console.error('MEXC WebSocket connection error');clearTimeout(timer);ws.close();process.exitCode=1});
