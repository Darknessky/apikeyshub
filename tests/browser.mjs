// Optional browser smoke test. Start the dev server and a headless Chromium
// instance with --remote-debugging-port=9222 before running this file.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { PROVIDERS } from '../src/data.js';
import { REFERRAL_LINKS } from '../src/config.js';

const targets = await (await fetch(`http://127.0.0.1:${process.argv[2] || 9222}/json/list`)).json();
const target = targets.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let counter = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception?.description || ''));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timeout } = pending.get(message.id); clearTimeout(timeout); pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++counter; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000); pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const pause = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(expression) { for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await pause(100); } throw new Error(`Condition not met: ${expression}`); }
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function fill(value) { await evaluate(`(() => { const input = document.querySelector('#provider-search'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`); }
async function sort(value) { await evaluate(`(() => { const input = document.querySelector('#sort-select'); input.value = '${value}'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`); }
const ids = () => evaluate(`[...document.querySelectorAll('.provider-card')].map(c => c.dataset.provider)`);
async function key(key, code, modifiers = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code, modifiers }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, modifiers }); }
async function viewport(width, height = 1000) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 }); await pause(150); }
async function screenshot(name) { await pause(700); const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(`.test-artifacts/${name}.png`, Buffer.from(result.data, 'base64')); }

try {
  await mkdir('.test-artifacts', { recursive: true });
  await send('Runtime.enable'); await send('Page.enable');
  await viewport(1440, 1100);
  await send('Page.navigate', { url: 'http://127.0.0.1:5173' });
  await waitFor(`document.querySelectorAll('.provider-card').length === ${PROVIDERS.length}`);
  assert.equal(await evaluate(`document.documentElement.dataset.theme`), 'dark', 'The website starts in the fixed black theme');
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'Desktop has no horizontal overflow');
  await screenshot('desktop');
  assert.deepEqual(await ids(), PROVIDERS.map(provider => provider.id), 'The selected providers remain in curated order');
  assert.equal(await evaluate(`document.querySelector('.directory-note')`), null, 'The removed source note is absent');
  assert.equal(await evaluate(`document.querySelector('.orbit')`), null, 'The old orbit design is absent');
  assert.equal(await evaluate(`document.querySelectorAll('.flight-deck .deck-ticket').length`), 3, 'The new connection deck showcases three providers');
  assert.equal(await evaluate(`document.querySelectorAll('.scroll-progress').length`), 1, 'The new scroll progress indicator exists');
  const cardLinks = await evaluate(`[...document.querySelectorAll('.provider-card')].map(card => ({ id: card.dataset.provider, signup: card.querySelector('[data-get-api]').href, docs: card.querySelector('.docs-button').href }))`);
  assert.deepEqual(cardLinks, PROVIDERS.map(provider => ({ id: provider.id, signup: REFERRAL_LINKS[provider.id], docs: provider.docs })), 'All provider signup and documentation buttons retain their destinations');
  await click('[data-focus-search]');
  assert.equal(await evaluate(`document.activeElement.id`), 'provider-search', 'Header search shortcut focuses the directory search');
  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  assert.ok(await evaluate(`document.querySelectorAll('.provider-card.reveal-pending').length > 0`), 'Offscreen cards wait for scrolling');
  await evaluate(`document.querySelector('[data-provider="buds"]').scrollIntoView({ block: 'center' })`);
  await waitFor(`!document.querySelector('[data-provider="buds"]').classList.contains('reveal-pending')`);
  await pause(600);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-provider="buds"]')).opacity`), '1', 'Scrolled card becomes visible');
  assert.ok(await evaluate(`parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress')) > 0`), 'Scrolling updates the progress indicator');
  await evaluate(`document.querySelector('[data-provider="moyuu"]').scrollIntoView({ block: 'center' }); window.retainedCard = document.querySelector('[data-provider="moyuu"]')`);
  await pause(600);
  await evaluate(`(() => { const card = document.querySelector('[data-provider="moyuu"]'); const r = card.getBoundingClientRect(); card.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: r.left + 50, clientY: r.top + 50 })); })()`);
  await waitFor(`document.querySelector('[data-provider="moyuu"]').classList.contains('cursor-lit')`);
  await sort('name');
  assert.equal(await evaluate(`window.retainedCard === document.querySelector('[data-provider="moyuu"]')`), true, 'Sorting preserves card nodes');
  assert.ok(await evaluate(`document.querySelector('[data-provider="moyuu"]').getAnimations().some(a => a.effect.getKeyframes().some(frame => frame.translate))`), 'Retained cards animate to new positions');
  await sort('curated');
  await fill('buds'); await fill('moyuu'); await fill('');
  await pause(700);
  assert.equal((await ids()).length, PROVIDERS.length, 'Rapid changes leave exactly the current results');
  assert.equal(await evaluate(`document.querySelectorAll('.cursor-lit').length`), 0, 'Removed cards clear cursor glow');
  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await fill('claude-opus-5-5'); assert.deepEqual(await ids(), ['ireze', 'byesu'], 'Model search');
  await fill('no-provider-<img src=x onerror=alert(1)>');
  assert.equal((await ids()).length, 0); assert.equal(await evaluate(`document.querySelectorAll('.active-filters img').length`), 0);
  await click('.empty-state .reset-all'); assert.equal((await ids()).length, PROVIDERS.length);
  await click('#desktop-auth-1'); assert.deepEqual(await ids(), ['aerolink']);
  await click('#desktop-clients-1'); assert.deepEqual(await ids(), ['aerolink']);
  assert.equal(await evaluate(`document.querySelector('[data-count-key="auth"][data-option="API Key"]').textContent`), '5');
  await click('.filter-heading .reset-all');
  await evaluate(`document.querySelector('#tab-all').focus()`); await key('ArrowRight', 39);
  assert.deepEqual(await ids(), ['ireze', 'byesu', 'moyuu', 'artbloom']);
  assert.equal(await evaluate(`document.activeElement.id`), 'tab-new');
  await click('#tab-all'); await sort('name'); assert.equal((await ids())[0], 'aerolink');
  await sort('newest'); assert.equal((await ids())[0], 'artbloom');
  await click('#tab-recommended'); assert.deepEqual(await ids(), ['buds']);
  await click('#tab-all');
  await evaluate(`document.querySelector('[data-details="buds"]').focus()`); await click('[data-details="buds"]');
  assert.equal(await evaluate(`document.querySelector('.details-dialog').open`), true);
  assert.equal(await evaluate(`document.activeElement.classList.contains('close-details')`), true, 'Modal starts focused on close');
  for (let i = 0; i < 8; i++) { await key('Tab', 9); assert.equal(await evaluate(`document.querySelector('.details-dialog').contains(document.activeElement)`), true, 'Native focus trap'); }
  await key('Escape', 27); assert.equal(await evaluate(`document.querySelector('.details-dialog').open`), false);
  assert.equal(await evaluate(`document.activeElement.dataset.details`), 'buds', 'Focus returns to trigger');
  await click('[data-details="buds"]'); await click('.close-details');
  await click('[data-details="buds"]'); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
  assert.equal(await evaluate(`document.querySelector('.details-dialog').open`), false, 'Backdrop closes');
  await click('#tab-all'); await sort('curated'); await click('[data-details="buds"]');
  assert.equal(await evaluate(`document.querySelector('.details-dialog [data-get-api="buds"]').href`), 'https://apichat.budsin.dev/sign-up?aff=IXKX');
  assert.equal(await evaluate(`document.querySelector('.provider-card [data-get-api="buds"]').href`), 'https://apichat.budsin.dev/sign-up?aff=IXKX');
  await screenshot('details'); await click('.close-details');
  await click('.provider-card [data-details="byesu"]');
  assert.equal(await evaluate(`document.querySelector('.details-dialog [data-get-api="byesu"]').href`), 'https://byesu.com/sign-up?aff=gmEx');
  assert.equal(await evaluate(`document.querySelector('.provider-card [data-get-api="byesu"]').href`), 'https://byesu.com/sign-up?aff=gmEx');
  assert.equal(await evaluate(`document.querySelector('[data-provider="byesu"] .docs-button').href`), 'https://docs.byesu.com/en/');
  assert.equal(await evaluate(`document.querySelector('.provider-doc-links').children.length`), 4);
  await screenshot('byesu-details');
  await click('.close-details');
  await click('nav a[href="#guides"]'); await waitFor(`!document.querySelector('#guides-view').hidden`);
  assert.equal(await evaluate(`document.querySelector('.guide-code code').textContent.includes('\\\n')`), true, 'Guide has multiline shell example');
  await click('[data-focus-search]'); await waitFor(`!document.querySelector('#discover-view').hidden`);
  assert.equal(await evaluate(`document.activeElement.id`), 'provider-search', 'Header search opens and focuses the directory from the field guide');
  await click('nav a[href="#guides"]'); await waitFor(`!document.querySelector('#guides-view').hidden`);
  await key('k', 75, 2); await waitFor(`!document.querySelector('#discover-view').hidden`);
  assert.equal(await evaluate(`document.activeElement.id`), 'provider-search', 'Ctrl K opens and focuses the directory from the field guide');
  await click('nav a[href="#discover"]'); await waitFor(`!document.querySelector('#discover-view').hidden`);
  await evaluate(`localStorage.setItem('atlas-theme','light')`);
  await send('Page.reload'); await waitFor(`document.querySelectorAll('.provider-card').length === ${PROVIDERS.length}`);
  assert.equal(await evaluate(`document.documentElement.dataset.theme`), 'dark', 'Previous light theme preferences do not change the fixed black design');
  assert.equal(await evaluate(`getComputedStyle(document.body).backgroundColor`), 'rgb(0, 0, 0)', 'The page uses a black background');
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase()`), '#4b026b', 'The requested purple is the accent color');
  assert.equal(await evaluate(`document.querySelector('.theme-toggle')`), null, 'The fixed palette has no theme switch');
  await screenshot('black-purple');
  for (const width of [1024, 768, 390, 320]) {
    await viewport(width, 900);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `No horizontal overflow at ${width}`);
    if (width === 768) await screenshot('tablet');
    if (width === 390) {
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.filter-dialog')).display`), 'none', 'Closed mobile drawer is hidden');
      await screenshot('mobile'); await click('.mobile-filters');
      assert.equal(await evaluate(`document.querySelector('.filter-dialog').open`), true);
      await click('#mobile-auth-1'); assert.deepEqual(await ids(), ['aerolink']);
      assert.ok(await evaluate(`document.querySelector('.show-providers').textContent.includes('1 provider')`));
      await screenshot('mobile-filters'); await click('.show-providers');
      assert.equal(await evaluate(`document.querySelector('.filter-dialog').open`), false);
      await click('[data-details="aerolink"]');
      assert.equal(await evaluate(`document.querySelector('.details-dialog').getBoundingClientRect().width < innerWidth`), true);
      await screenshot('mobile-details'); await key('Escape', 27); await click('.active-filters .reset-all');
    }
  }
  await viewport(1440, 1100);
  await click('.motion-toggle');
  await pause(500);
  assert.equal(await evaluate(`document.getAnimations().some(a => a.playState === 'running')`), false, 'Pause control stops motion');
  assert.equal(await evaluate(`document.querySelectorAll('.reveal-pending').length`), 0, 'Pausing reveals pending content');
  await click('#tab-new'); assert.deepEqual(await ids(), ['ireze', 'byesu', 'moyuu', 'artbloom'], 'Filters work with motion paused');
  await click('.motion-toggle');
  await click('.browse-providers'); await pause(1000);
  assert.ok(await evaluate(`scrollY > 100 && document.activeElement.id === 'provider-panel'`), 'Explore scrolls and focuses directory');
  await screenshot('directory');
  await click('.ribbon-providers button');
  assert.equal(await evaluate(`document.querySelector('.details-dialog').open`), true, 'Provider shortcut opens details');
  await click('.close-details');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await click('#tab-new'); await pause(500);
  assert.equal(await evaluate(`document.getAnimations().length`), 0, 'Reduced motion stops all animations');
  assert.equal(await evaluate(`document.querySelectorAll('.reveal-pending').length`), 0, 'Reduced motion leaves no hidden content');
  assert.equal((await ids()).length, 4, 'Reduced motion preserves interactions');
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log('Browser checks passed: redesigned hero, removed source note, all provider links, header/keyboard search, scroll reveal and progress, filters, counts, collections, sorts, modal focus/Escape/backdrop, guides, fixed black/purple palette, 1440/1024/768/390/320 layouts, mobile drawer, pause control, and reduced motion.');
  console.log('Screenshots saved in .test-artifacts/.');
} finally { ws.close(); }
