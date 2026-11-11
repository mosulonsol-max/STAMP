const { test, expect } = require('@playwright/test');
if (process.env.STAMP_CHROME_CHANNEL === 'chrome') test.use({channel:'chrome'});
const HOST='http://localhost:10000';
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
 await page.locator('[data-frame="1h"]').click();await expect(page.locator('#chart')).toHaveAttribute('data-frame','1h');
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
 await page.locator('[data-frame="4h"]').click();
 await expect(chart).toHaveAttribute('data-frame','4h');
 await expect.poll(async()=>Number(await chart.getAttribute('data-elliott-counts'))).toBeGreaterThan(0);
 await page.locator('[data-frame="15m"]').click();
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
 await page.locator('#assetSelect').selectOption('BTCUSDT');
 await expect(page.locator('#coinName')).toHaveText('BTC / USDT');
 await expect(page.locator('#price')).toHaveText('67,500.00');
 await expect.poll(()=>socket!==previousSocket).toBe(true);
 socket.send(ticker('0.009'));
 await expect(page.locator('#price')).toHaveText('67,500.00');
 expect(errors).toEqual([]);
});
