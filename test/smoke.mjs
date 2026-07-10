// Headless smoke test: loads the menu, rides two coasters, captures
// screenshots + console errors. Run with the dev server up on :5179:
//   node test/smoke.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:5179';
const OUT = new URL('../test/shots/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    errors.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

const fail = msg => { console.error('FAIL:', msg); process.exitCode = 1; };

// ---- 1. menu
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const cards = await page.locator('.ride-card').count();
console.log(`menu: ${cards} ride cards`);
if (cards < 10) fail(`expected >=10 ride cards, got ${cards}`);
await page.screenshot({ path: OUT + '01-menu.png' });

// ---- 2. NVDA ride via autostart param
await page.goto(BASE + '/?ride=NVDA&go=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const date1 = await page.textContent('#hud-date');
console.log('NVDA date @2.5s:', JSON.stringify(date1?.trim().slice(0, 30)));
await page.screenshot({ path: OUT + '02-nvda-start.png' });

await page.waitForTimeout(9000);
const date2 = await page.textContent('#hud-date');
console.log('NVDA date @11.5s:', JSON.stringify(date2?.trim().slice(0, 30)));
await page.screenshot({ path: OUT + '03-nvda-later.png' });
if (date1 === date2) fail('HUD date did not advance — cart appears stuck');

// speed up to 4 and jump ahead for the high-altitude part
await page.keyboard.press('Digit4');
await page.waitForTimeout(20000);
await page.screenshot({ path: OUT + '04-nvda-high.png' });
const zone = await page.textContent('#hud-zone');
console.log('NVDA zone @31s:', JSON.stringify(zone?.trim()));

// ---- 3. GME ride (meme theme, the squeeze)
await page.goto(BASE + '/?ride=GME&go=1', { waitUntil: 'networkidle' });
await page.keyboard.press('Digit3');
await page.waitForTimeout(12000);
await page.screenshot({ path: OUT + '05-gme.png' });
const gmeDate = await page.textContent('#hud-date');
console.log('GME date @12s:', JSON.stringify(gmeDate?.trim().slice(0, 30)));

// ---- 4. PTON (rust theme)
await page.goto(BASE + '/?ride=PTON&go=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.screenshot({ path: OUT + '06-pton.png' });

// ---- 5. TOKENS (generic non-stock time series, loaded via ?data=)
await page.goto(BASE + '/?data=data/TOKENS.json&go=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const tokPrice1 = await page.textContent('#hud-price');
console.log('TOKENS value @2.5s:', JSON.stringify(tokPrice1?.trim().slice(0, 40)));
if (!tokPrice1?.includes('tok')) fail(`expected token unit in HUD value, got ${JSON.stringify(tokPrice1)}`);
await page.keyboard.press('Digit3');
await page.waitForTimeout(8000);
const tokPrice2 = await page.textContent('#hud-price');
console.log('TOKENS value @10.5s:', JSON.stringify(tokPrice2?.trim().slice(0, 40)));
if (tokPrice1 === tokPrice2) fail('TOKENS HUD value did not advance — cart appears stuck');
await page.screenshot({ path: OUT + '07-tokens.png' });

// ---- console errors
const uniq = [...new Set(errors)];
console.log(`\nconsole errors/warnings (${uniq.length}):`);
for (const e of uniq.slice(0, 30)) console.log(' ', e.slice(0, 300));

await browser.close();
console.log('\nscreenshots in', OUT);
