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
 await page.goto(HOST+'/');
 await page.locator('#user').fill('test-user');
 await page.locator('#password').fill('long-test-password');
 await page.locator('form[action="/login"] button').click();
 await expect(page.locator('.page-nav')).toHaveCount(0);
 await expect(page.locator('#traceCanvas')).toBeVisible();
 await expect(page.locator('#sceneDetail')).toBeHidden();
 await expect(page.locator('#sceneAssets')).toContainText('1.8T');
 await expect(page.locator('#sceneVenues')).toContainText('OKX');
 await expect(page.locator('#traceCanvas')).toHaveAttribute('data-market-tiles','2');
 const shares=await page.locator('#traceCanvas').evaluate(canvas=>Object.fromEntries(JSON.parse(canvas.dataset.marketAreas)));
 expect(shares.BTCUSDT/shares.ETHUSDT).toBeCloseTo(2,5);
 await page.locator('#traceOrbit').click();
 await page.locator('#traceReset').click();
 const world=await page.locator('#traceCanvas').boundingBox();
 await page.mouse.click(world.x+world.width*.13,world.y+world.height*.48);
 await expect(page.locator('#traceStage')).toContainText('BTC');
 await page.locator('.trace-module-list summary').click();
 await page.locator('[data-scene-pair="BTCUSDT"]').click();
 await expect(page.locator('#traceStage')).toContainText('BTC');
 await expect(page.locator('#traceDetails')).toContainText('CoinGecko');
 await expect(page.locator('#traceDetails')).toContainText('OKX');
 await page.locator('#traceOpen').click();
 await expect(page.locator('#sceneDetail')).toBeVisible();
 await expect(page.locator('#trading')).toBeVisible();
 await expect(page.locator('#chart canvas').first()).toBeVisible({timeout:20000});
 await page.locator('#sceneDetailClose').click();
 await expect(page.locator('#sceneDetail')).toBeHidden();
 await expect(page.locator('#traceCanvas')).toBeVisible();
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
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'test-results/unified-scene-mobile.png',fullPage:true});
 const beforePan=await page.locator('.trace-stage-world').evaluate(node=>node.scrollLeft);
 await page.locator('#tracePanNext').click();
 await expect.poll(async()=>page.locator('.trace-stage-world').evaluate(node=>node.scrollLeft)).toBeGreaterThan(beforePan+100);
 await page.screenshot({path:'test-results/unified-scene-mobile-end.png'});
 expect(errors).toEqual([]);
});
