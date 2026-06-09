import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const OUT = '/Users/nwparker/orca/workspaces/stockcoaster/v1/test/shots/';

// NVDA near the end: should be OUTER SPACE (stars, moon, planets)
await page.goto('http://localhost:5179/?ride=NVDA&go=1&at=0.93', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
console.log('NVDA @93%:', (await page.textContent('#hud-zone'))?.trim(), '|', (await page.textContent('#hud-date'))?.trim().slice(0,20));
await page.screenshot({ path: OUT + '07-nvda-space.png' });

// GME at the squeeze peak (~Jan 2021 is around 28% through 2019-2026)
await page.goto('http://localhost:5179/?ride=GME&go=1&at=0.27', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
console.log('GME @27%:', (await page.textContent('#hud-zone'))?.trim(), '|', (await page.textContent('#hud-date'))?.trim().slice(0,20));
await page.screenshot({ path: OUT + '08-gme-squeeze.png' });

// PTON near the end: deep in THE PIT
await page.goto('http://localhost:5179/?ride=PTON&go=1&at=0.8', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
console.log('PTON @80%:', (await page.textContent('#hud-zone'))?.trim(), '|', (await page.textContent('#hud-date'))?.trim().slice(0,20));
await page.screenshot({ path: OUT + '09-pton-pit.png' });

// ride to the end: summary screen
await page.goto('http://localhost:5179/?ride=BTC-USD&go=1&at=0.985', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
const summary = await page.textContent('#summary-title').catch(() => null);
console.log('BTC summary title:', JSON.stringify(summary));
await page.screenshot({ path: OUT + '10-summary.png' });

console.log('pageerrors:', errors.length ? errors : 'none');
await browser.close();
