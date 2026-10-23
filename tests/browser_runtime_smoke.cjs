// Zero-dependency integration test of the actual browser client using a simulated DOM.
// This exercises API success, API outage recovery, CSP-safe embedded fallback and price units.
"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const js=fs.readFileSync(require("node:path").join(__dirname,"../dashboard/private.js"),"utf8");
const now=new Date().toISOString();
const sample={
 observed_utc:now,
 market:{price:0.0001751,change:0.018,bid:0.0001750,ask:0.0001752,volume:77791,book:{},trades:{}},
 live_quote:{status:"fresh",price:0.0001760,bid:0.0001759,ask:0.0001761,change_24h_pct:1.8,volume_24h_usdt:80000,retrieved_at_utc:now,provider_at_utc:now},
 forecasts:{"1h":"insufficient_evidence"},technical:{},candles:{},dex:[],health:{passed:true,at:now,steps:{tests:"success"}},learning:{champion:null},scorecard:{evaluated_total:10,pending_total:1,models:{}}
};
function makeNode(id){
 const node={id,value:"",textContent:"",innerHTML:"",hidden:false,disabled:false,dataset:{},className:"",handlers:{},
 addEventListener(type,fn){this.handlers[type]=fn},showModal(){this.open=true},
 getBoundingClientRect(){return {width:700,height:300}},
 getContext(){return {setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){},fillRect(){}}},
 classList:{toggle(){}}};
 if(id==="stamp-snapshot")node.content={textContent:JSON.stringify({...sample,live_quote:{status:"unavailable"}})};
 return node;
}
async function scenario(mode){
 const nodes=new Map(),urls=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,makeNode(id));return nodes.get(id)};
 const document={documentElement:{},getElementById:get,querySelectorAll:()=>[]};
 const window={devicePixelRatio:1,location:{href:"/"},addEventListener(){}};
 const localStorage={getItem(){return null},setItem(){},removeItem(){}};
 const fetch=async url=>{
  urls.push(url);
  if(url==="/api/dashboard"&&mode!=="primary")throw Error("primary offline");
  if(url==="/api/dashboard-lite"&&mode==="embedded")throw Error("lite offline");
  if(url==="/api/quote")return {ok:true,json:async()=>({quote:{status:"unavailable"}})};
  if(url==="/api/dashboard-lite")return {ok:true,json:async()=>({...sample,live_quote:{status:"unavailable"}})};
  return {ok:true,json:async()=>sample};
 };
 const context={document,window,localStorage,fetch,Date,JSON,Intl,Number,Math,String,Object,Blob:class{},
 AbortController:class{signal={};abort(){}},URL:{createObjectURL(){},revokeObjectURL(){}},
 setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},console};
 vm.runInNewContext(js,context,{filename:"dashboard/private.js",timeout:3000});
 for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
 const expected=mode==="primary"?"$0.0001760":"$0.0001751";
 assert.equal(get("price").textContent,expected,mode+" price");
 assert.match(get("forecasts").innerHTML,/insufficient_evidence/,mode+" forecast");
 assert.match(get("learning").innerHTML,/10/,mode+" audited forecasts");
 assert.equal(get("change").textContent,mode==="primary"?"+1.80%":"+1.80%",mode+" percent units");
 assert.match(get("sourceLine").textContent,/Research:/,mode+" source timestamp");
 assert.equal(get("refresh").disabled,false,mode+" refresh reset");
 if(mode==="embedded")assert.match(get("status").textContent,/ARCHIVED/,mode+" fallback marked archived");
 if(mode!=="primary")assert.ok(urls.includes("/api/dashboard-lite"),"recovery API requested");
 return {mode,price:get("price").textContent,status:get("status").textContent,requests:urls};
}
(async()=>{
 for(const mode of ["primary","recovery","embedded"])console.log("PASS",JSON.stringify(await scenario(mode)));
})().catch(e=>{console.error("FAIL",e);process.exitCode=1});
