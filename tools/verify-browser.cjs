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
// WARP rasterizes on the CPU, so latency scales with cores. 100 ms is the budget on a
// 24-thread workstation; CI's 4-vCPU runner passes its own calibrated WARP_P95_BUDGET_MS.
const WARP_P95_BUDGET_MS = Number(process.env.WARP_P95_BUDGET_MS) || 100;
const WARP_TRIALS = 5;
// --only=layout,keyboard,focus,sampling,claims,depth,instrument,context,mirrors runs a subset; default runs every section.
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

// Keyboard-only use of the drawer labs and the Observatory panels: focus order, visibility, trap.
async function focusOrder(browser, base, local = false) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const tabUntil = async (test, limit = 60, key = 'Tab') => {
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press(key);
      assert(await page.evaluate(() => !window.__journey?.state.opened ||
        !!document.activeElement.closest('#obsDialog')), 'Tab escaped the open Story dialog');
      const state = await page.evaluate(test);
      if (state) return state;
    }
    return null;
  };
  try {
    const address = route => local ? pathToFileURL(path.join(root, route, 'index.html')).href : base + route + '/';
    if (local) await page.context().setOffline(true);
    // Story drawer: Tab reaches the docked router lab's summary and slider and never leaves the panel.
    await ready(page, address('journey-story') + '?rm=1&state=ch4-room-router', 'window.__ready');
    await page.focus('#obsExpand');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__journey.state.opened);
    const summary = await tabUntil(() => {
      const el = document.activeElement;
      if (!el.closest('#obsAside')) return 'escaped:' + el.tagName;
      return el.matches('.micro-lab[data-lab="moe"] > summary') && 'summary';
    });
    assert.equal(summary, 'summary', 'Tab never reached the drawer lab summary');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#obsAside .micro-lab[data-lab="moe"] input[type="range"]');
    const slider = await tabUntil(() => {
      const el = document.activeElement;
      if (!el.closest('#obsAside')) return 'escaped:' + el.tagName;
      return el.matches('.micro-lab[data-lab="moe"] input[type="range"]') && 'slider';
    });
    assert.equal(slider, 'slider', 'Tab never reached the drawer lab slider');
    const before = await page.evaluate(() => ({pos: window.__journey.state.pos, value: +document.activeElement.value}));
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => ({pos: window.__journey.state.pos, value: +document.activeElement.value}));
    assert.deepEqual(after, {pos: before.pos, value: before.value + 1}, 'ArrowRight on a lab slider moved the drawer');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+Tab');
    assert(await page.locator('#obsAside .micro-lab[data-lab="moe"] > summary').evaluate(el => el === document.activeElement),
      'Shift+Tab did not return from the slider to its disclosure');
    await page.keyboard.press('Tab');
    const scene = await tabUntil(() => document.activeElement.id === 'obsFrame');
    assert(scene, 'Tab never reached the drawer scene');
    const frame = page.frames().find(f => f.url().includes('obs-core.html'));
    await frame.waitForFunction(() => document.hasFocus() && document.activeElement.id === 'threeCanvas');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'partNext', 'Scene Shift+Tab did not wrap inside the drawer');
    await page.keyboard.press('Tab');
    await frame.waitForFunction(() => document.hasFocus() && document.activeElement.id === 'threeCanvas');
    // The scene can have real component buttons after its canvas; keep their native order too.
    assert(await tabUntil(() => document.activeElement.id === 'obsClose'), 'Scene Tab did not reach the panel');
    assert(await tabUntil(() => document.activeElement.id === 'partNext', 60, 'Shift+Tab'),
      'Reverse Tab did not traverse the scene and wrap inside the drawer');
    await page.keyboard.press('Tab');
    await frame.waitForFunction(() => document.hasFocus() && document.activeElement.id === 'threeCanvas');

    // Another real docked lab exercises a textarea, not only the router's range input.
    await page.keyboard.press('Home');
    for (let i = 0; i < 5 && !await page.locator('#obsAside .micro-lab[data-lab="bpe"]').count(); i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(30);
    }
    assert(await page.locator('#obsAside .micro-lab[data-lab="bpe"]').count(), 'BPE drawer lab missing');
    assert(await tabUntil(() => document.activeElement.matches('.micro-lab[data-lab="bpe"] > summary')));
    await page.keyboard.press('Enter');
    assert(await tabUntil(() => document.activeElement.matches('#obsAside textarea')));
    await page.keyboard.press('Control+End');
    const textBefore = await page.evaluate(() => ({pos: window.__journey.state.pos, caret: document.activeElement.selectionStart}));
    await page.keyboard.press('ArrowLeft');
    const textAfter = await page.evaluate(() => ({pos: window.__journey.state.pos, caret: document.activeElement.selectionStart}));
    assert.equal(textAfter.pos, textBefore.pos, 'Textarea arrows moved the drawer');
    assert(textAfter.caret < textBefore.caret, 'Textarea ArrowLeft did not move the caret');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__journey.state.opened);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'obsExpand', 'Close did not restore the actual opener');

    // Character shortcuts work only in the chapter rail or the focused scene.
    await ready(page, address('journey-tour') + '?rm=1#stop-22', 'window.__ready');
    await page.locator('#tourCard summary').first().focus();
    await page.keyboard.press('1');
    assert.equal(await page.evaluate(() => location.hash), '#stop-22', 'An unrelated summary triggered a chapter shortcut');
    await page.locator('#tourRail button').first().focus();
    await page.keyboard.press('2');
    await page.waitForFunction(() => location.hash === '#stop-5');
    await page.frameLocator('#tourStage').locator('#threeCanvas').focus();
    await page.keyboard.press('4');
    await page.waitForFunction(() => location.hash === '#stop-13');

    if (local) {
      assert.deepEqual(errors, []);
      console.log('Local file drawer traversal, native controls and scoped shortcuts passed');
      return;
    }

    // Observatory: the canvas focus ring is visible at 3:1, and hidden panels leave the Tab order.
    await ready(page, base + 'shared/obs-core.html?rm=1', 'window.__ready');
    const inert = () => page.evaluate(() => ['tocDrawer', 'tocReopenBtn', 'detailPanel']
      .map(id => document.getElementById(id).inert));
    assert.deepEqual(await inert(), [false, true, true], 'initial panel inert state');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const canvas = document.getElementById('threeCanvas');
      canvas.focus();
      const style = getComputedStyle(canvas), probe = document.createElement('i');
      probe.style.color = 'var(--bg-studio)';
      document.body.append(probe);
      const lum = c => c.match(/[\d.]+/g).slice(0, 3).map(v => +v / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const [a, b] = [lum(style.outlineColor), lum(getComputedStyle(probe).color)].sort((x, y) => y - x);
      probe.remove();
      return {visible: canvas.matches(':focus-visible'), style: style.outlineStyle,
        width: parseFloat(style.outlineWidth), contrast: (a + .05) / (b + .05)};
    });
    assert(ring.visible && ring.style !== 'none' && ring.width >= 2, 'canvas focus ring: ' + JSON.stringify(ring));
    // Proxy: the ring is measured against the studio background colour, not the WebGL pixels under it.
    assert(ring.contrast >= 3, 'canvas focus ring contrast vs --bg-studio ' + ring.contrast.toFixed(2));
    await page.focus('#btnTocCollapse');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('tocDrawer').inert && document.activeElement.id === 'tocReopenBtn');
    const leaked = await tabUntil(() => {
      const el = document.activeElement;
      return el.closest('#tocDrawer, #detailPanel') ? el.id || el.tagName : false;
    }, 40);
    assert.equal(leaked, null, 'Tab reached a hidden panel: ' + leaked);
    await page.focus('#tocReopenBtn');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('tocDrawer').inert && document.activeElement.id === 'tocFilter');
    await page.focus('.toc-item');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('detailPanel').inert);
    await page.focus('#btnExitFocus');
    await page.keyboard.press('Enter');
    // Closing the inspector returns focus to the index row that opened it.
    await page.waitForFunction(() => document.getElementById('detailPanel').inert &&
      document.activeElement.matches('#tocDrawer .toc-item'));
    assert.deepEqual(errors, []);
    console.log('Story drawer lab and Observatory panel focus order passed');
  } finally { await page.close(); }
}

async function samplingContract(browser, base) {
  const page = await browser.newPage({reducedMotion: 'reduce'});
  try {
    await ready(page, base + 'end-to-end-beamline/?rm=1&study=1&lab=sample',
      'document.documentElement.dataset.ready === "1"');
    const lab = page.locator('.micro-lab[data-lab="sample"]');
    if (!await lab.evaluate(el => el.open)) await lab.locator('summary').click();
    const payload = async () => JSON.parse((await lab.locator('pre').textContent()).split('\n\n')[1]);
    for (const name of ['temperature', 'top_p', 'top_k']) {
      assert(!Object.hasOwn(await payload(), name), 'Omitted ' + name + ' was serialized');
      for (const value of ['null', '1']) {
        await lab.getByLabel(name, {exact: true}).selectOption(value);
        assert.equal((await payload())[name], value === 'null' ? null : 1);
        assert.match(await lab.locator('[role="status"]').textContent(), /remove/);
        assert.match(await lab.locator('[role="status"]').textContent(), new RegExp(name));
      }
      await lab.getByLabel(name, {exact: true}).selectOption('');
    }
    assert.doesNotMatch(await lab.locator('[role="status"]').textContent(), /HTTP 200/);
    assert.match(await lab.locator('[role="status"]').textContent(), /sampling.parameter check passes/i);
    console.log('Sampling request preview preserves omission and rejects explicit null/defaults');
  } finally { await page.close(); }
}

async function swissKVComparison(browser, base, artifacts) {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({viewport: {width, height}, reducedMotion: 'reduce'});
    try {
      await ready(page, base + 'end-to-end-swiss/?rm=1', 'window.THREE && document.querySelector("#heroCanvas").width > 300');
      const outputs = page.locator('output[data-out="kv"]');
      const initial = await outputs.allTextContents();
      assert.equal(initial.length, 2);
      for (const text of initial) assert.match(text, /V4-Pro at 1M: ≈10% of V3\.2’s stored KV/);
      // Act through each real radio label, proving the duplicate controls stay in sync.
      await page.locator('label').filter({has: page.locator('input[name="kvMode7"][value="dense"]')}).click();
      assert.equal(await page.locator('input[data-sync="kv"][value="dense"]:checked').count(), 2);
      const dense = await outputs.allTextContents();
      assert.equal(dense[0], dense[1]);
      assert.match(dense[0], /Illustrative dense attention/);
      assert.doesNotMatch(dense[0], /10[×x]|10%/);
      await page.screenshot({path: path.join(artifacts, 'Swiss-dense-' + width + '.png')});
      await page.locator('label').filter({has: page.locator('input[data-sync="kv"][value="sparse"]')}).last().click();
      assert.equal(await page.locator('input[data-sync="kv"][value="sparse"]:checked').count(), 2);
      assert.deepEqual(await outputs.allTextContents(), initial);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({path: path.join(artifacts, 'Swiss-sparse-' + width + '.png')});
      console.log('Swiss', width, 'KV comparison preserves the storage baseline and synchronized controls');
    } finally { await page.close(); }
  }
}


async function swissFullLessons(browser, base, artifacts, local=false) {
  for(const [width,height] of [[1440,900],[390,844]]){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      if(local) await page.context().setOffline(true);
      const landing=local?pathToFileURL(path.join(root,'index.html')).href:base;
      await page.goto(landing+'?rm=1');
      assert.equal(await page.locator('.grid .card').count(),4,'four-explainer landing page');
      assert(!page.url().includes('end-to-end-swiss'),'homepage does not redirect');
      const swiss=local?pathToFileURL(path.join(root,'end-to-end-swiss/index.html')).href:base+'end-to-end-swiss/index.html';
      await ready(page,swiss+'?rm=1#s-7','window.THREE && document.querySelector("#heroCanvas").width > 300');
      assert.equal(await page.locator('.stage-detail').count(),12);
      assert.equal(await page.locator('.technical-detail').count(),34);
      assert.equal(await page.locator('.step').count(),43);
      assert.equal(await page.locator('.stage-detail > summary,.technical-detail > summary').count(),0,'no forced expansion');
      const stage=page.locator('#s-7');
      await stage.locator('input[name="kvMode7"]').first().scrollIntoViewIfNeeded();
      assert(await stage.locator('input[name="kvMode7"]').first().isVisible(),'controls shown directly');
      assert(await stage.locator('.technical-detail .spec').first().isVisible(),'technical specifications shown directly');
      await page.addScriptTag({path:axePath});
      const violations=await page.evaluate(async()=>(await axe.run(document,{
        runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}
      })).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
      assert.deepEqual(violations,[],'full lesson accessibility');
      await page.screenshot({path:path.join(artifacts,'Swiss-full-'+(local?'file-':'')+width+'.png')});
      await page.locator('.playback-options > summary').click();
      await page.locator('#runHero').click();
      assert.equal(await page.locator('#runHero').getAttribute('aria-pressed'),'true');
      await page.locator('.playback-options > summary').click();
      await page.waitForFunction(()=>document.querySelector('#runHero').getAttribute('aria-pressed')==='false');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.deepEqual(errors,[]);
      console.log('Swiss',local?'file':'HTTP',width,'full lessons and four-way landing pass');
    }finally{await page.close();}
  }
}
async function depthWithoutScript(browser,base){
  const page=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
  try{
    await page.goto(base+'end-to-end-swiss/index.html');
    const stage=page.locator('#s-7');
    assert(await stage.locator('.step').first().isVisible());
    assert(await stage.locator('.technical-detail .spec').first().isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    console.log('Swiss full lessons visible without JavaScript');
  }finally{await page.close();}
}

async function tokenInstrument(browser, base, artifacts) {
  for (const [width, height, motion] of [[1440,900,'no-preference'],[390,844,'no-preference'],[1440,900,'reduce'],[390,844,'reduce']]) {
    const page = await browser.newPage({viewport:{width,height},reducedMotion:motion});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await ready(page, base + 'end-to-end-swiss/index.html', 'window.THREE && document.querySelector("#heroCanvas").width > 300');
      assert.equal(await page.locator('#exploreToken').count(), 1, 'instrument has a visible starting action');
      const scene = await page.locator('#heroGL').boundingBox();
      assert(scene.height >= height * .4, 'the artifact leads the first viewport');
      const initialScroll = await page.evaluate(() => scrollY);
      await page.locator('#exploreToken').click();
      await page.waitForFunction(() => document.querySelector('#instrumentStage').textContent === 'Corpus');
      await page.locator('#axis').evaluate(el => {
        el.value='650';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.waitForFunction(() => document.querySelector('#instrumentStage').textContent === 'Forward pass');
      if(width===390){
        assert(await page.locator('#railOut').isVisible(), 'phone keeps the current stage visible');
        assert.match(await page.locator('#railOut').textContent(), /Forward pass/);
      }
      assert(Math.abs(await page.evaluate(() => scrollY) - initialScroll) < 4, 'hero scrubbing stays with the artifact');
      assert.match(await page.locator('#instrumentForm').textContent(), /vector/);
      await page.locator('#axis').press('End');
      await page.waitForFunction(() => !document.querySelector('#instrumentReply').hidden);
      assert.match(await page.locator('#instrumentReply').textContent(), /Paris/);
      assert(await page.locator('#nextStage').isDisabled());
      await page.screenshot({path:path.join(artifacts,'Swiss-instrument-arrival-'+motion+'-'+width+'.png')});
      await page.locator('#axis').press('Home');
      await page.waitForFunction(() => document.querySelector('#instrumentReply').hidden);
      assert(await page.locator('#previousStage').isDisabled());
      if(width===1440&&motion==='no-preference'){
        await page.waitForFunction(() => document.querySelector('#heroGL').getAnimations().length===0);
        await page.waitForTimeout(200);
        const idle=await page.evaluate(async()=>{
          const original=requestAnimationFrame;let callbacks=0;
          window.requestAnimationFrame=fn=>original(t=>{callbacks++;fn(t);});
          try{await new Promise(resolve=>setTimeout(resolve,400));return callbacks;}
          finally{window.requestAnimationFrame=original;}
        });
        assert.equal(idle,0,'settled instrument does not keep an idle render loop');
      }
      await page.locator('#nextStage').click();
      await page.waitForFunction(() => document.querySelector('#instrumentStage').textContent === 'Corpus');
      await page.locator('#previousStage').click();
      await page.locator('#readJourney').click();
      await page.waitForFunction(() => scrollY>0&&document.querySelector('#heroGL').getBoundingClientRect().bottom<innerHeight*.45);
      await page.locator('#axis').evaluate(el => {
        el.value='650';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.waitForFunction(() => document.querySelector('#railOut').textContent.includes('Forward pass'));
      if(width===390) assert(await page.locator('#railOut').isVisible(), 'stage context stays visible on the written route');
      assert(await page.locator('#s-7 .step').first().isVisible(),'written steps remain visible');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
      assert.deepEqual(errors,[]);
      console.log('Swiss instrument',width,motion,'scrub, keyboard, arrival, step bounds and reading continuity passed');
    } finally {await page.close();}
  }
}

async function instrumentFallback(browser, base, artifacts) {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.addInitScript(()=>{
      Element.prototype.animate=undefined;
      const getContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,...args){
        return /webgl/i.test(kind)?null:getContext.call(this,kind,...args);
      };
    });
    await page.goto(base+'end-to-end-swiss/index.html');
    await page.waitForFunction(()=>document.documentElement.classList.contains('no-gl'));
    assert(await page.locator('.instrument-fallback').isVisible());
    await page.locator('#exploreToken').click();
    await page.waitForFunction(()=>document.querySelector('#instrumentStage').textContent==='Corpus');
    await page.locator('#axis').press('End');
    await page.waitForFunction(()=>!document.querySelector('#instrumentReply').hidden);
    await page.screenshot({path:path.join(artifacts,'Swiss-instrument-static-fallback.png')});
    await page.locator('#readJourney').click();
    assert(await page.locator('#s-1 .step').first().isVisible(),'fallback text remains visible');
    assert.deepEqual(errors,[]);
    console.log('Swiss phone instrument and text work without WebGL or Web Animations');
  }finally{await page.close();}
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
    // One 53-frame p95 is its third-worst frame, so a single runner hiccup decides it (CI
    // measured 82 ms and 138 ms on the same commit). Judge the median of five trials.
    const report = await frame.evaluate(async trials => {
      const api = window.obs;
      const gl = document.querySelector('canvas').getContext('webgl2') || document.querySelector('canvas').getContext('webgl');
      const basePose = api.getPose(), p95s = [];
      for (let trial = 0; trial < trials; trial++) {
        const samples = [];
        for (let i = 0; i < 65; i++) {
          const start = performance.now();
          api.setPose({pos: [basePose.pos[0] + Math.sin(i * .12) * .45, ...basePose.pos.slice(1)], target:basePose.target}, {fly:false});
          api.renderNow();
          gl.finish();
          await new Promise(requestAnimationFrame);
          if (i >= 12) samples.push(performance.now() - start);
        }
        samples.sort((a,b) => a-b);
        p95s.push(+samples[Math.ceil(.95 * samples.length) - 1].toFixed(1));
        await new Promise(r => setTimeout(r, 300));
      }
      await new Promise(r => setTimeout(r, 600));
      const stats = api.stats();
      await new Promise(r => setTimeout(r, 900));
      const median = [...p95s].sort((a,b) => a-b)[Math.floor(p95s.length / 2)];
      return {adapter:stats.quality.renderer, pixels:stats.quality.buffer, calls:stats.renderer.calls,
        p95:median, trialP95s:p95s, idleFrames:api.stats().frames - stats.frames};
    }, WARP_TRIALS);
    console.log('Open router drawer', JSON.stringify({...report, cpus: os.cpus().length, budget: WARP_P95_BUDGET_MS}));
    assert.match(report.adapter, /Microsoft Basic Render Driver|WARP/i);
    assert(report.calls < 90, 'drawer draw-call budget');
    assert(report.p95 < WARP_P95_BUDGET_MS, 'WARP median p95 ' + report.p95.toFixed(1) + ' ms must be below ' + WARP_P95_BUDGET_MS + ' ms');
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
    if (runs('focus')) {
      await focusOrder(browser, base);
      await focusOrder(browser, base, true);
    }
    if (runs('sampling')) await samplingContract(browser, base);
    if (runs('claims')) await swissKVComparison(browser, base, artifacts);
    if (runs('depth')) {
      await swissFullLessons(browser, base, artifacts);
      await swissFullLessons(browser, base, artifacts, true);
      await depthWithoutScript(browser, base);
    }
    if (runs('instrument')) {
      await tokenInstrument(browser, base, artifacts);
      await instrumentFallback(browser, base, artifacts);
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
