'use strict';
// Browser checks for the narrated Journey tour. Runs inside verify-browser.cjs, or on its own:
//   node tools/tour-browser.cjs
// ?tourRate=N speeds clips and silent holds up N times so a full run to the summary takes under a minute.
const assert = require('node:assert/strict');

const RATE = 12;
const REMOVED_CONTROLS = ['#storyDepthBtn', '#storyPresentBtn', '#narrRun', '#topStudioBtn', '#trainLinePlay', '#trainLineNarrate'];

async function openTour(browser, base, {width = 1440, height = 900, reducedMotion = 'no-preference', query = ''} = {}) {
  const page = await browser.newPage({viewport: {width, height}, reducedMotion});
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType: 'text/css', body: ''}));
  await page.goto(base + '?tourRate=' + RATE + query, {waitUntil: 'load'});
  await page.waitForFunction(() => window.__ready && window.JourneyTour && window.__stageLock, null, {timeout: 60000});
  await page.evaluate(() => {
    window.__tourLog = {stops: [], finale: 0};
    document.addEventListener('tour:stop', e => window.__tourLog.stops.push(e.detail.id));
    document.addEventListener('tour:finale', () => { window.__tourLog.finale++; });
  });
  return {page, errors};
}

const state = page => page.evaluate(() => window.JourneyTour.state);
const waitId = (page, id, timeout = 60000) => page.waitForFunction(i => window.JourneyTour.state.id === i, id, {timeout});
const cardCentered = (page, stepId) => page.evaluate(id => {
  const r = document.getElementById(id).getBoundingClientRect();
  return Math.abs((r.top + r.bottom) / 2 - innerHeight * 0.5) < innerHeight * 0.2;
}, stepId);

async function verifyBarAndApi(browser, base) {
  const {page, errors} = await openTour(browser, base);
  try {
    for (const sel of REMOVED_CONTROLS) assert.equal(await page.locator(sel).count(), 0, sel + ' is removed');
    assert.equal(await page.locator('.studio-bar .suite-menu, .studio-bar [data-suite-menu]').count(), 0, 'Views dropdown is not mounted in the bar');
    assert(await page.locator('#tourPlay').isVisible() && await page.locator('#tourMute').isVisible(), 'Play and mute sit in the bar');
    assert.match(await page.locator('#tourPlay .tour-play-time').textContent(), /^\d+:\d\d$/, 'Play shows time left');
    const stops = await page.evaluate(() => window.JourneyTour.stops.map(s => s.id));
    assert.equal(stops[0], 'intro');
    assert.deepEqual(stops.slice(1, 6), ['station-1', 'station-2', 'station-3', 'station-4', 'station-5']);
    assert.equal(stops[6], 'step-1');
    assert.equal(stops.at(-1), 'outro');
    assert(stops.includes('release'), 'release gate is a tour stop');
    assert.equal(await page.evaluate(() => document.body.dataset.cardView), 'basic', 'cards default to the basic view');
    assert.equal(await page.locator('#step-2 .card > code.eq').isVisible(), false, 'equation is collapsed by default');
    assert.deepEqual(errors, []);
    console.log('Tour bar: removed controls gone, Play + mute present, stop list intro -> stations -> chapters -> summary');
  } finally { await page.close(); }
}

async function verifyPlaybackAndTakeover(browser, base) {
  const {page, errors} = await openTour(browser, base);
  try {
    await page.locator('#tourPlay').click();
    await page.waitForFunction(() => window.JourneyTour.state.status === 'playing');
    assert.equal(await page.locator('#tourPlay').getAttribute('data-state'), 'playing');
    // The owner's bug: playback used to stop after station 5. It must roll into chapter 1 by itself.
    await waitId(page, 'step-1');
    const seen = await page.evaluate(() => window.__tourLog.stops.slice());
    assert.deepEqual(seen.slice(0, 7), ['intro', 'station-1', 'station-2', 'station-3', 'station-4', 'station-5', 'step-1']);
    await page.waitForFunction(() => document.getElementById('step-1').getBoundingClientRect().top < innerHeight * 0.9);
    assert((await state(page)).status === 'playing');
    assert.equal(await page.evaluate(() => document.body.classList.contains('tour-spot')), true, 'spotlight while playing');

    // Wheel takeover: pauses, shows the distinct chip, never jumps.
    await waitId(page, 'step-3');
    await page.mouse.move(600, 500);
    await page.mouse.wheel(0, 700);
    await page.waitForFunction(() => window.JourneyTour.state.status === 'paused' && window.JourneyTour.state.reason === 'user');
    assert(await page.locator('#tourReturn').isVisible(), 'return chip is visible after a wheel scroll');
    assert.match(await page.locator('#tourReturn').textContent(), /^\s*Back to tour · Byte-pair encoding cuts the sentence/);
    assert.equal(await page.locator('#tourDeeper').isVisible(), false, 'Go deeper hides while the viewer is away');
    assert.equal(await page.locator('#tourPlay').getAttribute('data-state'), 'paused');
    assert.equal(await page.evaluate(() => window.JourneyTour.audio?.paused ?? true), true, 'narration paused');
    const away = await page.evaluate(() => scrollY);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => scrollY), away, 'tour does not fight the viewer');
    const idAway = (await state(page)).id;
    await page.locator('#tourReturn').click();
    await page.waitForFunction(() => window.JourneyTour.state.status === 'playing');
    await page.waitForFunction(() => { const r = document.getElementById('step-3').getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight * 0.5) < innerHeight * 0.2; }, null, {timeout: 8000});
    assert.equal((await state(page)).id, idAway, 'returns to the narrated stop');
    assert.equal(await page.locator('#tourReturn').isVisible(), false, 'chip clears on return');
    await page.waitForFunction(id => window.JourneyTour.state.id !== id, idAway, {timeout: 30000});
    console.log('Tour: Play rolls past station 5 into chapter 1; wheel pauses with a return chip; chip returns and resumes');

    // Mute keeps the tour moving on clip timing, captions visible.
    await page.locator('#tourMute').click();
    assert.equal(await page.locator('#tourMute').getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => window.JourneyTour.state.kind === 'stop');
    const before = (await state(page)).index;
    assert.equal(await page.evaluate(() => { const a = window.JourneyTour.audio; return a ? a.muted : true; }), true, 'audio is muted');
    await page.waitForFunction(i => window.JourneyTour.state.index > i, before, {timeout: 30000});
    assert.equal(await page.locator('#narrCap').isVisible(), true, 'captions stay visible while muted');
    assert.equal((await state(page)).muted, true);
    await page.locator('#tourMute').click();
    assert.equal(await page.evaluate(() => { const a = window.JourneyTour.audio; return a ? a.muted : false; }), false, 'unmute restores audio');

    // Go deeper: pauses and opens the stop's equations/specs; looks different from a plain pause.
    await page.evaluate(() => window.JourneyTour.goTo('step-4', {play: false}));
    await waitId(page, 'step-4');
    await page.locator('#tourDeeper').waitFor({state: 'visible'});
    await page.locator('#tourDeeper').click();
    await page.waitForFunction(() => window.JourneyTour.state.status === 'paused' && window.JourneyTour.state.reason === 'deeper');
    assert.equal(await page.locator('#step-4 .card-deep-toggle').getAttribute('aria-expanded'), 'true', 'deep content opened');
    assert(await page.locator('#step-4 .card > code.eq').isVisible(), 'equation visible after Go deeper');
    assert(await page.locator('#tourReturn').isVisible(), 'chip offers the way back after Go deeper');
    const looks = await page.evaluate(() => {
      const css = id => { const s = getComputedStyle(document.getElementById(id)); return s.backgroundColor + '|' + s.borderStyle; };
      return {deeper: css('tourDeeper'), ret: css('tourReturn'), play: css('tourPlay')};
    });
    assert.notEqual(looks.deeper, looks.ret, 'Go deeper and Back to tour look different');
    await page.locator('#tourReturn').click();
    await page.waitForFunction(() => window.JourneyTour.state.status === 'playing');
    assert.equal((await state(page)).index >= 9, true, 'resumed at the deepened stop');

    // Arrow keys step between stops without leaving tour control.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.JourneyTour.state.status === 'paused');
    const i0 = (await state(page)).index;
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(i => window.JourneyTour.state.index === i + 1, i0);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(i => window.JourneyTour.state.index === i, i0);
    assert.deepEqual(errors, []);
    console.log('Tour: mute keeps advancing with captions; Go deeper opens specs; arrow keys step');
  } finally { await page.close(); }
}

async function verifyFullRun(browser, base) {
  const {page, errors} = await openTour(browser, base);
  try {
    await page.locator('#tourPlay').click();
    await page.waitForFunction(() => window.__tourLog.finale === 1, null, {timeout: 150000});
    const ids = await page.evaluate(() => ({seen: window.__tourLog.stops.slice(), all: window.JourneyTour.stops.map(s => s.id)}));
    assert.deepEqual(ids.seen, ids.all, 'every stop ran once, in order');
    const end = await page.evaluate(() => {
      const g = document.querySelector('.outro-grid').getBoundingClientRect();
      return {status: window.JourneyTour.state.status, top: g.top, h: innerHeight};
    });
    assert.equal(end.status, 'finished');
    assert(end.top < end.h * 0.5, 'finale rests on the summary');
    assert.equal(await page.locator('#tourPlay .tour-play-lbl').textContent(), 'Replay');
    assert.deepEqual(errors, [], 'no console errors across the full run');
    console.log('Tour: full accelerated run reached the summary,', ids.all.length, 'stops, tour:finale fired, no console errors');
  } finally { await page.close(); }
}

async function verifyReducedMotionAndPhone(browser, base) {
  const rm = await openTour(browser, base, {reducedMotion: 'reduce'});
  try {
    const {page} = rm;
    await page.locator('#tourPlay').click();
    await waitId(page, 'step-2');
    await page.mouse.move(600, 500);
    await page.mouse.wheel(0, 900);
    await page.waitForFunction(() => window.JourneyTour.state.reason === 'user');
    await page.locator('#tourReturn').click();
    assert(await page.evaluate(() => {
      const r = document.getElementById('step-2').getBoundingClientRect();
      return Math.abs((r.top + r.bottom) / 2 - innerHeight * 0.5) < innerHeight * 0.2;
    }), 'reduced motion returns instantly');
    assert.deepEqual(rm.errors, []);
  } finally { await rm.page.close(); }
  const phone = await openTour(browser, base, {width: 390, height: 844});
  try {
    const {page} = phone;
    const box = await page.locator('#tourPlay').boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 390 && box.height >= 36, 'Play fits the phone bar');
    const mute = await page.locator('#tourMute').boundingBox();
    assert(mute && mute.x + mute.width <= 390, 'mute fits the phone bar');
    await page.locator('#tourPlay').click();
    await waitId(page, 'step-1');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow while touring');
    assert.deepEqual(phone.errors, []);
    console.log('Tour: reduced motion returns instantly; phone bar and spotlight fit');
  } finally { await phone.page.close(); }
}

async function verifyTour(browser, base) {
  await verifyBarAndApi(browser, base);
  await verifyPlaybackAndTakeover(browser, base);
  await verifyFullRun(browser, base);
  await verifyReducedMotionAndPhone(browser, base);
}

module.exports = {verifyTour};

if (require.main === module) {
  const {chromium} = require('playwright');
  const {createApp} = require('../server');
  (async () => {
    const server = await new Promise(resolve => { const s = createApp().listen(0, '127.0.0.1', () => resolve(s)); });
    const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
    try { await verifyTour(browser, 'http://127.0.0.1:' + server.address().port + '/'); }
    finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  })().catch(err => { console.error(err); process.exitCode = 1; });
}
