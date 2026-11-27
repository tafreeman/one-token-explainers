'use strict';
// Regression harness: before/after console errors, 4 s rAF frame times, WebGL draws, screenshots.
// Measurement-only; nothing here ships. Usage: node regress.cjs <afterRoot> <beforeRoot> <outDir>
const path = require('node:path');
const fs = require('node:fs');
const REPO = 'C:/Users/tandf/source/repos/one-token-explainers';
const {chromium} = require(REPO + '/node_modules/playwright');
const express = require(REPO + '/node_modules/express');
const [afterRoot, beforeRoot, outDir] = process.argv.slice(2);
const TRIALS = 3, SAMPLE_MS = 4000, SETTLE_MS = 2500, SHOT_SETTLE_MS = 3000;
const VIEWPORT = {width: 1440, height: 900};
const PAGES = [
  {key: 'beamline', url: '/end-to-end-beamline/index.html', gate: true},
  {key: 'swiss', url: '/end-to-end-swiss/index.html', gate: true},
  {key: 'story', url: '/journey-story/index.html', gate: true},
  {key: 'tour', url: '/journey-tour/index.html', gate: true},
  {key: 'observatory', url: '/shared/obs-core.html?realm=MODEL', gate: true},
  {key: 'one-token', url: '/index.html', gate: false},
  {key: 'one-token-spatial', url: '/index.html?spatial=force#step-7.3', gate: false},
];

function serve(root) {
  const app = express();
  app.use(express.static(root, {index: 'index.html'}));
  return new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
}

const INIT = () => {
  window.__draws = 0;
  for (const proto of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = proto[fn];
      if (original) proto[fn] = function (...args) { window.__draws++; return original.apply(this, args); };
    }
  }
  window.__frameDraws = [];
  let last = 0;
  const tick = () => { window.__frameDraws.push(window.__draws - last); last = window.__draws; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

async function sample(page) {
  return page.evaluate(ms => new Promise(resolve => {
    const deltas = [], draws = [];
    let prev = performance.now(), lastDraws = window.__draws;
    const end = prev + ms;
    const step = now => {
      deltas.push(now - prev); prev = now;
      draws.push(window.__draws - lastDraws); lastDraws = window.__draws;
      if (now < end) requestAnimationFrame(step);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
        const rendered = draws.filter(n => n > 0);
        resolve({p50: q(.5), p95: q(.95), frames: deltas.length,
          renderedFrames: rendered.length,
          drawsPerRenderedFrame: rendered.length ? Math.round(rendered.reduce((a, b) => a + b, 0) / rendered.length) : 0,
          peakDrawsInWindow: Math.max(0, ...draws),
          peakDrawsSinceLoad: Math.max(0, ...window.__frameDraws)});
      }
    };
    requestAnimationFrame(step);
  }), SAMPLE_MS);
}

async function run(browser, base, pageDef, {shot} = {}) {
  const context = await browser.newContext({viewport: VIEWPORT, reducedMotion: shot ? 'reduce' : 'no-preference'});
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  await page.addInitScript(INIT);
  try {
    await page.goto(base + pageDef.url, {waitUntil: 'load'});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(shot ? SHOT_SETTLE_MS : SETTLE_MS);
    if (shot) return {errors, png: await page.screenshot()};
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a';
    });
    return {errors, gpu, ...(await sample(page))};
  } finally { await context.close(); }
}

async function pixelDiff(browser, a, b) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([a, b]) => {
      const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return {sizeMismatch: true, differing: -1, total: 0};
      const read = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const da = read(ia), db = read(ib);
      let differing = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) differing++;
      }
      return {differing, total: da.length / 4};
    }, ['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64')]);
  } finally { await page.close(); }
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

(async () => {
  fs.mkdirSync(outDir, {recursive: true});
  const [sa, sb] = await Promise.all([serve(afterRoot), serve(beforeRoot)]);
  const bases = {after: 'http://127.0.0.1:' + sa.address().port, before: 'http://127.0.0.1:' + sb.address().port};
  const browser = await chromium.launch({args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']});
  const results = {};
  try {
    for (const p of PAGES) {
      const r = results[p.key] = {gate: p.gate, url: p.url, before: [], after: [], shots: {}};
      // Interleave variants so drift affects both equally.
      for (let t = 0; t < TRIALS; t++) {
        for (const v of ['before', 'after']) r[v].push(await run(browser, bases[v], p));
      }
      const shots = {};
      for (const tag of ['before1', 'after1', 'before2', 'after2']) {
        const v = tag.replace(/\d$/, '');
        const out = await run(browser, bases[v], p, {shot: true});
        shots[tag] = out.png;
        r[v + 'ShotErrors'] = (r[v + 'ShotErrors'] || []).concat(out.errors);
        fs.writeFileSync(path.join(outDir, p.key + '-' + tag + '.png'), out.png);
      }
      r.shots = {
        beforeVsAfter: await pixelDiff(browser, shots.before1, shots.after1),
        beforeVsAfter2: await pixelDiff(browser, shots.before2, shots.after2),
        noiseBefore: await pixelDiff(browser, shots.before1, shots.before2),
        noiseAfter: await pixelDiff(browser, shots.after1, shots.after2),
      };
      const summarize = runs => ({
        p50: median(runs.map(x => x.p50)), p95: median(runs.map(x => x.p95)),
        p95s: runs.map(x => +x.p95.toFixed(1)),
        draws: median(runs.map(x => x.drawsPerRenderedFrame)), peakDraws: Math.max(...runs.map(x => x.peakDrawsSinceLoad)),
        renderedFrames: median(runs.map(x => x.renderedFrames)),
        errors: [...new Set(runs.flatMap(x => x.errors))], gpu: runs[0].gpu});
      r.summary = {before: summarize(r.before), after: summarize(r.after)};
      const s = r.summary;
      console.log(p.key, JSON.stringify({before: {p50: s.before.p50.toFixed(1), p95: s.before.p95.toFixed(1), p95s: s.before.p95s, draws: s.before.draws, peak: s.before.peakDraws, err: s.before.errors.length},
        after: {p50: s.after.p50.toFixed(1), p95: s.after.p95.toFixed(1), p95s: s.after.p95s, draws: s.after.draws, peak: s.after.peakDraws, err: s.after.errors.length},
        shots: r.shots}));
    }
  } finally {
    await browser.close(); sa.close(); sb.close();
    for (const k of Object.keys(results)) { delete results[k].before; delete results[k].after; }
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  }
})().catch(err => { console.error(err); process.exit(1); });
