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
// The hero's start button is the only start control while the hero is on screen; the bar's Play takes over afterwards.
const startTour = page => page.locator('#heroStart').click();
const noObservatory = page => page.evaluate(() => ({
  src: document.getElementById('obsFrame').getAttribute('src'),
  spatialSlots: document.querySelectorAll('[data-engine="spatial"]').length,
  poolSpatial: window.__journey.stagePool ? window.__journey.stagePool.stats().engine === 'spatial' : false
}));
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
    // Hero: exactly one primary action, one quiet secondary, no onboarding paragraph or duplicate cue.
    assert.equal(await page.locator('.hero button:visible, .hero a.hero-start:visible').count(), 1, 'the hero has one primary action');
    assert(await page.locator('#heroStart').isVisible(), 'the primary action starts the tour');
    assert.match(await page.locator('#heroStart .hero-start-time').textContent(), /^\d+:\d\d$/, 'start shows the tour length');
    assert.equal(await page.locator('.hero a.hero-scroll').count(), 1, 'one quiet secondary: or scroll to read');
    for (const sel of ['.onboard-guide', '.hero-entry', '.hero .cue', '#trainLineLaunch', '#allTour', '#observatory-sandbox', '[data-ch4-engine]', '[data-ch6-beat]']) {
      assert.equal(await page.locator(sel).count(), 0, sel + ' is removed');
    }
    // No two start controls at once: the bar's Play and Mute stay quiet until the hero button is out of view.
    assert.equal(await page.locator('#tourPlay').isVisible(), false, 'bar Play is quiet while the hero button shows');
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForFunction(() => getComputedStyle(document.getElementById('tourPlay')).visibility === 'visible');
    assert(await page.locator('#tourPlay').isVisible() && await page.locator('#tourMute').isVisible(), 'Play and mute sit in the bar');
    assert.match(await page.locator('#tourPlay .tour-play-time').textContent(), /^\d+:\d\d$/, 'Play shows time left');
    assert.equal(await page.locator('#finaleCapstone').isVisible(), false, 'the 3D capstone is hidden in the reading path');
    assert.deepEqual(await noObservatory(page), {src: null, spatialSlots: 0, poolSpatial: false}, 'no 3D at load');
    const stops = await page.evaluate(() => window.JourneyTour.stops.map(s => s.id));
    assert.equal(stops[0], 'intro');
    assert.deepEqual(stops.slice(1, 6), ['station-1', 'station-2', 'station-3', 'station-4', 'station-5']);
    assert.equal(stops[6], 'step-1');
    assert.equal(stops.at(-1), 'outro');
    assert(stops.includes('release'), 'release gate is a tour stop');
    const silent = await page.evaluate(() => window.JourneyTour.stops.filter(s => !s.clip).map(s => s.id));
    assert.deepEqual(silent, [], 'every stop is narrated, stations and release gate included');
    assert.equal(await page.evaluate(() => document.body.dataset.cardView), 'basic', 'cards default to the basic view');
    assert.equal(await page.locator('#step-2 .card > code.eq').isVisible(), false, 'equation is collapsed by default');
    assert.deepEqual(errors, []);
    console.log('Tour bar: one hero action, removed controls gone, Play + mute take over below the hero, stop list intro -> stations -> chapters -> summary');
  } finally { await page.close(); }
}

async function verifyPlaybackAndTakeover(browser, base) {
  const {page, errors} = await openTour(browser, base);
  try {
    await startTour(page);
    await page.waitForFunction(() => window.JourneyTour.state.status === 'playing');
    assert.equal(await page.locator('#heroStart').isVisible(), false, 'the hero button steps aside once the tour runs');
    assert(await page.locator('#tourPlay').isVisible(), 'the bar Play becomes the transport');
    assert.equal(await page.locator('#tourPlay').getAttribute('data-state'), 'playing');
    // The owner's bug: playback used to stop after station 5. It must roll into chapter 1 by itself.
    await waitId(page, 'step-1');
    const seen = await page.evaluate(() => window.__tourLog.stops.slice());
    assert.deepEqual(seen.slice(0, 7), ['intro', 'station-1', 'station-2', 'station-3', 'station-4', 'station-5', 'step-1']);
    await page.waitForFunction(() => document.getElementById('step-1').getBoundingClientRect().top < innerHeight * 0.9);
    assert((await state(page)).status === 'playing');
    assert.equal(await page.evaluate(() => document.body.classList.contains('tour-spot')), true, 'spotlight while playing');

    // A brush of the wheel, or one notch, does not stop the tour; the camera drifts back onto the stop.
    await waitId(page, 'step-3');
    await page.mouse.move(600, 500);
    for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, 4); await page.waitForTimeout(40); }
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(150);
    assert.equal((await state(page)).status, 'playing', 'small wheel input does not pause the tour');
    // Wheel takeover: a deliberate scroll pauses, shows the distinct chip, never jumps.
    await page.mouse.wheel(0, 700);
    await page.waitForFunction(() => window.JourneyTour.state.status === 'paused' && window.JourneyTour.state.reason === 'user');
    assert(await page.locator('#tourReturn').isVisible(), 'return chip is visible after a wheel scroll');
    assert.match(await page.locator('#tourReturn').textContent(), /^\s*Back to tour · Byte-pair encoding cuts the sentence/);
    assert.equal(await page.locator('#tourDeeper').isVisible(), false, 'Go deeper hides while the viewer is away');
    assert.equal(await page.locator('#tourPlay').getAttribute('data-state'), 'paused');
    assert.equal(await page.evaluate(() => window.JourneyTour.audio?.paused ?? true), true, 'narration paused');
    // Let the browser's own smooth wheel scroll finish, then the page must hold still: the tour does not pull back.
    let away = await page.evaluate(() => scrollY);
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); const y = await page.evaluate(() => scrollY); if (y === away) break; away = y; }
    await page.waitForTimeout(1200);
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
    await startTour(page);
    // Right before the summary: no Observatory iframe has loaded, no Spatial slot is on the page, no 3D engine has rendered.
    await waitId(page, 'step-30', 150000);
    assert.deepEqual(await noObservatory(page), {src: null, spatialSlots: 0, poolSpatial: false}, 'no 3D before the summary');
    assert.equal(page.frames().some(f => f.url().includes('obs-core')), false, 'no Observatory frame before the summary');
    assert.equal(await page.locator('#finaleCapstone').isVisible(), false, 'capstone is hidden before the summary');
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
    // Finale: one capstone appears and opens the 3D studio.
    await page.locator('#finaleCapstone').waitFor({state: 'visible'});
    assert.equal(await page.locator('#exploreModel').textContent(), 'Explore the 3D model');
    await page.locator('#exploreModel').click();
    await page.waitForFunction(() => window.__journey.state.opened, null, {timeout: 60000});
    assert.equal(await page.evaluate(() => document.getElementById('partTitle').textContent), 'All 31 components', 'the studio opens on the full model');
    assert(page.frames().some(f => f.url().includes('obs-core')), 'the Observatory loads at the finale');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__journey.state.opened);
    const passed = await page.evaluate(() => window.__journey.bridges.map(b => [b.id, b.max]));
    assert.deepEqual(passed.filter(([, m]) => m <= 0.5), [], 'the run passed through every bridge: ' + JSON.stringify(passed));
    assert.equal(await page.locator('.other-ways a').count(), 4, 'one Other ways to explore block holds the edition links');
    assert.deepEqual(errors, [], 'no console errors across the full run');
    console.log('Tour: full accelerated run reached the summary,', ids.all.length, 'stops, no 3D before it, capstone opened the studio, no console errors');
  } finally { await page.close(); }
}

async function verifyReducedMotionAndPhone(browser, base) {
  const rm = await openTour(browser, base, {reducedMotion: 'reduce'});
  try {
    const {page} = rm;
    await startTour(page);
    await waitId(page, 'step-2');
    await page.mouse.move(600, 500);
    await page.mouse.wheel(0, 900);
    await page.waitForFunction(() => window.JourneyTour.state.reason === 'user');
    await page.locator('#tourReturn').click();
    assert(await page.evaluate(() => {
      const r = document.getElementById('step-2').getBoundingClientRect();
      return Math.abs((r.top + r.bottom) / 2 - innerHeight * 0.5) < innerHeight * 0.2;
    }), 'reduced motion returns instantly');
    // Reduced motion: the capstone appears instantly, with no transition.
    await page.evaluate(() => window.scrollTo({top: document.getElementById('outro').offsetTop + 200, behavior: 'instant'}));
    await page.waitForFunction(() => document.getElementById('finaleCapstone').dataset.state === 'shown');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('finaleCapstone')).transitionDuration), '0s', 'reveal is instant under reduced motion');
    assert.equal(await page.locator('#finaleCapstone').isVisible(), true);
    assert.deepEqual(rm.errors, []);
  } finally { await rm.page.close(); }
  const phone = await openTour(browser, base, {width: 390, height: 844});
  try {
    const {page} = phone;
    assert(await page.locator('#heroStart').isVisible(), 'hero start is above the fold on a phone');
    assert((await page.locator('#heroStart').boundingBox()).height >= 44, 'hero start is a full-size touch target');
    await startTour(page);
    const box = await page.locator('#tourPlay').boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 390 && box.height >= 36, 'Play fits the phone bar');
    const mute = await page.locator('#tourMute').boundingBox();
    assert(mute && mute.x + mute.width <= 390, 'mute fits the phone bar');
    await waitId(page, 'step-1');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow while touring');
    assert.deepEqual(phone.errors, []);
    console.log('Tour: reduced motion returns instantly; phone bar and spotlight fit');
  } finally { await phone.page.close(); }
}


// Scenes in page order. Every adjacent pair needs a bridge between them; the inference-transition text belongs to the release gate.
const SCENES = ['#intro', '#training-line-band', '#ch1', '#ch2', '#ch3', '#release-gate', '#ch4', '#ch5', '#ch6', '#outro'];
const BRIDGES = ['b0t', 'bt1', 'b12', 'b23', 'b34', 'br4', 'b45', 'b56', 'b67'];
const lum = css => { const m = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
const hexLum = hex => lum('rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',') + ')');
const settle = page => page.waitForFunction(() => { const y = scrollY, now = performance.now(), s = window.__lastY || (window.__lastY = {y, t: now}); if (Math.abs(s.y - y) > 1) { s.y = y; s.t = now; return false; } return now - s.t > 350; }, null, {timeout: 20000, polling: 100});
const clearSettle = page => page.evaluate(() => { window.__lastY = null; });
const ink = page => page.evaluate(() => document.getElementById('thread') && [...document.getElementById('thread').children].reduce((n, c) => n + (+getComputedStyle(c).opacity), 0));

async function verifyTokenAndBridges(browser, base) {
  const {page, errors} = await openTour(browser, base);
  try {
    // The hero word is the token, boxed in an accent capsule; the travelling token waits docked until the reader moves.
    await page.waitForTimeout(600);
    const hero = await page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('a-hero')), w = getComputedStyle(document.querySelector('#a-hero > span'));
      return {border: s.borderStyle, width: parseFloat(s.borderTopWidth), bg: s.backgroundColor, word: w.opacity, vis: w.visibility, thread: getComputedStyle(document.getElementById('thread')).opacity, cls: document.documentElement.className};
    });
    assert.equal(hero.border, 'solid', 'hero capsule is a solid accent outline');
    assert(hero.width >= 2 && hero.bg !== 'rgba(0, 0, 0, 0)', 'capsule has weight and a tint');
    assert(hero.word === '1' && hero.vis === 'visible', 'the word sat is readable inside the capsule');
    assert(Number(hero.thread) < 0.05, 'the travelling token is docked in the capsule at rest');
    assert(/tok-docked/.test(hero.cls));
    await startTour(page);
    await page.waitForFunction(() => document.documentElement.classList.contains('tok-lifted'));
    await page.waitForFunction(() => getComputedStyle(document.getElementById('thread')).opacity === '1');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('a-hero')).borderStyle), 'dashed', 'the capsule is left as an empty socket');
    assert((await ink(page)) > 0.9, 'the token object is drawn once it lifts out');
    await page.evaluate(() => window.JourneyTour.pause());

    // Every adjacent pair of scenes has a bridge between them.
    const order = await page.evaluate(({scenes, bridges}) => {
      const pos = sel => { const el = document.querySelector(sel); return el; };
      const out = [];
      for (let i = 0; i < scenes.length - 1; i++) {
        const a = pos(scenes[i]), b = pos(scenes[i + 1]);
        const between = bridges.filter(id => { const x = document.getElementById(id); return x && x.classList.contains('bridge') && (a.compareDocumentPosition(x) & 4) && (x.compareDocumentPosition(b) & 4); });
        out.push([scenes[i] + ' -> ' + scenes[i + 1], between.length]);
      }
      return out;
    }, {scenes: SCENES, bridges: BRIDGES});
    for (const [pair, n] of order) assert.equal(n, 1, 'one bridge sits between ' + pair);
    assert.equal(await page.locator('.bridge').count(), BRIDGES.length, 'nine bridges in all');

    // Token presence: at every stop the travelling token is drawn inside that scene's stage.
    const stops = await page.evaluate(() => window.JourneyTour.stops.map(s => ({id: s.id, kind: s.kind})));
    const bad = [];
    for (const s of stops) {
      if (s.kind === 'intro' || s.kind === 'outro') continue;
      await clearSettle(page);
      await page.evaluate(id => window.JourneyTour.goTo(id, {play: false}), s.id);
      await settle(page);
      await page.waitForTimeout(250);
      const r = await page.evaluate(kind => {
        const pill = document.querySelector('#thread > div'), q = pill.getBoundingClientRect(), x = (q.left + q.right) / 2, y = (q.top + q.bottom) / 2;
        const op = [...document.getElementById('thread').children].reduce((n, c) => n + (+getComputedStyle(c).opacity), 0);
        const inside = el => { if (!el) return false; const b = el.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; };
        const stage = kind === 'station' ? document.querySelector('#training-line-band .braid-card') : kind === 'release' ? document.querySelector('#release-gate .release-stage') : [...document.querySelectorAll('.chapter .stage')].find(inside);
        return {on: inside(stage), op, onScreen: x > 0 && x < innerWidth && y > 0 && y < innerHeight, docked: getComputedStyle(document.getElementById('thread')).opacity};
      }, s.kind);
      if (!(r.on && r.op > 0.5 && r.onScreen && r.docked === '1')) bad.push(s.id + ' ' + JSON.stringify(r));
    }
    assert.deepEqual(bad, [], 'the token marker rides inside every stage');
    // Training Line: the marker docks just below the drawing's own token block, and the bottom rail steps aside.
    await clearSettle(page);
    await page.evaluate(() => window.JourneyTour.goTo('station-2', {play: false}));
    await settle(page);
    await page.waitForFunction(() => document.querySelector('[data-slot-id="braid-opening"]').dataset.tok === '1', null, {timeout: 10000});
    await page.waitForTimeout(600);
    const dock = await page.evaluate(() => {
      const slot = document.querySelector('[data-slot-id="braid-opening"]'), sr = slot.getBoundingClientRect(), cs = getComputedStyle(slot);
      const bx = sr.left + parseFloat(cs.getPropertyValue('--tok-x')), by = sr.top + parseFloat(cs.getPropertyValue('--tok-y'));
      const q = document.querySelector('.t-pill').getBoundingClientRect();
      return {dx: (q.left + q.right) / 2 - bx, dy: (q.top + q.bottom) / 2 - by, rail: getComputedStyle(document.getElementById('trainRail')).opacity};
    });
    assert(Math.abs(dock.dx) < 12 && dock.dy > 15 && dock.dy < 45, 'the marker sits just below the token block in the drawing ' + JSON.stringify(dock));
    assert.equal(dock.rail, '0', 'the fallback rail hides while the marker is docked');
    console.log('Token: hero capsule lifts into the travelling token; nine bridges, one between every scene; the token sits in every stage across', stops.length - 2, 'stops');

    // Dark skin: the Journey palette wins over theme-tokens, so ink is light while html.on-dark is set.
    await page.evaluate(() => window.JourneyTour.goTo('step-6', {play: false}));
    await page.waitForFunction(() => document.documentElement.classList.contains('on-dark'));
    const dark = await page.evaluate(() => ({ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(), inline: document.documentElement.style.getPropertyValue('--ink'), card: getComputedStyle(document.querySelector('#step-6 .card h3')).color}));
    assert.equal(dark.inline, '', 'no inline --ink left on <html>');
    assert(hexLum(dark.ink) > 0.7, '--ink is light on a dark scene: ' + dark.ink);
    assert(lum(dark.card) > 0.5, 'card heading is light on its dark card: ' + dark.card);
    // Bridge captions read on every skin (mid-blend worst case), and the travelling token (#thread) is drawn in every bridge. #fx only carries the ch2/ch5 particle fields.
    const axePath = require.resolve('axe-core/axe.min.js');
    await page.addScriptTag({path: axePath});
    const capIssues = [];
    for (const id of BRIDGES) {
      await page.evaluate(b => { const el = document.getElementById(b), t = el.getBoundingClientRect().top + scrollY; window.scrollTo({top: t + el.offsetHeight * 0.5 - innerHeight * 0.5, behavior: 'instant'}); }, id);
      await page.waitForTimeout(700);
      const r = await page.evaluate(id => {
        const cap = document.querySelector('#' + id + ' .bridge-cap'), c = getComputedStyle(cap).color, bg = getComputedStyle(document.body).backgroundColor;
        const fx = document.getElementById('fx'), d = fx.getContext('2d').getImageData(0, 0, fx.width, fx.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++;
        const t = document.querySelector('#thread > div').getBoundingClientRect();
        return {c, bg, ink, token: [...document.getElementById('thread').children].reduce((n, e) => n + (+getComputedStyle(e).opacity), 0) > 0.5 && t.right > 0 && t.left < innerWidth && t.bottom > 0 && t.top < innerHeight};
      }, id);
      const L = a => lum(a), ratio = (Math.max(L(r.c), L(r.bg)) + 0.05) / (Math.min(L(r.c), L(r.bg)) + 0.05);
      if (ratio < 3) capIssues.push(id + ' caption contrast ' + ratio.toFixed(2)); // captions are large text: AA is 3:1
      if (!r.token) capIssues.push(id + ' token is not drawn');
    }
    assert.deepEqual(capIssues, [], 'bridge captions pass AA and the token is drawn in every bridge');
    await page.evaluate(() => window.JourneyTour.goTo('step-6', {play: false}));
    await settle(page);
    const axe = await page.evaluate(async () => (await axe.run(document.getElementById('ch2'), {runOnly: ['color-contrast']})).violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0, 4).join(' | ')));
    assert.deepEqual(axe, [], 'axe color-contrast on a dark chapter');
    assert.deepEqual(errors, []);
    console.log('Dark skin: --ink is light on dark scenes, captions pass AA on all nine bridges, axe color-contrast clean on ch2');
  } finally { await page.close(); }
}

async function verifyConveyor(browser, base) {
  const {page, errors} = await openTour(browser, base);
  try {
    const read = () => page.evaluate(() => { const g = document.getElementById('wordConveyor'); return {shift: +g.dataset.shift, n: +g.dataset.tokens, dash: g.querySelector('line').getAttribute('stroke-dashoffset')}; });
    await page.evaluate(() => window.JourneyTour.goTo('step-22', {play: false}));
    await page.waitForTimeout(800);
    const gate = await read();
    await clearSettle(page); await page.evaluate(() => window.JourneyTour.goTo('step-25', {play: false})); await settle(page); await page.waitForTimeout(500);
    const decode = await read();
    await clearSettle(page); await page.evaluate(() => window.JourneyTour.goTo('step-26', {play: false})); await settle(page); await page.waitForTimeout(500);
    const stream = await read();
    assert(gate.n < 0.5 && decode.n >= 3.5 && decode.n < 4.5, 'the belt is empty at the gate and carries the sentence at decode: ' + JSON.stringify([gate, decode]));
    assert(stream.n > decode.n + 1.5 && stream.shift > decode.shift + 40, 'the conveyor advances between the two decode stops: ' + JSON.stringify([decode, stream]));
    const tile = await page.evaluate(() => [...document.querySelectorAll('#wordConveyor g[clip-path] > g')].map(g => g.textContent.trim()));
    assert.deepEqual(tile.filter(Boolean).map(s => s.replace('␣', '')), ['The', 'cat', 'on', 'the', 'mat'], 'sentence words ride the belt; sat is the token itself');
    assert.deepEqual(errors, []);
    console.log('Conveyor: belt empty at the gate, sentence rolls on at decode (' + decode.n + ' tokens), advances to ' + stream.n + ' at sample/stream');
  } finally { await page.close(); }
  const rm = await openTour(browser, base, {reducedMotion: 'reduce'});
  try {
    const {page} = rm;
    await page.evaluate(() => window.JourneyTour.goTo('step-26', {play: false}));
    await page.waitForTimeout(600);
    const a = await page.evaluate(() => document.querySelector('#wordConveyor line').getAttribute('stroke-dashoffset'));
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => document.querySelector('#wordConveyor line').getAttribute('stroke-dashoffset'));
    assert.equal(a, b, 'the conveyor holds still under reduced motion');
    assert.deepEqual(rm.errors, []);
  } finally { await rm.page.close(); }
}

// At normal speed the tour scrolls through a bridge in about two seconds, silently, then the next stop's clip starts.
async function verifyBridgeFlight(browser, base) {
  const slow = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errs = [];
  slow.on('pageerror', e => errs.push(e.message)); slow.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await slow.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType: 'text/css', body: ''}));
    await slow.goto(base + '?tourRate=1&mute=1', {waitUntil: 'load'});
    await slow.waitForFunction(() => window.__ready && window.JourneyTour && window.__stageLock, null, {timeout: 60000});
    await slow.evaluate(() => window.JourneyTour.goTo('step-4', {play: false}));
    await settle(slow);
    await slow.evaluate(() => window.JourneyTour.play());
    await slow.waitForFunction(() => window.JourneyTour.state.status === 'playing' && window.JourneyTour.state.t > 0.2, null, {timeout: 20000});
    const flight = await slow.evaluate(() => new Promise(resolve => {
      const log = [], t0 = performance.now(), b = () => window.__journey.bridges.find(x => x.id === 'b12');
      window.JourneyTour.next();
      // Stamp each sample with its frame time, not callback time: under load a callback can run late, and the next one early,
      // which made an even, time-based flight read as a jump.
      const tick = ts => { const now = (ts ?? performance.now()) - t0; log.push([now, scrollY, b().t, window.JourneyTour.state.t]); if (now > 4500) return resolve(log); requestAnimationFrame(tick); };
      tick();
    }));
    const moved = flight.filter(r => Math.abs(r[1] - flight[0][1]) > 2), end = flight.findLast(r => Math.abs(r[1] - flight.at(-1)[1]) > 2) || flight[0];
    const dur = (end[0] - moved[0][0]) / 1000, maxT = Math.max(...flight.map(r => r[2]));
    assert(dur >= 1.5 && dur <= 3, 'bridge flight lasts ' + dur.toFixed(2) + ' s');
    assert(maxT > 0.5, 'bridge progress reached ' + maxT.toFixed(2));
    const heldAt = flight.filter(r => r[0] < dur * 1000 - 200).every(r => r[3] === 0);
    assert(heldAt, 'the next stop\'s clock holds silently during the flight');
    const speeds = []; for (let i = 1; i < flight.length; i++) if (flight[i][0] - flight[i - 1][0] > 0) speeds.push(Math.abs(flight[i][1] - flight[i - 1][1]) / (flight[i][0] - flight[i - 1][0]) * 1000);
    assert(Math.max(...speeds) < 3200, 'eased flight, not a jump (peak ' + Math.round(Math.max(...speeds)) + ' px/s)');
    await slow.waitForFunction(() => window.JourneyTour.state.id === 'step-5');
    // Takeover mid-flight pauses and Back to tour resumes at the stop.
    await slow.evaluate(() => window.JourneyTour.goTo('step-8', {play: true}));
    await slow.waitForTimeout(1800);
    await slow.evaluate(() => window.JourneyTour.next());
    await slow.waitForTimeout(500);
    await slow.mouse.move(600, 500); await slow.mouse.wheel(0, 300);
    await slow.waitForFunction(() => window.JourneyTour.state.status === 'paused' && window.JourneyTour.state.reason === 'user');
    await slow.waitForTimeout(300);
    const y0 = await slow.evaluate(() => scrollY); await slow.waitForTimeout(500);
    assert(Math.abs(await slow.evaluate(() => scrollY) - y0) < 4, 'the flight stops when the viewer takes over');
    assert(await slow.locator('#tourReturn').isVisible(), 'Back to tour is offered');
    await slow.locator('#tourReturn').click();
    await slow.waitForFunction(() => window.JourneyTour.state.status === 'playing');
    await slow.waitForFunction(() => { const r = document.getElementById('step-9').getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight * 0.5) < innerHeight * 0.2; }, null, {timeout: 15000});
    assert.deepEqual(errs, []);
    console.log('Tour: a bridge flight takes ' + dur.toFixed(1) + ' s at normal speed, silent, eased; wheel takeover stops it and Back to tour resumes');
  } finally { await slow.close(); }
  const rm = await openTour(browser, base, {reducedMotion: 'reduce'});
  try {
    const {page} = rm;
    await page.evaluate(() => window.JourneyTour.goTo('step-4', {play: true}));
    await page.evaluate(() => window.JourneyTour.next());
    await page.waitForFunction(() => { const r = document.getElementById('step-5').getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight * 0.5) < innerHeight * 0.2; }, null, {timeout: 1500});
    assert.equal(await page.evaluate(() => window.JourneyTour.state.id), 'step-5');
    assert.deepEqual(rm.errors, []);
    console.log('Tour: reduced motion cuts straight through the bridge');
  } finally { await rm.page.close(); }
}

async function verifyTour(browser, base) {
  await verifyBarAndApi(browser, base);
  await verifyTokenAndBridges(browser, base);
  await verifyConveyor(browser, base);
  await verifyBridgeFlight(browser, base);
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
