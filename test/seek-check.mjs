import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const OUT = '/Users/nwparker/orca/workspaces/stockcoaster/v1/test/shots/';

await page.goto('http://localhost:5179/?ride=NVDA&go=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const before = (await page.textContent('#hud-date'))?.trim().slice(0, 20);

// click at ~85% across the minimap chart
const box = await page.locator('#hud-chart').boundingBox();
const x85 = box.x + box.width * 0.85, ymid = box.y + box.height / 2;
await page.mouse.move(x85, ymid);           // hover first (scrubber line + date)
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '11-seek-hover.png', clip: { x: box.x - 12, y: box.y - 40, width: box.width + 40, height: box.height + 60 } });
await page.mouse.click(x85, ymid);
await page.waitForTimeout(1500);
const after = (await page.textContent('#hud-date'))?.trim().slice(0, 20);
const zone = (await page.textContent('#hud-zone'))?.trim();
console.log('before:', JSON.stringify(before), '-> after click @85%:', JSON.stringify(after), '| zone:', zone);
await page.screenshot({ path: OUT + '12-seek-result.png' });

// jump BACK to ~10%
await page.mouse.click(box.x + box.width * 0.10, ymid);
await page.waitForTimeout(1500);
console.log('after click @10%:', JSON.stringify((await page.textContent('#hud-date'))?.trim().slice(0, 20)));

// seek must also work from the pause overlay (ESC then click map)
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.mouse.click(box.x + box.width * 0.5, ymid);
await page.waitForTimeout(1200);
const overlayGone = await page.evaluate(() => document.getElementById('lock-hint').style.display !== 'flex');
console.log('after ESC + map click @50%:', JSON.stringify((await page.textContent('#hud-date'))?.trim().slice(0, 20)), '| overlay dismissed:', overlayGone);

console.log('pageerrors:', errors.length ? errors : 'none');
await browser.close();
