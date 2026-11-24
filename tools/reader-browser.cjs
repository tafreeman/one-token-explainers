'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {stops, tracks} = require('../one-token/stops-manifest.js');

const axePath = require.resolve('axe-core/axe.min.js');
const fileReader = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const desktop = {width: 1440, height: 900};
const phone = {width: 390, height: 844};
const timeout = 30000;
const stat = page => page.evaluate(() => window.OneToken.scene.stats());
const settle = (page, milliseconds = 450) => page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), milliseconds);
const step = (page, id) => page.waitForFunction(id => document.body.dataset.step === id, id, {timeout});
const mode = (page, value) => page.waitForFunction(value => document.body.dataset.mode === value, value, {timeout});
const ready = page => page.waitForFunction(() => document.querySelector('#viewport').dataset.render === 'ready'
  && window.OneToken?.scene.stats().revision === '160', null, {timeout});

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function trackAnimationFrames(page) {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.__readerAnimationFrames = 0;
    window.requestAnimationFrame = callback => request(time => {
      window.__readerAnimationFrames++;
      callback(time);
    });
  });
}

async function idle(page, label) {
  await settle(page);
  const before = await page.evaluate(() => [
    window.OneToken.scene.stats().frames, window.__readerAnimationFrames
  ]);
  await settle(page);
  assert.deepEqual(await page.evaluate(() => [
    window.OneToken.scene.stats().frames, window.__readerAnimationFrames
  ]), before, label + ' must settle with zero scene draws and zero animation-frame callbacks');
}

async function gotoStep(page, id) {
  // Hash anchors are also the native route when scripting is unavailable.
  await page.evaluate(id => { location.hash = 'step-' + id; }, id);
  await step(page, id);
}

async function capture(page, artifacts, name) {
  await settle(page, 320);
  await page.screenshot({path: path.join(artifacts, 'Reader-' + name + '.png'), animations: 'disabled'});
}

async function clickVisible(page, selector) {
  // Stick to the hit point a visitor sees. Playwright's normal auto-scroll
  // can scroll the document when it centers a sticky toolbar button.
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, selector + ' is visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function axe(page, label) {
  await page.addScriptTag({path: axePath});
  const issues = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}
  })).violations.map(({id, nodes}) => ({id, targets: nodes.map(node => node.target)})));
  assert.deepEqual(issues, [], label + ' axe WCAG 2.1 AA');
}

async function checkLayout(page, label) {
  const layout = await page.evaluate(() => {
    const bounds = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    const pin = bounds('#pin');
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mast: bounds('.mast'),
      head: bounds('.figure-head'),
      figure: bounds('#figure'),
      viewport: bounds('#viewport'),
      canvas: bounds('#scene'),
      rail: bounds('.rail'),
      height: innerHeight,
      mode: document.body.dataset.mode,
      mastControls: Array.from(document.querySelectorAll('.mast button, .mast nav a'), element => element.getBoundingClientRect().toJSON()),
      pin: pin.width && pin.height ? pin : null
    };
  });
  assert.ok(layout.documentWidth <= layout.width + 1, label + ' horizontal overflow');
  assert.ok(layout.canvas.width > 100 && layout.canvas.height > 0, label + ' figure collapsed');
  assert.ok(layout.head.bottom <= layout.canvas.top + 1, label + ' canvas overlaps specimen header');
  assert.ok(layout.mast.right <= layout.width + 1 && layout.rail.right <= layout.width + 1, label + ' clipped controls');
  assert.ok(layout.mastControls.every(control => control.right <= layout.width + 1), label + ' clipped masthead control');
  if (layout.width < 768) {
    assert.ok(layout.mastControls.every(control => control.width >= 44 && control.height >= 44), label + ' masthead touch targets');
    if (layout.mode === 'read') {
      const figureShare = layout.figure.height / layout.height;
      assert.ok(figureShare >= .34 && figureShare <= .38, label + ' portrait figure height');
    }
  }
  if (layout.pin) {
    assert.ok(layout.pin.left >= layout.viewport.left - 1 && layout.pin.right <= layout.viewport.right + 1
      && layout.pin.top >= layout.viewport.top - 1 && layout.pin.bottom <= layout.viewport.bottom + 1, label + ' pin outside figure');
  }
}

async function switchView(page, view) {
  const button = page.locator('button[data-view="' + view + '"]');
  if ((await button.getAttribute('aria-pressed')) !== 'true') {
    const before = (await stat(page)).frames;
    await clickVisible(page, 'button[data-view="' + view + '"]');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(frames => window.OneToken.scene.stats().frames > frames, before, {timeout});
  }
  await ready(page);
}

async function layouts(browser, url, artifacts) {
  for (const viewport of [desktop, {width: 1024, height: 768}, phone, {width: 844, height: 390}]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const label = viewport.width + 'x' + viewport.height + '-' + reducedMotion;
      const page = await browser.newPage({viewport, reducedMotion, hasTouch: viewport === phone});
      const errors = collectErrors(page);
      try {
        await page.goto(url);
        await ready(page);
        await page.evaluate(() => document.fonts.ready);
        await checkLayout(page, label + ' opening');
        await capture(page, artifacts, label + '-opening');
        await gotoStep(page, '7.2');
        await checkLayout(page, label + ' attention');
        if (viewport === phone) {
          assert.ok((await page.locator('#mobile-pin').textContent()).trim().length > 0, label + ' mobile pin populated');
        }
        await capture(page, artifacts, label + '-attention');
        await axe(page, label + ' Read');
        await switchView(page, 'spatial');
        await clickVisible(page, '#present');
        await mode(page, 'present');
        await step(page, '7.2');
        if (viewport === phone) {
          assert.ok(await page.locator('#step-name').isVisible(), label + ' mobile Present step-name visible');
        }
        await capture(page, artifacts, label + '-present');
        await checkLayout(page, label + ' Present');
        await axe(page, label + ' Present');
        assert.deepEqual(errors, [], label + ' console and page errors');
        console.log('Reader', label, 'Read and Present layout, screenshots, and axe passed');
      } finally {
        await page.close();
      }
    }
  }
}

async function navigation(browser, url, artifacts) {
  const page = await browser.newPage({viewport: desktop});
  const errors = collectErrors(page);
  try {
    await trackAnimationFrames(page);
    await page.goto(url);
    await ready(page);
    await clickVisible(page, '#next');
    await step(page, '1.1');
    await page.locator('#follow').click();
    await step(page, '1.1');
    for (const id of ['1.3', '3.3', '6.4', '7.2', '10.4', '12.2']) {
      await gotoStep(page, id);
      const scroll = await page.evaluate(() => scrollY);
      for (const view of ['spatial', 'diagram']) {
        await switchView(page, view);
        await step(page, id);
        assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) <= 2, id + ' view switch moved the lesson');
      }
    }

    await gotoStep(page, '7.2');
    assert.ok(await page.locator('#step-7\\.2[data-active]').count(), 'active step should carry data-active');
    await page.locator('input[name="kvMode7"][value="dense"]').check();
    assert.match(await page.locator('#step-7\\.2 output[data-out="kv"]').textContent(), /Illustrative dense attention/);
    await page.locator('input[name="kvMode7"][value="sparse"]').check();
    const y = await page.evaluate(() => scrollY);
    await page.mouse.move(200, 440);
    await page.mouse.wheel(0, 220);
    await page.waitForFunction(y => scrollY > y + 150, y);
    await capture(page, artifacts, 'scroll-forward');
    assert.ok(await page.evaluate(() => Number(document.querySelector('#scrubber').value)) >= stops.findIndex(s => s.id === '7.2'));
    await page.mouse.wheel(0, -220);
    await page.waitForFunction(y => Math.abs(scrollY - y) < 4, y);
    await step(page, '7.2');
    await capture(page, artifacts, 'scroll-reversed');

    await clickVisible(page, '#next');
    await step(page, '7.3');
    await clickVisible(page, '#previous');
    await step(page, '7.2');
    await page.locator('#scrubber').press('End');
    await step(page, '12.4');
    await page.locator('#scrubber').press('ArrowLeft');
    await step(page, '12.3');
    await page.locator('#scrubber').press('Home');
    await step(page, '1.1');

    await clickVisible(page, '#explain');
    await page.locator('#explanation').waitFor({state: 'visible'});
    assert.ok((await page.locator('#explanation-copy').textContent()).trim().length > 0, 'Read explanation prose');
    await clickVisible(page, '#close-explanation');
    await page.locator('#explanation').waitFor({state: 'hidden'});

    await clickVisible(page, '#present');
    await mode(page, 'present');
    const openExplanation = await rectOf(page, '#open-explanation');
    assert.ok(openExplanation.width > 100 && openExplanation.height >= 44, 'Present explanation action is obvious');
    await clickVisible(page, '#open-explanation');
    await page.locator('#explanation').waitFor({state: 'visible'});
    assert.ok((await page.locator('#explanation-copy').textContent()).trim().length > 0, 'Present explanation prose');
    await clickVisible(page, '#close-explanation');
    await page.locator('#explanation').waitFor({state: 'hidden'});
    await clickVisible(page, '#studio-play');
    await page.waitForFunction(() => document.body.dataset.step !== '1.1');
    await page.keyboard.press('Escape');
    await mode(page, 'read');

    await page.locator('#runStory').click();
    await page.waitForFunction(() => document.querySelector('#runStory').getAttribute('aria-pressed') === 'true');
    await capture(page, artifacts, 'recap');
    await checkLayout(page, 'Recap');
    await page.locator('#runStory').click();
    await idle(page, 'reader after recap');
    assert.deepEqual(errors, []);
    console.log('Reader toggles, scroll reversal, timeline, keyboard, Studio, recap, and idle checks passed');
  } finally {
    await page.close();
  }
}

const rectOf = (page, selector) => page.locator(selector).evaluate(node => node.getBoundingClientRect().toJSON());
const intersects = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
const sameRect = (a, b) => ['left', 'top', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) <= 1);
const isFocused = (page, selector) => page.locator(selector).evaluate(node => node === document.activeElement);

// Phones: the explanation and the inspector live in free space; the 3D frame never moves or is covered.
async function phonePopups(browser, url) {
  const phones = [
    {label: 'portrait', viewport: {width: 390, height: 844}},
    {label: 'landscape', viewport: {width: 844, height: 390}},
    {label: '360', viewport: {width: 360, height: 640}}
  ];
  for (const {label, viewport} of phones) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const name = 'phone-' + label + '-' + reducedMotion;
      const page = await browser.newPage({viewport, reducedMotion, hasTouch: true});
      const errors = collectErrors(page);
      try {
        await page.goto(url);
        await ready(page);
        await gotoStep(page, '7.2');
        await switchView(page, 'spatial');
        await clickVisible(page, '#present');
        await mode(page, 'present');
        await step(page, '7.2');
        const frame = await rectOf(page, '#viewport');

        const explain = await rectOf(page, '#explain');
        assert.ok(explain.height >= 44 && explain.width >= 44, name + ' Explain touch target');
        await clickVisible(page, '#explain');
        await page.locator('#explanation').waitFor({state: 'visible'});
        await settle(page, 300);
        const popup = await rectOf(page, '#explanation');
        assert.ok(!intersects(popup, frame), name + ' explanation must not overlap the 3D frame');
        assert.ok(popup.height > 60 && popup.left >= 0 && popup.right <= viewport.width + 1 && popup.bottom <= viewport.height, name + ' explanation inside the screen');
        assert.ok(sameRect(frame, await rectOf(page, '#viewport')), name + ' opening the explanation must not move or resize the 3D frame');
        const close = await rectOf(page, '#close-explanation');
        assert.ok(close.height >= 44 && close.width >= 44, name + ' close touch target');
        assert.ok(await isFocused(page, '#close-explanation'), name + ' focus moves into the explanation');

        // Narration position, popup copy and 3D stop move together, forward and backward.
        const shown = async () => ({step: await page.locator('body').getAttribute('data-step'),
          title: await page.locator('#explanation-title').textContent(), value: await page.locator('#scrubber').inputValue()});
        const at72 = await shown();
        assert.match(at72.title, /^7\.2\b/);
        await clickVisible(page, '#next');
        await step(page, '7.3');
        const at73 = await shown();
        assert.match(at73.title, /^7\.3\b/);
        assert.equal(Number(at73.value), Number(at72.value) + 1, name + ' scrubber follows Next');
        await clickVisible(page, '#previous');
        await step(page, '7.2');
        assert.deepEqual(await shown(), at72, name + ' going back reconstructs the same state');
        assert.ok(sameRect(frame, await rectOf(page, '#viewport')), name + ' stepping must not move the 3D frame');
        assert.ok(await page.locator('#explanation').isVisible(), name + ' explanation stays open while stepping');

        await page.keyboard.press('Escape');
        await page.locator('#explanation').waitFor({state: 'hidden'});
        assert.ok(await isFocused(page, '#explain'), name + ' focus returns to Explain');
        assert.equal(await page.locator('body').getAttribute('data-mode'), 'present', name + ' Escape closes only the explanation');

        // The inspector (Try it) takes the same free space.
        await clickVisible(page, '#explain');
        await page.locator('#explanation').waitFor({state: 'visible'});
        await page.locator('#explanation [data-inspect]').click();
        const drawer = page.locator('#inspector');
        await drawer.waitFor({state: 'visible'});
        await settle(page, 350);
        assert.ok(sameRect(frame, await rectOf(page, '#viewport')), name + ' opening the inspector must not move the 3D frame');
        const sheet = await rectOf(page, '#inspector');
        assert.ok(!intersects(sheet, frame), name + ' inspector must not overlap the 3D frame');
        assert.ok(sheet.width > 200 && sheet.height > 100, name + ' inspector has room');
        assert.ok((await rectOf(page, '#inspector .inspect-back')).height >= 44, name + ' inspector back touch target');
        await page.keyboard.press('Escape');
        await drawer.waitFor({state: 'hidden'});
        assert.ok(sameRect(frame, await rectOf(page, '#viewport')), name + ' closing the inspector must not move the 3D frame');
        await page.keyboard.press('Escape');
        await page.locator('#explanation').waitFor({state: 'hidden'});

        // Read mode: the inspector sheet also leaves the sticky figure alone.
        await clickVisible(page, '#present');
        await mode(page, 'read');
        await step(page, '7.2');
        const readFrame = await rectOf(page, '#viewport');
        await page.evaluate(() => { location.hash = 'concept=csa-hca-kv'; });
        await drawer.waitFor({state: 'visible'});
        await settle(page, 350);
        assert.ok(sameRect(readFrame, await rectOf(page, '#viewport')), name + ' Read inspector must not move the 3D frame');
        assert.ok(!intersects(await rectOf(page, '#inspector'), readFrame), name + ' Read inspector must not overlap the 3D frame');
        await page.keyboard.press('Escape');
        await drawer.waitFor({state: 'hidden'});
        assert.deepEqual(errors, [], name + ' console and page errors');
      } finally {
        await page.close();
      }
    }
  }
  console.log('Reader phone explanation and inspector stay clear of the 3D frame (portrait, landscape, 360px)');
}

async function narration(browser, url) {
  const page = await browser.newPage({viewport: desktop, reducedMotion: 'reduce'});
  try {
    await page.goto(url);
    await ready(page);
    await gotoStep(page, '7.2');
    await clickVisible(page, '#narrate');
    await page.locator('#muted').check();
    const full = page.waitForRequest(/\/end-to-end-beamline\/assets\/narration\/.*\.mp3$/);
    await page.locator('#play-audio').click();
    const fullFile = path.posix.basename(new URL((await full).url()).pathname);
    const fullClip = tracks.full.find(clip => clip.id + '.mp3' === fullFile);
    assert.ok(fullClip, 'the Full track requested a clip from its manifest');
    assert.equal(fullClip.id, '5c');
    await step(page, fullClip.stepId);
    await page.locator('#spoken-caption').waitFor({state: 'visible'});
    assert.ok((await page.locator('#spoken-caption').textContent()).trim());
    const quick = page.waitForRequest(/\/end-to-end-swiss\/assets\/narration\/.*\.mp3$/);
    if (!await page.locator('#audio-panel').isVisible()) await clickVisible(page, '#narrate');
    // After Play the panel is a mini player; expand it to reach the recording picker and chapters.
    if (await page.locator('#audio-panel.mini').count()) await page.locator('#audio-size').click();
    assert.equal(await page.locator('#chapters button').count(), 12, 'one chapter marker per stage');
    await page.locator('#track').selectOption('quick');
    // Selecting a recording may pause playback; use the accessible Play button to resume.
    const play = page.getByRole('button', {name: /^play narration$/i});
    if (await play.isVisible()) await play.click();
    const quickFile = path.posix.basename(new URL((await quick).url()).pathname);
    const quickClip = tracks.quick.find(clip => clip.id + '.mp3' === quickFile);
    assert.ok(quickClip, 'the Quick track requested a clip from its manifest');
    assert.equal(quickClip.id, '07-forward-pass');
    await step(page, '7.2');
    assert.equal(await page.locator('body').getAttribute('data-step'), '7.2',
      'changing to the stage-wide quick recording retains the selected attention mechanism');
    const duration = tracks.quick.reduce((sum, clip) => sum + clip.dur, 0);
    const expectedTime = Math.floor(duration / 60) + ':' + String(Math.floor(duration % 60)).padStart(2, '0');
    await page.waitForFunction(expected => document.querySelector('#audio-time').textContent.endsWith('/ ' + expected), expectedTime);
    if (!await page.locator('#audio-panel').isVisible()) await clickVisible(page, '#narrate');
    if (await page.locator('#audio-panel.mini').count()) await page.locator('#audio-size').click();
    await page.locator('#captions').uncheck();
    await page.locator('#spoken-caption').waitFor({state: 'hidden'});
    console.log('Reader audio control, local playback, track switch, mute, and captions passed');
  } finally {
    await page.close();
  }
}

async function narrationScroll(browser, url) {
  const page = await browser.newPage({viewport: desktop, reducedMotion: 'reduce'});
  try {
    await page.addInitScript(() => {
      const NativeAudio = window.Audio;
      window.Audio = function (...args) { const audio = new NativeAudio(...args); window.__readerTestAudio = audio; return audio; };
    });
    await page.goto(url); await ready(page); await gotoStep(page, '7.2');
    await clickVisible(page, '#narrate'); await page.locator('#muted').check();
    await page.locator('#play-audio').click();
    await page.waitForFunction(() => window.__readerTestAudio?.readyState >= 1);
    const routed = page.waitForRequest(/\/5e\.mp3$/);
    await page.evaluate(() => {
      const article = document.querySelector('#step-7\\.3');
      window.scrollTo({top: scrollY + article.getBoundingClientRect().top - innerHeight * .35, behavior: 'instant'});
    });
    await routed; await step(page, '7.3');
    assert.equal(await page.locator('#play-audio').textContent(), 'Pause narration',
      'scrolling seeks narration without pausing it');
    assert.equal(await page.evaluate(() => window.__readerTestAudio.paused), false);
    console.log('Reader active scrolling seeks narration without pausing');
  } finally { await page.close(); }
}

async function inspect(browser, url, local, artifacts) {
  const page = await browser.newPage({viewport: desktop, reducedMotion: 'reduce'});
  try {
    if (local) await page.route(/^https?:/, route => route.abort());
    await page.goto(url + '#concept=csa-hca-kv');
    await ready(page);
    await step(page, '7.2');
    const drawer = page.locator('#inspector');
    const back = drawer.getByRole('button', {name: 'Back to lesson'});
    await back.waitFor();
    assert.match(await drawer.locator('h2').textContent(), /CSA.*HCA/);
    assert.equal(await drawer.locator('iframe').count(), 0, 'cutaway must load lazily');
    await page.keyboard.press('Escape');
    await drawer.waitFor({state: 'hidden'});

    const trigger = page.locator('#step-7\\.2 [data-inspect="csa-hca-kv"]');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    const before = await page.evaluate(() => scrollY);
    await trigger.press('Enter');
    await back.waitFor();
    assert.ok(await back.evaluate(node => node === document.activeElement), 'inspector did not take focus');
    assert.ok(await page.locator('#lesson').evaluate(node => node.inert), 'lesson should be inert');
    assert.ok(await page.locator('.mast').evaluate(node => node.inert), 'mast should be inert while inspector is open');
    assert.ok(await page.locator('.rail').evaluate(node => node.inert), 'rail should be inert while inspector is open');
    assert.ok(await drawer.locator('[data-lab="kv"]').count(), 'the KV lab should be mounted');
    const tourHref = await drawer.locator('.inspect-links a').first().getAttribute('href');
    assert.match(tourHref, /from=reader&pos=7\.2/);
    await drawer.getByText('Explore the 3D cutaway', {exact: true}).click();
    const frame = drawer.locator('iframe');
    await frame.waitFor();
    const frameUrl = new URL(await frame.getAttribute('src'), url);
    assert.equal(frameUrl.searchParams.get('focus'), require('../shared/concept-map.js').CONCEPTS['csa-hca-kv'].obs.join(','));
    assert.equal(frameUrl.searchParams.get('skin'), 'light');
    assert.equal((await stat(page)).suspended, true);
    await page.waitForFunction(() => document.querySelector('.inspect-status').textContent === '', null, {timeout});
    if (!local && artifacts) await capture(page, artifacts, 'inspector-1440');
    await page.keyboard.press('Escape');
    await drawer.waitFor({state: 'hidden'});
    assert.ok(await trigger.evaluate(node => node === document.activeElement), 'closing inspector did not restore focus');
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 1, 'closing inspector moved the lesson');
    assert.equal((await stat(page)).suspended, false);
    console.log('Reader inspector focus, restoration, labs, and lazy cutaway passed over', local ? 'file://' : 'HTTP');
  } finally {
    await page.close();
  }
}

async function fallbacks(browser, url, artifacts) {
  const noScript = await browser.newPage({javaScriptEnabled: false, viewport: phone});
  try {
    await noScript.goto(url);
    assert.equal(await noScript.locator('section.station:visible').count(), 12);
    assert.equal(await noScript.locator('article[data-step]:visible').count(), 43);
    assert.equal(await noScript.locator('article dl.spec:visible').count(), 29);
    assert.equal(await noScript.locator('article pre.eq:visible').count(), 16);
    assert.ok(await noScript.locator('#sources a').count() >= 17);
  } finally {
    await noScript.close();
  }

  const noGL = await browser.newPage({viewport: phone, reducedMotion: 'reduce'});
  try {
    await noGL.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, options) {
        return /webgl/.test(type) ? null : getContext.call(this, type, options);
      };
    });
    await noGL.goto(url);
    await noGL.waitForFunction(() => window.OneToken?.scene);
    const fallback = noGL.locator('#viewport .fallback img');
    await fallback.waitFor();
    await noGL.waitForFunction(() => document.querySelector('#viewport .fallback img').naturalWidth > 0);
    await gotoStep(noGL, '12.2');
    await capture(noGL, artifacts, 'no-webgl');
  } finally {
    await noGL.close();
  }

  const recovery = await browser.newPage({viewport: desktop, reducedMotion: 'reduce'});
  try {
    await trackAnimationFrames(recovery);
    await recovery.goto(url);
    await ready(recovery);
    await gotoStep(recovery, '7.2');
    const before = await stat(recovery);
    await recovery.evaluate(() => {
      window.__readerLoseContext = document.querySelector('#scene').getContext('webgl2').getExtension('WEBGL_lose_context');
      window.__readerLoseContext.loseContext();
    });
    await recovery.waitForFunction(() => window.OneToken.scene.stats().lost);
    assert.equal(await recovery.locator('#viewport').getAttribute('data-render'), 'lost');
    await capture(recovery, artifacts, 'context-lost');
    await recovery.evaluate(() => window.__readerLoseContext.restoreContext());
    await ready(recovery);
    await recovery.waitForFunction(frames => window.OneToken.scene.stats().frames > frames, before.frames);
    await step(recovery, '7.2');
    await idle(recovery, 'reader after context recovery');
  } finally {
    await recovery.close();
  }
  console.log('Reader static no-JS lesson, no-WebGL fallback, and WebGL context recovery passed');
}

async function verifyReader(browser, base, artifacts) {
  const url = new URL('./', base).href;
  await layouts(browser, url, artifacts);
  await navigation(browser, url, artifacts);
  await narration(browser, url);
  await narrationScroll(browser, url);
  await phonePopups(browser, url);
  await inspect(browser, url, false, artifacts);
  await inspect(browser, fileReader, true);
  await fallbacks(browser, url, artifacts);

  // Legacy /one-token/ alias redirects cleanly to root and preserves fragments.
  const alias = await browser.newPage({viewport: desktop, reducedMotion: 'reduce'});
  try {
    await alias.goto(new URL('one-token/#step-7.2', base).href);
    await ready(alias);
    await step(alias, '7.2');
    assert.match(alias.url(), /\/index\.html#step-7\.2$/);
    console.log('Reader /one-token/ redirect alias preserved fragment at root');
  } finally {
    await alias.close();
  }
}

async function verifyReaderWarp(browser, base, budget = 100) {
  const page = await browser.newPage({viewport: desktop, reducedMotion: 'reduce'});
  try {
    await trackAnimationFrames(page);
    await page.goto(new URL('./', base).href);
    await ready(page);
    await gotoStep(page, '7.2');
    const adapter = await page.evaluate(() => {
      const gl = document.querySelector('#scene').getContext('webgl2');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    });
    assert.match(adapter, /Microsoft Basic Render Driver|WARP/i);
    for (const view of ['diagram', 'spatial']) {
      await switchView(page, view);
      const report = await page.evaluate(async () => {
        const scene = window.OneToken.scene;
        const canvas = document.querySelector('#scene');
        const gl = canvas.getContext('webgl2');
        const selector = document.querySelector('#scrubber');
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
        const reports = [];
        let calls = 0;
        for (let trial = 0; trial < 5; trial++) {
          const samples = [];
          for (let i = 0; i < 65; i++) {
            const expected = 22 + (i + 1) % 3;
            const before = scene.stats().frames;
            const start = performance.now();
            selector.value = String(expected);
            selector.dispatchEvent(new Event('input', {bubbles: true}));
            await nextFrame();
            // Give the host one more frame if a controller scroll event was queued.
            if (scene.stats().frames === before) await nextFrame();
            if (scene.stats().frames === before) throw new Error('Reader failed to draw after a scrubber move');
            gl.finish();
            calls = Math.max(calls, scene.stats().calls);
            if (i >= 12) samples.push(performance.now() - start);
          }
          samples.sort((a, b) => a - b);
          reports.push(+samples[Math.ceil(.95 * samples.length) - 1].toFixed(1));
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        const p95s = reports.toSorted((a, b) => a - b);
        return {calls, trialP95s: reports, p95: p95s[Math.floor(p95s.length / 2)]};
      });
      console.log('Reader WARP', view, JSON.stringify({adapter, ...report, budget}));
      assert.ok(report.calls < 90, view + ' draw-call budget');
      assert.ok(report.p95 < budget, view + ' WARP median p95 budget');
      await idle(page, view + ' WARP');
    }
  } finally {
    await page.close();
  }
}

module.exports = {verifyReader, verifyReaderWarp, phonePopups};
