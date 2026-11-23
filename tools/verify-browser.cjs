'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const {createApp} = require('../server');

const root = path.resolve(__dirname, '..');
const axePath = require.resolve('axe-core/axe.min.js');
const warp = process.argv.includes('--warp');
// --only=layout,keyboard,context,mirrors runs a subset; default runs every section.
const onlyArg = process.argv.find(arg => arg.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
const runs = section => !only || only.has(section);
const pages = [
  ['Swiss', 'end-to-end-swiss/', 'window.THREE && document.querySelector("#heroCanvas").width > 300'],
  ['Beamline', 'end-to-end-beamline/', 'document.documentElement.dataset.ready === "1"'],
  ['Story', 'journey-story/', 'window.__ready'],
  ['Tour', 'journey-tour/', 'window.__ready'],
  ['Observatory', 'shared/obs-core.html', 'window.__ready'],
];

async function ready(page, url, condition) {
  await page.goto(url, {waitUntil: 'load'});
  await page.waitForFunction(condition, null, {timeout: 60000});
  await page.evaluate(() => document.fonts.ready);
}

async function layoutAndAxe(browser, base, artifacts) {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    for (const [name, route, condition] of pages) {
      const page = await browser.newPage({viewport: {width, height}, reducedMotion: 'reduce'});
      try {
        const errors = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', err => errors.push(err.message));
        // Exercise the offline system-font layout deterministically in CI.
        await page.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType: 'text/css', body: ''}));
        await ready(page, base + route + '?rm=1' + (name === 'Tour' ? '#stop-22' : ''), condition);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' horizontal overflow');
        if (name === 'Tour') {
          const good = await page.locator('#tourCard').evaluate(card => {
            const content = card.querySelector('.tour-stop-content'), footer = card.querySelector('.obs-actions');
            return content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1 &&
              footer.getBoundingClientRect().bottom <= innerHeight;
          });
          assert(good, 'Stop 22 footer overlaps or clips its plaque');
        }
        if (name === 'Story') {
          assert(await page.locator('#ch4 .s4-draw .obs-host').count(), 'Story room missing');
        }
        if (name === 'Observatory') {
          assert.notEqual(await page.locator('#labelsLayer').evaluate(e => getComputedStyle(e).clipPath), 'none');
        }
        for (const frame of page.frames()) await frame.addScriptTag({path: axePath});
        const issues = await page.evaluate(async () => (await axe.run(document, {
          runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']},
        })).violations.map(v => ({id: v.id, nodes: v.nodes.map(n => ({target: n.target, failure: n.failureSummary}))})));
        await page.screenshot({path: path.join(artifacts, name + '-' + width + '.png')});
        assert.deepEqual(issues, [], name + ' ' + width + ' accessibility: ' + JSON.stringify(issues));
        assert.deepEqual(errors, [], name + ' console');
        console.log(name, width + '×' + height, 'layout, screenshot, axe and console passed');
      } finally { await page.close(); }
    }
  }
}

async function keyboard(browser, base, local) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  try {
    const address = route => local ? pathToFileURL(path.join(root, route, 'index.html')).href : base + route + '/';
    if (local) await page.context().setOffline(true);
    await ready(page, address('journey-tour') + '?rm=1#stop-6', 'window.__ready');
    let canvas = page.frameLocator('#tourStage').locator('#threeCanvas');
    await canvas.click({position: {x: 125, y: 225}});
    const frame = page.frames().find(f => f.url().includes('obs-core.html'));
    assert.equal(await frame.locator('.zone-label').count(), 0, 'unprojected embed headers');
    for (const [key, hash] of [['ArrowRight','7'],['ArrowLeft','6'],['Home','1'],['End','30'],
      ['1','1'],['2','5'],['3','9'],['4','13'],['5','22'],['6','27']]) {
      await canvas.press(key);
      await page.waitForFunction(expected => location.hash === '#stop-' + expected, hash);
    }
    await canvas.press('Escape');
    await page.waitForFunction(() => location.hash === '#explore');
    await ready(page, address('journey-story') + '?rm=1&state=ch4-drawer-router', 'window.__ready && window.__journey.state.opened');
    canvas = page.frameLocator('#obsFrame').locator('#threeCanvas');
    const initial = await page.evaluate(() => window.__journey.state.pos);
    await canvas.press('ArrowRight');
    await page.waitForFunction(n => window.__journey.state.pos === n + 1, initial);
    await canvas.press('Home');
    await page.waitForFunction(() => window.__journey.state.pos === 0);
    await canvas.press('6');
    await page.waitForFunction(() => document.getElementById('partIndex').textContent.includes('Chapter 6'));
    await canvas.press('Escape');
    await page.waitForFunction(() => !window.__journey.state.opened);
    assert.deepEqual(pageErrors, []);
    console.log(local ? 'Local file' : 'HTTP', 'iframe shortcuts passed');
  } finally { await page.close(); }
}

async function contextRecovery(browser, base, name, route, condition, selector, fallback) {
  const page = await browser.newPage({reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  try {
    // quality=high keeps the env map on software renderers, so restore rebuilds it too.
    await ready(page, base + route + '?rm=1' + (name === 'Observatory' ? '&quality=high' : ''), condition);
    // Count real draws so a restore that never schedules a frame cannot pass.
    await page.evaluate(() => {
      window.__draws = 0;
      for (const proto of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext?.prototype]) {
        if (!proto) continue;
        for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const original = proto[fn];
          if (original) proto[fn] = function (...args) { window.__draws++; return original.apply(this, args); };
        }
      }
    });
    await page.locator(selector).evaluate(canvas => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      window.testLoss = gl.getExtension('WEBGL_lose_context');
      window.testLoss.loseContext();
    });
    await page.locator(fallback).waitFor({state:'visible'});
    // The browser must acknowledge the loss before the test can request restoration.
    await page.waitForTimeout(150);
    // Nothing draws while the context is lost, so any draw after this snapshot came from the restore.
    const drawsAtRestore = await page.evaluate(() => { const n = window.__draws; window.testLoss.restoreContext(); return n; });
    await page.locator(fallback).waitFor({state:'hidden'});
    await page.waitForFunction(n => window.__draws > n, drawsAtRestore, {timeout: 15000});
    assert(await page.locator(selector).evaluate(canvas => !(canvas.getContext('webgl2') || canvas.getContext('webgl')).isContextLost()));
    if (name === 'Observatory') assert(await page.evaluate(() => window.obs.renderNow()));
    assert.deepEqual(errors, [], name + ' context recovery');
    console.log(name, 'context loss and restoration passed');
  } finally { await page.close(); }
}

async function mirrors(browser, base) {
  for (const [name, route, condition] of pages.filter(([name]) => ['Swiss','Beamline','Observatory'].includes(name))) {
    const page = await browser.newPage({reducedMotion:'reduce'});
    try {
      const revision = name === 'Beamline' ? '160' : '128', visited = [];
      await page.route('**/vendor/three-r*.min.js', r => r.abort());
      await page.route(/^https:\/\/(cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net)\//, async r => {
        const host = new URL(r.request().url()).host;
        visited.push(host);
        if (host !== 'cdn.jsdelivr.net') return r.abort();
        // SRI puts the request in CORS mode, so the stand-in mirror must allow it like the real CDNs do.
        return r.fulfill({path: path.join(root, 'shared/vendor/three-r' + revision + '.min.js'),
          contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'}});
      });
      await ready(page, base + route + '?rm=1', condition);
      assert.equal(await page.evaluate(() => THREE.REVISION), revision);
      assert.deepEqual(visited, ['cdnjs.cloudflare.com','unpkg.com','cdn.jsdelivr.net']);
      console.log(name, 'three pinned mirror requests passed');
    } finally { await page.close(); }
  }
  // Negative control: a mirror serving altered bytes must be refused by the SRI pin.
  const page = await browser.newPage({reducedMotion:'reduce'});
  try {
    page.on('console', () => {});
    await page.route('**/vendor/three-r*.min.js', r => r.abort());
    await page.route(/^https:\/\/(cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net)\//, r => r.fulfill({
      body: 'window.THREE = {REVISION: "160"};', contentType: 'application/javascript',
      headers: {'access-control-allow-origin': '*'}}));
    await page.goto(base + 'end-to-end-beamline/?rm=1', {waitUntil: 'load'});
    await page.waitForFunction(() => document.documentElement.classList.contains('nogl'), null, {timeout: 60000});
    assert.equal(await page.evaluate(() => window.THREE), undefined, 'tampered mirror script executed');
    console.log('Beamline tampered mirror rejected by SRI');
  } finally { await page.close(); }
}

async function drawerPerformance(browser, base) {
  const page = await browser.newPage({viewport: {width:1440,height:900}});
  try {
    await ready(page, base + 'journey-story/?rm=1&state=ch4-drawer-router', 'window.__ready && window.__journey.state.opened');
    const frame = page.frames().find(f => f.url().includes('obs-core.html'));
    const report = await frame.evaluate(async () => {
      const api = window.obs;
      const gl = document.querySelector('canvas').getContext('webgl2') || document.querySelector('canvas').getContext('webgl');
      const basePose = api.getPose(), samples = [];
      for (let i = 0; i < 65; i++) {
        const start = performance.now();
        api.setPose({pos: [basePose.pos[0] + Math.sin(i * .12) * .45, ...basePose.pos.slice(1)], target:basePose.target}, {fly:false});
        api.renderNow();
        gl.finish();
        await new Promise(requestAnimationFrame);
        if (i >= 12) samples.push(performance.now() - start);
      }
      await new Promise(r => setTimeout(r, 600));
      const stats = api.stats();
      await new Promise(r => setTimeout(r, 900));
      samples.sort((a,b) => a-b);
      return {adapter:stats.quality.renderer, pixels:stats.quality.buffer, calls:stats.renderer.calls,
        p95:samples[Math.ceil(.95 * samples.length) - 1], idleFrames:api.stats().frames - stats.frames};
    });
    console.log('Open router drawer', JSON.stringify(report));
    assert.match(report.adapter, /Microsoft Basic Render Driver|WARP/i);
    assert(report.calls < 90, 'drawer draw-call budget');
    assert(report.p95 < 100, 'WARP p95 must be below 100 ms');
    assert.equal(report.idleFrames, 0);
  } finally { await page.close(); }
}

async function main() {
  const artifacts = process.env.JOURNEY_SCREENSHOTS || await fs.mkdtemp(path.join(os.tmpdir(), 'journey-layouts-'));
  await fs.mkdir(artifacts, {recursive:true});
  const server = await new Promise(resolve => { const s = createApp().listen(0, '127.0.0.1', () => resolve(s)); });
  let browser;
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    browser = await chromium.launch({args: warp ? ['--use-angle=d3d11-warp'] : ['--enable-unsafe-swiftshader']});
    if (warp) return await drawerPerformance(browser, base);
    if (runs('layout')) await layoutAndAxe(browser, base, artifacts);
    if (runs('keyboard')) {
      await keyboard(browser, base, false);
      await keyboard(browser, base, true);
    }
    if (runs('context')) for (const [name,route,condition] of pages) {
      if (name === 'Swiss') await contextRecovery(browser,base,name,route,condition,'#heroCanvas','#heroGL.gl-lost');
      if (name === 'Beamline') await contextRecovery(browser,base,name,route,condition,'#stage','.gl-lost .render-fallback');
      if (name === 'Observatory') await contextRecovery(browser,base,name,route,condition,'#threeCanvas','#contextFallback');
    }
    if (runs('mirrors')) await mirrors(browser,base);
    console.log('Screenshots:',artifacts);
  } finally {
    try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); }
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
