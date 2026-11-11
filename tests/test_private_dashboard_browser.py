"""Run the actual browser JavaScript in Node with a deterministic DOM and fake HTTP.
These tests catch broken UI wiring, incorrect live/archive labels, and fallback errors.
"""
import pathlib,shutil,subprocess,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
NODE=shutil.which("node")
class BrowserFlowTests(unittest.TestCase):
 def test_authenticated_live_and_recovery_rendering(self):
  if not NODE:self.skipTest("Node is not installed")
  js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('dashboard/private.js','utf8');
const now=new Date().toISOString();
const base={
 market:{price:.0001751,change:.018,bid:.0001750,ask:.0001752,volume:77791,book:{},trades:{}},
 observed_utc:now,health:{passed:true,steps:{tests:'success'}},scorecard:{evaluated_total:10},
 learning:{champion:null},forecasts:{'1h':'insufficient_evidence'},technical:{},dex:[],candles:{}
};
const quote={status:'fresh',source:'MEXC public 24h ticker',price:.0001777,bid:.0001776,ask:.0001778,
 change_24h_pct:1.8,volume_24h_usdt:70000,retrieved_at_utc:now,provider_at_utc:now};
function createElements(embedded){
 const ids={};
 const mk=id=>ids[id]||(ids[id]={
  id,value:'',dataset:{},textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},
  setAttribute(name,value){this[name]=value},
  addEventListener(type,callback){this.events??={};this.events[type]=callback},
  getBoundingClientRect(){return {width:700,height:300}},
  getContext(){return {setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){},fillRect(){}}},
  showModal(){},replaceChildren(){},classList:{toggle(){}}
 });
 mk('stamp-snapshot').textContent=JSON.stringify(embedded);
 return {ids,mk,document:{documentElement:{},getElementById:mk,querySelectorAll(){return []}}};
}
async function scenario(kind){
 const dom=createElements(base),calls=[];
 const fetch=async path=>{
  calls.push(path);
  if(kind==='live'&&path==='/api/dashboard')return {ok:true,json:async()=>({...base,live_quote:quote})};
  if(kind==='recovery'&&path==='/api/dashboard-lite')return {ok:true,json:async()=>({...base,live_quote:{status:'unavailable'}})};
  if(kind==='recovery'&&path==='/api/quote')return {ok:true,json:async()=>({quote})};
  return {ok:false,status:503};
 };
 const ctx={document:dom.document,window:{devicePixelRatio:1,addEventListener(){},location:{}},
 localStorage:{getItem(){return null},setItem(){},removeItem(){}},
 setInterval(){},setTimeout,clearTimeout,fetch,AbortController,Date,Intl,Number,Math,JSON,
 URL:{createObjectURL(){return 'blob:'},revokeObjectURL(){}},Blob,console};
 vm.runInNewContext(source,ctx,{filename:'private.js',timeout:2000});
 await new Promise(resolve=>setTimeout(resolve,50));
 return {ids:dom.ids,calls};
}
(async()=>{
 const live=await scenario('live');
 assert.equal(live.ids.status.textContent,'سعر مباشر');
 assert.equal(live.ids.price.textContent,'0.0001777');
 assert.equal(live.ids.change.textContent,'+1.80%');
 assert(!live.calls.includes('/api/quote'));
 const recovery=await scenario('recovery');
 assert.equal(recovery.ids.status.textContent,'سعر مباشر');
 assert.equal(recovery.ids.price.textContent,'0.0001777');
 assert(recovery.calls.includes('/api/quote'));
 assert.equal(recovery.ids.warning.hidden,true);
 const offline=await scenario('offline');
 assert.equal(offline.ids.status.textContent,'سعر مؤرشف');
 assert.equal(offline.ids.price.textContent,'0.0001751');
 assert(offline.ids.warning.textContent.includes('مؤرشفة'));
 console.log('PASS browser live quote, percent units, recovery, offline fallback, authenticated API wiring');
})().catch(e=>{console.error(e);process.exitCode=1});
"""
  result=subprocess.run([NODE,"-e",js],cwd=ROOT,capture_output=True,text=True,timeout=20)
  self.assertEqual(result.returncode,0,result.stderr+"\n"+result.stdout)
if __name__=="__main__":unittest.main()

