const { test, expect } = require('@playwright/test');
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
 await page.locator('.audit-details summary').click();await expect(page.locator('#modelReason')).toContainText('تلقائي');await page.locator('.audit-details summary').click();
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
 const asset=await request.get(HOST+'/assets/chart.js');expect(asset.status()).toBe(200);expect(await asset.text()).toContain('TradingView Lightweight Charts');
});

test('stream changes price, 24h metrics and forming candle without reload; disconnect falls back automatically',async({page})=>{
 const {field,message,ticker}=require('../tests/market_stream.cjs');
 let socket,restPrice=.0001111,quoteRequests=0;
 await page.routeWebSocket('wss://wbs-api.mexc.com/ws',ws=>{socket=ws;ws.onMessage(()=>{})});
 await page.route('**/api/quote',async route=>{quoteRequests++;const now=new Date().toISOString();await route.fulfill({json:{quote:{status:'fresh',price:restPrice,provider_at_utc:now,retrieved_at_utc:now,change_24h_pct:1,volume_24h_usdt:1000,high_24h:.002,low_24h:.0001}}})});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(HOST+'/');await page.locator('#user').fill('test-user');await page.locator('#password').fill('long-test-password');await page.locator('form[action="/login"] button').click();
 await expect(page.locator('#chart canvas').first()).toBeVisible({timeout:25000});
 await expect.poll(()=>!!socket).toBe(true);await expect.poll(()=>quoteRequests).toBeGreaterThan(0);
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
 await page.locator('#assuranceDetails summary').click();await expect(page.locator('#assuranceSummary')).toContainText('غير معتمد');await expect(page.locator('#assuranceMetrics table')).toBeVisible();
 const assurance=await (await page.request.get(HOST+'/api/assurance')).json();expect(assurance.rollout.ready).toBe(false);expect(Object.keys(assurance.horizons)).toHaveLength(4);
 expect(errors).toEqual([]);
});
