const { test, expect } = require('@playwright/test');
if (process.env.STAMP_CHROME_CHANNEL === 'chrome') test.use({channel:'chrome'});
const HOST=process.env.STAMP_TEST_HOST||'http://localhost:10000';
test('compact market, automatic decision, real interactive chart and forecast outcomes',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');await page.locator('#password').fill('long-test-password');await page.locator('form[action="/login"] button[type="submit"]').click();
 await expect(page.locator('#price')).not.toHaveText('—',{timeout:25000});
 await expect(page.locator('#chart canvas').first()).toBeVisible({timeout:25000});
 await expect.poll(async()=>Number(await page.locator('#chart').getAttribute('data-bar-count'))).toBeGreaterThan(10);
 for(const id of ['liquidity','volume','high24','low24'])await expect(page.locator('#'+id)).not.toHaveText('—');
 await expect(page.locator('#modelStatus')).toContainText(/آلي/);
 const response=await page.request.get(HOST+'/api/dashboard');expect(response.status()).toBe(200);const data=await response.json();
 expect(data.model_decisions['1h'].automatic).toBe(true);
 expect(data.forecasts['1h'].engine).toBe('context_walk_forward_v3');
 expect(data.forecasts['1h'].input_manifest.features).toBeGreaterThan(100);
 await page.locator('#inputDetails summary').click();await expect(page.locator('#inputTable')).toContainText('BTC / ETH / SOL / ZEC');await expect(page.locator('#inputTable')).toContainText('أخطاء التوقعات السابقة');await page.locator('#inputDetails summary').click();
 expect(['approved','experimental']).toContain(data.model_decisions['1h'].status);
 expect(data.market.high_24h).toBeGreaterThanOrEqual(data.market.low_24h);
 await expect.poll(async()=>Number(await page.locator('#chart').getAttribute('data-forecast-points'))).toBeGreaterThan(0);
 await expect.poll(async()=>Number(await page.locator('#chart').getAttribute('data-actual-points'))).toBeGreaterThan(0);
 await page.locator('button[data-frame="1h"]').click();await expect(page.locator('#chart')).toHaveAttribute('data-frame','1h');
 const initial=await page.locator('#chart').getAttribute('data-visible-from');
 const plot=await page.locator('#chart').boundingBox();await page.mouse.move(plot.x+plot.width*.5,plot.y+plot.height*.5);await page.mouse.wheel(0,-350);
 await expect.poll(async()=>page.locator('#chart').getAttribute('data-visible-from')).not.toBe(initial);
 // Verify real canvas panning, candle inspection, controls, and keyboard navigation.
 const beforeDrag=await page.locator('#chart').getAttribute('data-visible-from');
 await page.mouse.move(plot.x+plot.width*.4,plot.y+plot.height*.4);await page.mouse.down();await page.mouse.move(plot.x+plot.width*.65,plot.y+plot.height*.4,{steps:12});await page.mouse.up();
 await expect.poll(async()=>page.locator('#chart').getAttribute('data-visible-from')).not.toBe(beforeDrag);
 await page.locator('#resetChart').click();
 let inspected=false;
 for(let x=.15;x<.8;x+=.05){await page.mouse.move(plot.x+plot.width*x,plot.y+plot.height*.35);if((await page.locator('#chartOHLC').textContent()).includes('الحجم')){inspected=true;break}}
 expect(inspected,'crosshair displays candle volume and OHLC').toBe(true);
 const visibleWidth=async()=>{const r=await page.locator('#chart').evaluate(node=>node.dataset);return Number(r.visibleTo)-Number(r.visibleFrom)};
 const beforeZoom=await visibleWidth();await page.locator('#zoomIn').click();await expect.poll(visibleWidth).toBeLessThan(beforeZoom);
 const zoomed=await visibleWidth();await page.locator('#zoomOut').click();await expect.poll(visibleWidth).toBeGreaterThan(zoomed);
 const earlier=await page.locator('#chart').getAttribute('data-visible-from');await page.locator('#panEarlier').click();await expect.poll(async()=>Number(await page.locator('#chart').getAttribute('data-visible-from'))).toBeLessThan(Number(earlier));
 await page.locator('#chart').focus();await page.keyboard.press('ArrowRight');await expect.poll(async()=>Number(await page.locator('#chart').getAttribute('data-visible-from'))).toBeGreaterThan(Number(earlier)-1);
 await page.keyboard.press('Home');
 await page.locator('#forecastHorizon').selectOption('4h');await expect(page.locator('#forecastSummary')).toContainText('4H');
 await page.locator('summary[data-i18n="auditDetails"]').click();await expect(page.locator('#modelReason')).toContainText('تلقائي');await page.locator('summary[data-i18n="auditDetails"]').click();
 await page.screenshot({path:'test-results/stamp-compact-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const mobileWidth=await visibleWidth();await page.locator('#zoomIn').click();await expect.poll(visibleWidth).toBeLessThan(mobileWidth);
 await page.locator('#panLater').click();await page.locator('#resetChart').click();
 await page.screenshot({path:'test-results/stamp-compact-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 await page.locator('#settingsButton').click();await expect(page.locator('#settings')).toBeVisible();await page.locator('#diagnose').click();await expect(page.locator('#diagnosticResult')).toContainText('API:',{timeout:15000});
 expect(errors).toEqual([]);
 await page.locator('#logoutButton').click();await expect(page.locator('form[action="/login"]')).toBeVisible();
});
test('data stays private while the open-source chart asset is reachable',async({request})=>{
 expect((await request.get(HOST+'/api/dashboard')).status()).toBe(401);
 expect((await request.get(HOST+'/api/market-update?symbol=STAMPUSDT&frame=15m')).status()).toBe(401);
 expect((await request.get(HOST+'/api/market-events?symbol=STAMPUSDT')).status()).toBe(401);
 const asset=await request.get(HOST+'/assets/chart.js');expect(asset.status()).toBe(200);expect(await asset.text()).toContain('TradingView Lightweight Charts');
});

test('global market flow and history share the authenticated workspace',async({page})=>{
 const day=86400,latest=Math.floor(Date.now()/1000/day)*day;
 const points=Array.from({length:32},(_,i)=>({t:latest-(31-i)*day,v:290e9+i*1e9-(i%3)*2e9}));
 await page.route('**/api/market-flow',route=>route.fulfill({json:{
  market_cap_usd:3e12,volume_24h_usd:100e9,stablecoin_supply_usd:points.at(-1).v,
  market_observed_at_utc:new Date().toISOString(),stablecoin_supply_observed_at_utc:new Date(latest*1000).toISOString(),
  stablecoin_history:points,sources:{market:'CoinGecko',stablecoins:'DefiLlama'}
 }}));
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await page.locator('.page-nav a[href="#globalMarketFlow"]').click();
 await expect(page.locator('#globalMarketFlow canvas')).toHaveCount(2);
 await expect(page.locator('iframe')).toHaveCount(0);
 await expect(page.locator('#flowCap')).toHaveText('$3T');
 await expect(page.locator('#flowRange')).toContainText('31');
 const scene=page.locator('#flowScene');
 const initial=await scene.evaluate(canvas=>canvas.toDataURL());
 await page.locator('[data-days="7"]').click();
 await expect(page.locator('[data-days="7"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#flowRange')).toContainText('8');
 const short=await scene.evaluate(canvas=>canvas.toDataURL());
 expect(short).not.toBe(initial);
 await scene.press('ArrowRight');
 expect(await scene.evaluate(canvas=>canvas.toDataURL())).not.toBe(short);
 await page.setViewportSize({width:390,height:844});
 await expect(scene).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 await page.goto(HOST+'/market-flow');
 await expect(page).toHaveURL(HOST+'/#globalMarketFlow');
 await expect(page.locator('#globalMarketFlow')).toBeVisible();
 await expect(page.locator('#trading')).toBeHidden();
});

test('technical layers draw on closed candles and follow the selected timeframe',async({page})=>{
 const path=[[0,115],[7,100],[16,124],[25,109],[34,149],[43,132],[52,167],[59,156]];
 const bars=ms=>{
  const start=Math.floor(Date.now()/ms)*ms-160*ms;
  const values=Array.from({length:100},(_,i)=>140+i/10);
  for(let j=1;j<path.length;j++){
   const [a,x]=path[j-1],[b,y]=path[j];
   for(let i=a;i<b;i++)values.push(x+(y-x)*(i-a)/(b-a));
  }
  values.push(path.at(-1)[1]);
  return values.map((c,i)=>({t:start+i*ms,o:c,c,h:c+1,l:c-1,v:100+i}));
 };
 await page.route('**/api/dashboard',route=>route.fulfill({json:{
  market:{price:156},observed_utc:new Date().toISOString(),
  candles:{'15m':bars(900000),'1h':bars(3600000),'4h':bars(14400000)}
 }}));
 await page.route('**/api/market-update?*',route=>{
  const url=new URL(route.request().url());
  return route.fulfill({json:{symbol:url.searchParams.get('symbol'),frame:url.searchParams.get('frame'),quote:{status:'unavailable'},closed:[],forming:null}});
 });
 await page.routeWebSocket('wss://wbs-api.mexc.com/ws',ws=>ws.onMessage(()=>{}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(HOST+'/');await page.locator('#user').fill('test-user');await page.locator('#password').fill('long-test-password');await page.locator('form[action="/login"] button').click();
 const chart=page.locator('#chart');
 await expect(chart.locator('canvas').first()).toBeVisible();
 await page.locator('[data-layer="elliott"]').click();
 await expect(chart).toHaveAttribute('data-frame','1h');
 await expect.poll(async()=>Number(await chart.getAttribute('data-elliott-counts'))).toBeGreaterThan(0);
 await expect(page.locator('.wave-count').first()).toContainText('حتى الموجة 5');
 await page.locator('[data-layer="fibonacci"]').click();
 await expect(chart).toHaveAttribute('data-fibonacci-levels','7');
 await expect(page.locator('.technical-levels')).toContainText('61.8%');
 await page.locator('[data-layer="ichimoku"]').click();
 await expect.poll(async()=>Number(await chart.getAttribute('data-ichimoku-points'))).toBeGreaterThan(50);
 await page.locator('button[data-frame="4h"]').click();
 await expect(chart).toHaveAttribute('data-frame','4h');
 await expect.poll(async()=>Number(await chart.getAttribute('data-elliott-counts'))).toBeGreaterThan(0);
 await page.locator('button[data-frame="15m"]').click();
 await expect(chart).toHaveAttribute('data-elliott-counts','0');
 await expect(page.locator('[data-kind="elliott"]')).toContainText('إطار الساعة أو 4 ساعات');
 await page.locator('[data-layer="ichimoku"]').click();
 await expect(chart).toHaveAttribute('data-ichimoku-points','0');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 expect(errors).toEqual([]);
});

test('stream changes price and candle, falls back automatically, and follows a new symbol',async({page})=>{
 const {field,message,ticker}=require('../tests/market_stream.cjs');
 let socket,restPrice=.0001111,quoteRequests=0;
 await page.routeWebSocket('wss://wbs-api.mexc.com/ws',ws=>{socket=ws;ws.onMessage(()=>{})});
 await page.route('**/api/market-update?*',async route=>{
  quoteRequests++;
  const query=new URL(route.request().url()).searchParams,symbol=query.get('symbol'),frame=query.get('frame');
  const now=new Date().toISOString(),t=Math.floor(Date.now()/900000)*900000,price=symbol==='STAMPUSDT'?restPrice:67500;
  await route.fulfill({json:{symbol,frame,
   quote:{symbol,status:'fresh',price,price_kind:'trade',transport:'rest',provider_at_utc:now,retrieved_at_utc:now,change_24h_pct:1,volume_24h_usdt:1000,high_24h:.002,low_24h:.0001},
   closed:[],forming:{t,o:price,h:price,l:price,c:price,v:80,end:t+900000,observed_utc:now,transport:'rest'}
  }});
 });
 await page.route('**/api/assets/universe',route=>route.fulfill({json:{pairs:['STAMPUSDT','BTCUSDT']}}));
 await page.route('**/api/assets/snapshot?symbol=BTCUSDT',route=>route.fulfill({json:{
  symbol:'BTCUSDT',venue:'MEXC',available_venues:['MEXC'],source:'MEXC public spot REST',
  retrieved_at_utc:new Date().toISOString(),
  ticker:{symbol:'BTCUSDT',lastPrice:'67500',priceChangePercent:'1',quoteVolume:'50000',highPrice:'70000',lowPrice:'66000',closeTime:Date.now()},
  candles:{'15m':[],'1h':[],'4h':[],'1d':[]}
 }}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(HOST+'/');await page.locator('#user').fill('test-user');await page.locator('#password').fill('long-test-password');await page.locator('form[action="/login"] button').click();
 await expect(page.locator('#chart canvas').first()).toBeVisible({timeout:25000});
 await expect.poll(()=>!!socket).toBe(true);await expect(page.locator('#price')).toHaveText('0.0001111');
 // The exchange frame, not a navigation or refresh click, drives these changes.
 socket.send(ticker('0.0012345'));
 await expect(page.locator('#price')).toHaveText('0.0012345');await expect(page.locator('#change')).toHaveText('+2.50%');await expect(page.locator('#volume')).toHaveText('50,000');await expect(page.locator('#streamStatus')).toContainText('متصل');
 const start=Math.floor(Date.now()/900000)*900;
 socket.send(message(308,Buffer.concat([field(1,'Min15'),field(2,start),field(3,'.001'),field(4,'.0012345'),field(5,'.0013'),field(6,'.0009'),field(7,'80'),field(9,start+900)]),'spot@public.kline.v3.api.pb@STAMPUSDT@Min15'));
 await expect(page.locator('#chart')).toHaveAttribute('data-forming','true');await expect(page.locator('#activeCandle')).toContainText('غير مغلقة');
 // Out-of-order or different-symbol frames cannot overwrite current STAMP price.
 socket.send(ticker('0.00001',Date.now()-5000));await expect(page.locator('#price')).toHaveText('0.0012345');
 const feedCount=quoteRequests;restPrice=.0013456;socket.close();
 await expect(page.locator('#price')).toHaveText('0.0013456',{timeout:10000});expect(quoteRequests).toBeGreaterThan(feedCount);
 await expect(page.locator('#chart')).toHaveAttribute('data-candle-source','rest');
 await page.locator('#assuranceDetails summary').click();await expect(page.locator('#assuranceSummary')).toContainText('غير معتمد');await expect(page.locator('#assuranceMetrics table')).toBeVisible();
 const assurance=await (await page.request.get(HOST+'/api/assurance')).json();expect(assurance.rollout.ready).toBe(false);expect(Object.keys(assurance.horizons)).toHaveLength(4);
 const previousSocket=socket;
 await page.locator('#assetPickerButton').click();
 await page.locator('[data-pair="BTCUSDT"]').click();
 await expect(page.locator('#coinName')).toHaveText('BTC / USDT');
 await expect(page.locator('#price')).toHaveText('67,500.00');
 await expect.poll(()=>socket!==previousSocket).toBe(true);
 socket.send(ticker('0.009'));
 await expect(page.locator('#price')).toHaveText('67,500.00');
 expect(errors).toEqual([]);
});

test.describe('touch dashboard controls',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
 test('tabs switch panels and the searchable catalog selects pairs by touch',async({page})=>{
  const catalog=['STAMPUSDT','BTCUSDT','ETHUSDT','SOLUSDT','SUSDT','ZZUSDT',...Array.from({length:420},(_,i)=>'A'+i+'USDT')];
  await page.route('**/api/assets/universe',route=>route.fulfill({json:{pairs:catalog,retrieved_at_utc:new Date().toISOString()}}));
  await page.route('**/api/assets/snapshot?symbol=*',route=>{
   const symbol=new URL(route.request().url()).searchParams.get('symbol');
   const price=symbol==='SUSDT'?.5:67000;
   const candles=Object.fromEntries([['15m',900000],['1h',3600000],['4h',14400000]].map(([frame,step])=>{
    const start=Math.floor(Date.now()/step)*step;
    return [frame,Array.from({length:20},(_,i)=>({t:start-(20-i)*step,o:price,c:price,h:price*1.01,l:price*.99,v:100}))];
   }));
   return route.fulfill({json:{symbol,ticker:{symbol,lastPrice:price,closeTime:Date.now()},candles}});
  });
  await page.route('**/api/market-update?*',route=>{
   const query=new URL(route.request().url()).searchParams;
   return route.fulfill({json:{symbol:query.get('symbol'),frame:query.get('frame'),quote:{status:'unavailable'},closed:[],forming:null}});
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(HOST+'/');
  await page.locator('#user').fill('test-user');
  await page.locator('#password').fill('long-test-password');
  await page.locator('form[action="/login"] button').tap();
  await expect(page.locator('#trading')).toBeVisible();
  for(const [tab,panel] of [['flowTab','globalMarketFlow'],['venuesTab','venuesSection'],['labTab','labCenter']]){
   await page.locator('#'+tab).tap();
   await expect(page.locator('#'+tab)).toHaveAttribute('aria-selected','true');
   await expect(page.locator('#'+panel)).toBeVisible();
   await expect(page.locator('#trading')).toBeHidden();
  }
  await page.goBack();
  await expect(page.locator('#venuesSection')).toBeVisible();
  await expect(page.locator('#labCenter')).toBeHidden();
  await page.locator('#tradeTab').tap();
  await expect(page.locator('#assetPickerButton')).toBeInViewport();
  await page.locator('#assetPickerButton').tap();
  await expect(page.locator('#assetPicker')).toBeVisible();
  await expect(page.locator('#assetCatalogStatus')).toContainText(String(catalog.length));
  await expect(page.locator('#assetResults button')).toHaveCount(60);
  await page.locator('#assetMore').tap();
  await expect(page.locator('#assetResults button')).toHaveCount(120);
  await page.locator('#assetSearch').fill('S / USDT');
  await expect(page.locator('#assetResults button')).toHaveCount(1);
  await page.locator('[data-pair="SUSDT"]').tap();
  await expect(page.locator('#assetPicker')).toBeHidden();
  await expect(page.locator('#assetSelected')).toHaveText('S / USDT');
  await expect(page.locator('#price')).toHaveText('0.5000000');
  await page.locator('button[data-frame="4h"]').tap();
  await expect(page.locator('button[data-frame="4h"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#chart')).toHaveAttribute('data-frame','4h');
  await expect(page.locator('#chart')).toHaveAttribute('data-bar-count','20');
  await page.locator('#assetFavorite').tap();
  await expect(page.locator('#favoriteSelect option[value="SUSDT"]')).toHaveCount(1);
  await page.locator('#assetPickerButton').tap();
  await page.locator('#assetSearch').fill('BTC');
  await page.locator('#assetSearch').press('Enter');
  await expect(page.locator('#coinName')).toHaveText('BTC / USDT');
  await expect(page.locator('#price')).toHaveText('67,000.00');
  await expect(page.locator('#chart')).toHaveAttribute('data-frame','4h');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  expect(errors).toEqual([]);
 });
});

test('live catalog and alternate market render real MEXC candles',async({page})=>{
 test.skip(process.env.STAMP_REAL_PAIR_CHECK!=='1','Requires access to MEXC public data');
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 const catalogResult=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/assets/universe');
 await page.locator('form[action="/login"] button').click();
 const catalog=await catalogResult;
 expect(catalog.ok()).toBe(true);
 const {pairs}=await catalog.json();
 expect(pairs.length).toBeGreaterThan(0);
 expect(pairs).toContain('BTCUSDT');
 await page.locator('#assetPickerButton').click();
 await page.locator('#assetSearch').fill('BTCUSDT');
 const snapshotResult=page.waitForResponse(response=>response.url().endsWith('/api/assets/snapshot?symbol=BTCUSDT'));
 await page.locator('[data-pair="BTCUSDT"]').click();
 const snapshot=await snapshotResult;
 expect(snapshot.ok()).toBe(true);
 const result=await snapshot.json();
 expect(result.symbol).toBe('BTCUSDT');
 expect(result.candles['1h'].length).toBeGreaterThan(10);
 await page.locator('button[data-frame="1h"]').click();
 await expect(page.locator('#coinName')).toHaveText('BTC / USDT');
 await expect.poll(async()=>Number(await page.locator('#chart').getAttribute('data-bar-count'))).toBeGreaterThan(10);
 const eventResponse=await page.request.get(HOST+'/api/market-events?symbol=BTCUSDT');
 expect(eventResponse.ok()).toBe(true);
 const executions=await eventResponse.json();
 expect(executions.trades.status).toBe('ok');
 expect(executions.trades.sample_count).toBeGreaterThan(10);
 expect(executions.records.length).toBeGreaterThan(0);
 expect(executions.records.every(event=>event.symbol==='BTCUSDT'&&event.kind==='trade'&&event.time_ms<=Date.now()+5000)).toBe(true);

});

test('chart event markers follow exact candles and operations preserve source outages',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const signature='5'.repeat(87), stamp='STAMPUSDT', btc='BTCUSDT';
 const candle=Math.floor(Date.now()/3600000)*3600000-4*3600000, eventTime=candle+74521;
 const observed=new Date().toISOString(), prior=new Date(Date.now()-1800000).toISOString();
 const candles=Array.from({length:72},(_,i)=>({t:candle+(i-64)*900000,o:1,h:1.1,l:.9,c:1.05,v:50}));
 const operations={checked_utc:observed,sources:{workflow:{status:'ok',observed_utc:observed,last_ok_utc:observed},
  mexc_trades:{status:'unavailable',observed_utc:observed,last_ok_utc:prior}},incidents:[
  {source:'mexc_trades',from:'ok',to:'unavailable',observed_utc:observed}
 ]};
 const payload={market:{price:1.05},observed_utc:observed,candles:{'15m':candles,'1h':candles.filter((_,i)=>i%4===0)},operations};
 await page.route('**/api/dashboard',r=>r.fulfill({json:payload}));
 await page.route('**/api/assets/snapshot?symbol=BTCUSDT',r=>r.fulfill({json:{symbol:btc,candles:payload.candles,ticker:{price:1.05}}}));
 await page.route('**/api/market-update?**',r=>r.abort());
 await page.route('**/api/market-events?symbol=*',r=>{
  const symbol=new URL(r.request().url()).searchParams.get('symbol');
  const trade={id:'trade-'+symbol,kind:'trade',symbol,time_ms:eventTime,side:'buy',notional:813,source:'MEXC Spot'};
  const burn={id:'burn',kind:'burn',symbol:stamp,time_ms:eventTime+5000,signature,source:'Solana'};
  // A deliberately mixed response verifies the chart's pair isolation.
  return r.fulfill({json:{symbol,records:[trade,burn],trades:{status:'ok',first_ms:eventTime,last_ms:eventTime,sample_count:10,selected_count:1}}});
 });
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 const chart=page.locator('#chart');
 await expect(chart).toHaveAttribute('data-event-count','2',{timeout:15000});
 await expect(chart).toHaveAttribute('data-event-markers','2');
 await expect(page.locator('#chartEventList')).toContainText('813 USDT');
 await expect(page.locator('#chartEventList a[href="https://solscan.io/tx/'+signature+'"]')).toHaveCount(1);
 await expect(page.locator('#chartEventList button[data-event-candle="'+candle+'"]')).toHaveCount(2);
 await page.locator('#chartEventList button').first().click();
 await expect(chart).toBeFocused();
 await page.locator('#eventToggle').click();
 await expect(chart).toHaveAttribute('data-event-markers','0');
 await expect(page.locator('#chartEvents')).toBeHidden();
 await page.locator('#eventToggle').click();
 await page.locator('button[data-frame="1h"]').click();
 await expect(chart).toHaveAttribute('data-event-markers','2');
 await page.locator('#assetPickerButton').click();
 await page.locator('#assetSearch').fill('BTC');
 await page.locator('[data-pair="BTCUSDT"]').click();
 await expect(chart).toHaveAttribute('data-event-count','1');
 await expect(page.locator('#chartEventList')).not.toContainText('حرق توكنات');
 await expect(page.locator('#chartEventList a')).toHaveAttribute('href','https://www.mexc.com/exchange/BTC_USDT');
 await page.locator('.page-nav a[href="#labCenter"]').click();
 await expect(page.locator('#operationsChecked')).toContainText('آخر دورة رصد');
 const status=page.locator('[data-operation-source="mexc_trades"]');
 await expect(status).toContainText('غير متاح');
 await expect(status.locator('td').last()).not.toHaveText('—');
 await page.locator('.operation-incidents summary').click();
 await expect(page.locator('#operationsIncidents')).toContainText('متاح → غير متاح');
 expect(errors).toEqual([]);
});

test('historical replay advances candle by candle and reveals only recorded information at the cursor',async({page})=>{
 const step=900000,last=Math.floor(Date.now()/step)*step-step;
 const bars=Array.from({length:80},(_,i)=>({t:last-(79-i)*step,o:1,h:1.1,l:.9,c:1.05,v:50}));
 const cutoff=bars[55].t+step;
 const at=ms=>new Date(ms).toISOString();
 const rows=[
  {horizon:'1h',created_utc:at(cutoff-step),reference_price:1,predicted_price:1.23,due_utc:at(cutoff+4*step),actual_price:null},
  {horizon:'1h',created_utc:at(cutoff+2*step),reference_price:1,predicted_price:1.34,due_utc:at(cutoff+6*step),actual_price:null},
  {horizon:'1h',created_utc:at(cutoff-6*step),reference_price:1,predicted_price:1.04,due_utc:at(cutoff-step),
   actual_price:1.05,measurement_time_utc:at(cutoff-step),evaluated_utc:at(cutoff+2*step)}
 ];
 await page.route('**/api/dashboard',r=>r.fulfill({json:{market:{price:1.05},candles:{'15m':bars},
  observed_utc:at(last),forecast_review:{rows}}}));
 await page.route('**/api/market-update?**',r=>r.abort());
 await page.route('**/api/market-events?**',r=>r.fulfill({json:{symbol:'STAMPUSDT',records:[]}}));
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 const chart=page.locator('#chart'),toggle=page.locator('#replayToggle');
 await expect(chart).toHaveAttribute('data-bar-count','80',{timeout:15000});
 await toggle.click();
 await expect(chart).toHaveAttribute('data-replay-cutoff',String(cutoff));
 await expect(chart).toHaveAttribute('data-bar-count','56');
 await expect(chart).toHaveAttribute('data-forming','false');
 await expect(chart).toHaveAttribute('data-actual-points','0');
 await expect(page.locator('#replayForecast')).toContainText('1.23');
 await expect(page.locator('#replayForecast')).not.toContainText('1.34');
 await page.locator('#replayStep').click();
 await expect(chart).toHaveAttribute('data-replay-cutoff',String(cutoff+step));
 await expect(chart).toHaveAttribute('data-actual-points','0');
 await page.locator('#replayPlay').click();
 await expect(page.locator('#replayForecast')).toContainText('1.34');
 await page.locator('#replayPlay').click();
 await expect(chart).toHaveAttribute('data-actual-points','1');
 await page.locator('#replayPosition').fill('1');
 await expect(chart).toHaveAttribute('data-bar-count','2');
 await expect(chart).toHaveAttribute('data-actual-points','0');
 await toggle.click();
 await expect(chart).toHaveAttribute('data-replay','false');
 await expect(chart).toHaveAttribute('data-bar-count','80');
});

test('workspace navigation works with the market application unavailable',async({page})=>{
 await page.route('**/assets/app.js?*',route=>route.abort());
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await page.locator('#flowTab').click();
 await expect(page.locator('#globalMarketFlow')).toBeVisible();
 await expect(page.locator('#trading')).toBeHidden();
 await page.locator('#labTab').click();
 await expect(page.locator('#labCenter')).toBeVisible();
 await page.goBack();
 await expect(page.locator('#globalMarketFlow')).toBeVisible();
 await page.reload();
 await expect(page.locator('#globalMarketFlow')).toBeVisible();
 await expect(page.locator('#labCenter')).toBeHidden();
});

test('market pulse describes the trade sample and draws high density scenes',async({page})=>{
 const now=Date.now(), start=Math.floor(now/900000)*900000;
 const candles=Array.from({length:20},(_,i)=>({t:start-(20-i)*900000,o:2,c:2.1,h:2.2,l:1.9,v:20}));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/dashboard',route=>route.fulfill({json:{
  observed_utc:new Date(now).toISOString(),candles:{'15m':candles},
  market:{price:2.1,change:.05,trades:{aggressive_buy_notional_usdt:150,aggressive_sell_notional_usdt:40,
   first_trade_ms:now-60000,last_trade_ms:now,aggressive_buy_count:8,aggressive_sell_count:2}},
  liquidity:{liquidity_usd:1234,observed_utc:new Date(now).toISOString()}
 }}));
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await expect(page.locator('#lensBuy')).toHaveText('150 USDT');
 await expect(page.locator('#lensSell')).toHaveText('40 USDT');
 await expect(page.locator('#lensFlowDetail')).toContainText('110 USDT');
 await expect(page.locator('#lensLiquidity')).toContainText('$1,234');
 for(const id of ['lensPrice','lensFlow']){
  expect(await page.locator('#'+id).evaluate(canvas=>canvas.width>=canvas.clientWidth&&canvas.toDataURL().length>2000)).toBe(true);
 }
 await expect(page.locator('#lensMotion')).toHaveAttribute('aria-pressed','false');
 await page.locator('#lensMotion').click();
 await expect(page.locator('#lensMotion')).toHaveAttribute('aria-pressed','true');
});

test('evidence map switches pair, inspects depth and jumps to a recorded candle',async({page})=>{
 const now=Date.now(),step=900000,end=Math.floor(now/step)*step,time=end-step+10000;
 const candles=Array.from({length:20},(_,i)=>({t:end-(20-i)*step,o:2,c:2.1,h:2.2,l:1.9,v:20}));
 await page.route('**/api/dashboard',r=>r.fulfill({json:{observed_utc:new Date(now).toISOString(),market:{price:2.1},candles:{'15m':candles}}}));
 await page.route('**/api/assets/venues?*',r=>{
  const symbol=new URL(r.request().url()).searchParams.get('symbol');
  return r.fulfill({json:{symbol,available_venues:1,retrieved_at_utc:new Date(now).toISOString(),venues:{
   MEXC:{status:'ok',bid:2,ask:2.2,mid:2.1,spread_pct:9.52,retrieved_at_utc:new Date(now).toISOString()}
  }}});
 });
 await page.route('**/api/market-events?*',r=>{
  const symbol=new URL(r.request().url()).searchParams.get('symbol');
  return r.fulfill({json:{symbol,records:[{id:'execution',symbol,kind:'trade',side:'buy',time_ms:time,notional:40}]}});
 });
 await page.route('**/api/assets/microstructure?*',r=>{
  const params=new URL(r.request().url()).searchParams;
  return r.fulfill({json:{symbol:params.get('symbol'),venue:params.get('venue'),result:{candles:{status:'unavailable'},book:{status:'ok',retrieved_at_utc:new Date(now).toISOString(),data:{
   bids:[{price:2,quantity:50}],asks:[{price:2.2,quantity:20}],bid_depth_usdt:100,ask_depth_usdt:44,spread_pct:9.52,levels:1
  }}}}});
 });
 await page.route('**/api/assets/snapshot?*',r=>r.fulfill({json:{symbol:'SOLUSDT',ticker:{lastPrice:2.1,closeTime:now},candles:{'15m':candles}}}));
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await page.locator('#venuesTab').click();
 await expect(page.locator('#venueNetworkStatus')).toContainText('STAMPUSDT');
 await page.locator('[data-scene-node="MEXC"]').click();
 await expect(page.locator('#sceneNodeDetail')).toContainText('Bid / Ask');
 await expect(page.locator('#microMetrics meter')).toBeVisible();
 await page.locator('#sceneTimeline button').first().click();
 await expect(page.locator('#trading')).toBeVisible();
 await page.locator('#assetPickerButton').click();
 await page.locator('#assetSearch').fill('SOL');
 await page.locator('[data-pair="SOLUSDT"]').click();
 await page.locator('#venuesTab').click();
 await expect(page.locator('#venueNetworkStatus')).toContainText('SOLUSDT');
 await page.locator('[data-scene-node="display"]').click();
 await expect(page.locator('#sceneNodeDetail')).toContainText('SOLUSDT');
});

test('market flows switch between the whole market and a selected pair',async({page})=>{
 const now=Date.now(), ts=new Date(now).toISOString();
 await page.route('**/api/market-flow**',route=>{
  const symbol=new URL(route.request().url()).searchParams.get('symbol');
  const buy=symbol==='SOLUSDT'?200:50,flow={buy,sell:40,bucket_ms:1000,buckets:[{time_ms:now-1000,buy,sell:40,count:2}]};
  return route.fulfill({json:symbol?{symbol,source:'public spot executions',status:'ok',observed_utc:ts,first_ms:now-1000,last_ms:now,
   identity_status:symbol==='SOLUSDT'?'major_pair_symbol_match':'cross_venue_identity_unverified',
   available_venues:1,sample_count:2,venues:{MEXC:{status:'ok',observed_utc:ts,first_ms:now-1000,last_ms:now,sample_count:2,flow}},
   flow:symbol==='SOLUSDT'?flow:null}
   :{market_cap_usd:3e12,volume_24h_usd:100e9,stablecoin_supply_usd:200e9,market_observed_at_utc:ts,
   stablecoin_supply_observed_at_utc:ts,stablecoin_history:[{t:now/1000-86400,v:199e9},{t:now/1000,v:200e9}]}});
 });
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await page.locator('#flowTab').click();
 await expect(page.locator('#flowCap')).toHaveText('$3T');
 await page.locator('#flowPairMode').click();
 await expect(page.locator('#flowVenueSelect')).toHaveValue('all');
 await expect(page.locator('#flowPairPlot .flow-venue-lane')).toContainText('50 USDT');
 await expect(page.locator('#flowPairNet')).toHaveText('—');
 await page.locator('#flowPairInput').fill('SOL');
 await page.locator('#flowPairForm button[type="submit"]').click();
 await expect(page.locator('#flowPairTitle')).toHaveText('SOL / USDT');
 await expect(page.locator('#flowPairNet')).toHaveText('+160 USDT');
 await expect(page.locator('#flowPairPlot svg')).toBeVisible();
 await page.locator('#flowWholeMode').click();
 await expect(page.locator('#flowCap')).toBeVisible();
 await expect(page.locator('#flowPairView')).toBeHidden();
});

test('3D market map uses the selected window and shows verified valuation details', async ({page}) => {
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);});
 const pairs = ['BTCUSDT', 'ETHUSDT', 'STAMPUSDT'];
 const stamp = Date.now();
 await page.route('**/api/market-map', route => route.fulfill({json:{
  pairs, valuation_available:true, assets:{BTCUSDT:{sector:'bitcoin', market_cap_usd:1200000000000,
   circulating_supply:20000000, volume_24h_usd:12000000000, valuation_source:'CoinGecko',
   valuation_at:new Date(stamp).toISOString()},
   ETHUSDT:{sector:'layer1',market_cap_usd:600000000000,circulating_supply:120000000,
    valuation_at:new Date(stamp).toISOString(),valuation_source:'CoinGecko'}}
 }}));
 await page.route('**/api/market-map/windows?*', route => {
  const period = new URL(route.request().url()).searchParams.get('period');
  const price = period === '5m' ? 200 : 100;
  return route.fulfill({json:{period, cards:pairs.map(pair => ({pair, venue:'OKX',
   price, last_price:price+1, quote_received_at:new Date(stamp).toISOString(), high:price + 10, low:price - 10, prices:[price - 10,price], change:2, price_at_ms:stamp}))}});
 });
 await page.goto(HOST + '/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await page.locator('#traceOrbit').click();
 await expect(page.locator('#traceOrbit')).toHaveAttribute('aria-pressed','false');
 await page.locator('.trace-module-list summary').click();
 await page.locator('[data-trace-stage="market_map"]').click();
 await expect(page.locator('#marketMapTab')).toHaveAttribute('aria-selected','true');
 const btc = page.locator('#marketMapBoard [data-pair="BTCUSDT"]');
 await expect(btc).toContainText('$1.2T');
 await expect(btc).toContainText('101 USDT');
 const ratio=await page.evaluate(()=>{
  const btc=document.querySelector('#marketMapBoard [data-pair="BTCUSDT"]');
  const eth=document.querySelector('#marketMapBoard [data-pair="ETHUSDT"]');
  return btc.offsetWidth*btc.offsetHeight/(eth.offsetWidth*eth.offsetHeight);
 });
 expect(ratio).toBeGreaterThan(1.97);
 expect(ratio).toBeLessThan(2.03);
 await expect(page.locator('#marketMapUnknown')).toContainText('STAMP');
 await expect(page.locator('body')).toHaveAttribute('data-workspace','marketMap');
 await page.locator('#marketMapPeriod').selectOption('5m');
 await expect(btc).toContainText('201 USDT');
 await expect(btc.locator('polyline')).toBeVisible();
 await page.locator('#marketMapView').selectOption('sectors');
 await expect(page.locator('#marketMapBoard')).toHaveAttribute('data-sector-count','2');
 await page.locator('#marketMapRight').click();
 await expect(page.locator('#marketMapBoard')).toHaveAttribute('style', /--market-yaw: 0deg/);
 await page.locator('#marketMapViewport').screenshot({path:'test-results/stamp-proportional-market-map.png'});
 await btc.click();
 await expect(page.locator('#assetSelected')).toHaveText('BTC / USDT');
 await expect(page.locator('#traceStage')).toHaveText('خريطة السوق');
 await expect(page.locator('#marketMapDetail')).toContainText('CoinGecko');
 await expect(page.locator('#marketMapDetail')).toContainText('20,000,000');
 await page.locator('#marketMapStar').click();
 await page.locator('#marketMapDetail form button').click();
 await page.locator('#marketMapFavorites').check();
 await expect(page.locator('#marketMapBoard .market-map-card')).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 await btc.click();
 await page.locator('#marketMapChart').click();
 for(const id of ['flowTab','marketMapTab','venuesTab','tradeTab']){
  await page.locator('#'+id).click();
  await expect(page.locator('#'+id)).toHaveAttribute('aria-selected','true');
 }
 await expect(page.locator('#tradeTab')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#coinName')).toHaveText('BTC / USDT');
 expect(errors).toEqual([]);
});
