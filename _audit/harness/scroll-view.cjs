'use strict';
// Scroll the One Token reader in Spatial view twice (cold, then warm) in installed Edge and
// record rAF frame gaps plus which step was active during each long frame. Measurement only.
const REPO = 'C:/Users/tandf/source/repos/one-token-explainers';
const {chromium} = require(REPO + '/node_modules/playwright');
const {createApp} = require(REPO + '/server.js');
const channel = process.argv[2] || 'msedge';
const staticRoot = process.argv[3];
const express = require(REPO + '/node_modules/express');

(async () => {
  const app = staticRoot ? express().use(express.static(staticRoot, {index: 'index.html'})) : createApp();
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({channel, args: ['--ignore-gpu-blocklist']});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/index.html?spatial=force');
    await page.waitForFunction(() => window.OneToken?.scene?.stats?.().frames > 0, null, {timeout: 20000});
    if (process.env.VIEW === 'spatial') {
      await page.locator('.view-switch [data-view=spatial]').click();
      await page.waitForFunction(() => window.OneToken.scene.stats().view === 'spatial', null, {timeout: 20000});
    }
    await page.waitForTimeout(1500);
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a';
    });
    const passes = [];
    for (const label of ['cold', 'warm']) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        window.__gaps = [];
        let prev = performance.now();
        const tick = now => {
          const active = document.querySelector('article[data-active]')?.id || 'opening';
          const pose = window.OneToken.scene.stats().cameraPose;
          const p = pose ? [pose[12], pose[13], pose[14]] : null;
          const moved = p && window.__lastPos ? Math.hypot(p[0] - window.__lastPos[0], p[1] - window.__lastPos[1], p[2] - window.__lastPos[2]) : 0;
          window.__lastPos = p;
          const cv = document.getElementById('scene'), vp = document.getElementById('viewport');
          const size = cv.width + 'x' + cv.height + ' css ' + vp.clientWidth + 'x' + vp.clientHeight;
          if (moved > 15) (window.__jumps ||= []).push({at: active, moved: +moved.toFixed(1), size, prevSize: window.__lastSize, dt: +(now - prev).toFixed(1), scrollY: Math.round(scrollY), view: window.OneToken.scene.stats().view, moving: window.OneToken.scene.stats().moving});
          window.__lastSize = size;
          window.__gaps.push([now - prev, active, moved]); prev = now;
          if (window.__recording) requestAnimationFrame(tick);
        };
        window.__recording = true;
        requestAnimationFrame(tick);
      });
      await page.mouse.move(900, 500);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - 1600);
      // A reader's wheel: 100 px notches, ~60 ms apart, until the sources section.
      while (await page.evaluate(() => scrollY) < max) {
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(600);
      const gaps = await page.evaluate(() => { window.__recording = false; return window.__gaps; });
      const ms = gaps.map(g => g[0]).slice(1);
      const sorted = [...ms].sort((a, b) => a - b);
      const long = gaps.filter(g => g[0] > 34);
      passes.push({pass: label, frames: ms.length,
        p50: +sorted[Math.floor(ms.length * .5)].toFixed(1), p95: +sorted[Math.floor(ms.length * .95)].toFixed(1),
        max: +Math.max(...ms).toFixed(1), over34ms: long.length, over50ms: gaps.filter(g => g[0] > 50).length,
        worst: [...long].sort((a, b) => b[0] - a[0]).slice(0, 8).map(([t, id]) => id + ':' + t.toFixed(0)),
        jumps: await page.evaluate(() => { const j = window.__jumps || []; window.__jumps = []; return j; }),
        camMax: +Math.max(...gaps.map(g => g[2])).toFixed(3),
        camP99: +[...gaps.map(g => g[2])].sort((a, b) => a - b)[Math.floor(gaps.length * .99)].toFixed(3),
        camAfterStall: +Math.max(0, ...gaps.map((g, i) => gaps[i - 1]?.[0] > 34 || g[0] > 34 ? g[2] : 0)).toFixed(3),
        camBiggest: [...gaps].sort((a, b) => b[2] - a[2]).slice(0, 4).map(([t, id, m]) => id + ' moved ' + m.toFixed(2) + ' in ' + t.toFixed(0) + 'ms')});
    }
    console.log(JSON.stringify({channel, gpu, errors, passes}, null, 1));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
