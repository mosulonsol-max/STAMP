const {test,expect}=require('@playwright/test');
if (process.env.STAMP_CHROME_CHANNEL === 'chrome') test.use({channel:'chrome'});
const HOST=process.env.STAMP_TEST_HOST||'http://127.0.0.1:10000';

test('unified spatial scene binds verified capitalization, quotes and module details',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const now=new Date().toISOString(),stamp=Date.now();
 await page.route('**/api/market-map',route=>route.fulfill({json:{
  pairs:['BTCUSDT','ETHUSDT','STAMPUSDT'],valuation_available:true,
  assets:{
   BTCUSDT:{market_cap_usd:1200000000000,circulating_supply:20000000,valuation_at:now,valuation_source:'CoinGecko'},
   ETHUSDT:{market_cap_usd:600000000000,circulating_supply:120000000,valuation_at:now,valuation_source:'CoinGecko'},
   STAMPUSDT:{sector:'other'}
  }
 }}));
 await page.route('**/api/market-map/windows?*',route=>route.fulfill({json:{
  period:'24h',cards:['BTCUSDT','ETHUSDT'].map((pair,index)=>({
   pair,venue:index?'Binance':'OKX',price:index?2000:68000,last_price:index?2001:68001,
   quote_received_at:now,price_at_ms:stamp,high:70000,low:60000,change:index?-1:2,prices:[1,2]
  }))
 }}));
 await page.route('**/api/pipeline/events?*',route=>route.fulfill({json:{
  source:'worker_runtime_telemetry',checked_at_utc:now,sequence:1,
  events:[{sequence:1,from:'monitor',to:'archive',artifact:'data/latest.json',
   sha256:'a'.repeat(64),bytes:840,run:'12345',observed_utc:now,received_at_utc:now}]
 }}));
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await expect(page.locator('.page-nav')).toHaveCount(0);
 await expect(page.locator('#traceCanvas')).toBeVisible();
 await expect(page.locator('#sceneDetail')).toBeHidden();
 await expect(page.locator('#sceneSnapshot .market-overview')).toBeVisible();
 await expect(page.locator('#sceneSnapshot #predictionCenter')).toBeVisible();
 await expect(page.locator('#sceneForecastChart')).toBeVisible();
 await expect(page.locator('#forecastCards [data-horizon]')).toHaveCount(4);
 await expect(page.locator('#forecastSummary')).not.toHaveText('—');
 await expect(page.locator('.trace-inspector')).toBeHidden();
 await expect(page.locator('#sceneEventFeed button')).toHaveCount(1);
 await page.locator('#sceneEventFeed button').click();
 await expect(page.locator('.trace-inspector')).toBeVisible();
 await expect(page.locator('#traceDetails')).toContainText('data/latest.json');
 await expect(page.locator('#sceneAssets')).toContainText('1.8T');
 await expect(page.locator('#sceneVenues')).toContainText('OKX');
 await expect(page.locator('#traceCanvas')).toHaveAttribute('data-market-tiles','2');
 const shares=await page.locator('#traceCanvas').evaluate(canvas=>Object.fromEntries(JSON.parse(canvas.dataset.marketAreas)));
 expect(shares.BTCUSDT/shares.ETHUSDT).toBeCloseTo(2,5);
 await page.locator('#traceOrbit').click();
 await page.locator('#traceReset').click();
 await page.locator('#traceCanvas').scrollIntoViewIfNeeded();
 const world=await page.locator('#traceCanvas').boundingBox();
 const hit=await page.locator('#traceCanvas').evaluate(canvas=>JSON.parse(canvas.dataset.marketHits).find(row=>row.pair==='BTCUSDT').center);
 await page.mouse.click(world.x+hit.x,world.y+hit.y);
 await expect(page.locator('#traceStage')).toContainText('BTC');
 await page.locator('.trace-module-list summary').click();
 await page.locator('[data-scene-pair="BTCUSDT"]').click();
 await expect(page.locator('#traceStage')).toContainText('BTC');
 await expect(page.locator('#forecastTitle')).toContainText('الزوج المحدد');
 await expect(page.locator('#forecastHorizon')).toBeHidden();
 await expect(page.locator('#forecastCards .forecast-card')).toHaveCount(1);
 await expect(page.locator('#forecastSummary')).toContainText('15m');
 await expect(page.locator('#traceDetails')).toContainText('CoinGecko');
 await expect(page.locator('#traceDetails')).toContainText('OKX');
 await page.locator('#traceOpen').click();
 await expect(page.locator('#sceneDetail')).toBeVisible();
 await expect(page.locator('#trading')).toBeVisible();
 await expect(page.locator('#chart canvas').first()).toBeVisible({timeout:20000});
 await page.locator('#sceneDetailClose').click();
 await expect(page.locator('#sceneDetail')).toBeHidden();
 await expect(page.locator('#traceCanvas')).toBeVisible();
 await page.locator('#sceneForecastChart').click();
 await expect(page.locator('#trading')).toBeVisible();
 await page.locator('#sceneDetailClose').click();
 await page.locator('[data-trace-stage="lab"]').click();
 await expect(page.locator('#traceStage')).toContainText('المختبر');
 await page.locator('#traceOpen').click();
 await expect(page.locator('#labCenter')).toBeVisible();
 await page.goBack();
 await expect(page.locator('#sceneDetail')).toBeHidden();
 await page.locator('.trace-module-list summary').click();
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'test-results/unified-scene-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#traceCanvas')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 const yaw=Number(await page.locator('#traceCanvas').getAttribute('data-camera-yaw'));
 await page.locator('#traceCanvas').scrollIntoViewIfNeeded();
 const mobileCanvas=await page.locator('#traceCanvas').boundingBox();
 await page.mouse.move(Math.max(50,mobileCanvas.x+60),mobileCanvas.y+150);
 await page.mouse.down();await page.mouse.move(Math.max(120,mobileCanvas.x+140),mobileCanvas.y+150,{steps:8});await page.mouse.up();
 expect(Number(await page.locator('#traceCanvas').getAttribute('data-camera-yaw'))).not.toBe(yaw);
 const snapshot=await page.locator('#sceneSnapshot').boundingBox();
 expect(snapshot.x).toBeGreaterThanOrEqual(0);
 expect(snapshot.x+snapshot.width).toBeLessThanOrEqual(391);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'test-results/unified-scene-mobile.png',fullPage:true});
 const beforePan=await page.locator('.trace-stage-world').evaluate(node=>node.scrollLeft);
 expect(beforePan).toBeGreaterThan(200);
 await page.locator('#tracePanNext').click();
 await expect.poll(async()=>page.locator('.trace-stage-world').evaluate(node=>node.scrollLeft)).toBeGreaterThan(beforePan+100);
 await page.screenshot({path:'test-results/unified-scene-mobile-end.png'});
 expect(errors).toEqual([]);
});

test('3D execution packets follow new venue evidence and stop in a quiet sample',async({page})=>{
 const now=Date.now(),time=new Date(now).toISOString();let calls=0;
 const execution=(id,side,at,notional)=>({id:'okx:STAMPUSDT:'+id,side,time_ms:at,notional,price:.0002});
 await page.route('**/api/pipeline/events?*',route=>route.fulfill({json:{
  source:'worker_runtime_telemetry',checked_at_utc:time,sequence:0,events:[]}}));
 await page.route('**/api/market-flow?symbol=STAMPUSDT',route=>{
  calls++;
  const trades=[execution('base','buy',now-1400,15),
   ...(calls>1?[execution('new-buy','buy',now-700,30),execution('new-sell','sell',now-500,45)]:[])];
  return route.fulfill({json:{symbol:'STAMPUSDT',status:'ok',observed_utc:time,
   identity_status:'cross_venue_identity_unverified',venues:{OKX:{status:'ok',observed_utc:time,
    last_ms:trades.at(-1).time_ms,sample_count:trades.length,recent_executions:trades}},
   available_venues:1,flow:null}});
 });
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await expect.poll(()=>calls).toBeGreaterThan(0);
 await expect(page.locator('#sceneEventFeed')).not.toContainText('OKX · STAMP');
 await page.waitForTimeout(100);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('stamp:assetchange',{detail:{symbol:'STAMPUSDT'}})));
 await expect.poll(()=>calls).toBeGreaterThan(1);
 await expect(page.locator('#sceneEventFeed')).toContainText('شراء');
 await expect(page.locator('#sceneEventFeed')).toContainText('بيع');
 await expect.poll(async()=>Number(await page.locator('#traceCanvas').getAttribute('data-active-packets'))).toBe(2);
 const kinds=JSON.parse(await page.locator('#traceCanvas').getAttribute('data-packet-kinds'));
 expect(kinds.map(item=>item.side).sort()).toEqual(['buy','sell']);
 expect(kinds.map(item=>item.notional).sort((a,b)=>a-b)).toEqual([30,45]);
 await page.locator('#traceCanvas').screenshot({path:'test-results/observed-execution-3d.png'});
 await page.locator('#sceneEventFeed button').first().click();
 await expect(page.locator('#traceDetails')).toContainText('45');
 await expect(page.locator('#traceDetails')).toContainText('عينة محدودة');
 await expect.poll(async()=>Number(await page.locator('#traceCanvas').getAttribute('data-active-packets')),{timeout:10000}).toBe(0);
});

test('wallet object shows verified Solana read without implying trading',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const address='11111111111111111111111111111111',observed=new Date().toISOString();
 let calls=0;
 await page.route('**/api/wallet/observe?*',route=>{
  calls++;
  expect(new URL(route.request().url()).searchParams.get('address')).toBe(address);
  return route.fulfill({json:{address,observed_at_utc:observed,source:'Solana JSON-RPC confirmed',
   sol:'1.23456789',stamp:'12.500001',tokens:[{mint:'EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc',amount:'12.500001',decimals:6}],
   token_count:1,mode:'read_only',execution:'disabled_no_signer',profit_loss:null}});
 });
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await page.locator('#walletOpen').click();
 await expect(page.locator('#walletCenter')).toBeVisible();
 await page.locator('#walletAddress').fill('not-a-wallet');
 await page.locator('#walletForm button[type="submit"]').click();
 await expect(page.locator('#walletStatus')).toContainText('أدخل عنوان سولانا');
 expect(calls).toBe(0);
 await page.locator('#walletAddress').fill(address);
 await page.locator('#walletForm button[type="submit"]').click();
 await expect(page.locator('#walletStatus')).toContainText('التنفيذ معطّل');
 await expect(page.locator('#walletSol')).toHaveText('1.23456789');
 await expect(page.locator('#walletStamp')).toHaveText('12.500001');
 await expect(page.locator('#walletPnl')).toContainText('غير محسوب');
 await expect(page.locator('#walletObserved')).toContainText('سولانا JSON-RPC');
 await expect(page.locator('#sceneEventFeed')).toContainText('قراءة رصيد المحفظة');
 await page.locator('#sceneDetailClose').click();
 await page.locator('.trace-module-list summary').click();
 await page.locator('[data-trace-stage="wallet"]').click();
 await expect(page.locator('#traceDetails')).toContainText('التداول معطّل');
 await page.locator('#traceOpen').click();
 await expect(page.locator('#walletCenter')).toBeVisible();
 await page.locator('#walletForget').click();
 await expect(page.locator('#walletResult')).toBeHidden();
 await expect(page.locator('#sceneEventFeed')).not.toContainText('قراءة رصيد المحفظة');
 expect(calls).toBe(1);
 expect(errors).toEqual([]);
});
