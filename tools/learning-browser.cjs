'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

async function verifyLearning(browser, base, artifacts) {
  for (const width of [1440, 390]) {
    for (const [name, route, count, lossId] of [
      ['journey', '', 30, 'step-6'], ['reader', 'one-token/', 43, 'step-3.2']
    ]) {
      const page = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'reduce'});
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      try {
        await page.goto(base + route);
        await page.waitForFunction(() => (window.__journey && window.__ready) || window.OneToken);
        await page.waitForFunction(() => [...document.querySelectorAll('.learning-card details.micro-lab')].every(lab => lab.open && lab.querySelector('.ml-body')));
        assert.equal(await page.locator('body').getAttribute('data-depth'), 'deep');
        assert.equal(await page.locator('.learning-toggle').count(), count);
        assert.equal(await page.locator('.learning-toggle[aria-expanded="true"]').count(), count);
        const card = page.locator('[id="' + lossId + '"]');
        const input = card.locator('.learning-loss input');
        await input.fill('50');
        assert.equal(await card.locator('.learning-equation strong').last().textContent(), '0.693');
        await input.focus();
        await input.press('ArrowRight');
        assert.equal(await input.inputValue(), '51', 'keyboard changes the math, not the lesson');
        assert.equal(await card.locator('.learning-equation strong').last().textContent(), '0.673');
        const point = await card.locator('.learning-dot').getAttribute('cx');
        await input.fill('90');
        assert.equal(await card.locator('.learning-equation strong').last().textContent(), '0.105');
        assert.notEqual(await card.locator('.learning-dot').getAttribute('cx'), point, 'graphic responds to probability');
        await card.locator('.learning-toggle').click();
        assert.equal(await input.isVisible(), false);
        await card.locator('.learning-toggle').click();
        assert.equal(await input.inputValue(), '90', 'collapsing keeps the learner’s value');
        const summary = card.locator('.learning-loss > summary');
        await summary.click();
        // A new node in another lab must not reopen a lab the learner collapsed.
        await card.evaluate(node => node.append(document.createElement('span')));
        await page.waitForTimeout(100);
        assert.equal(await card.locator('.learning-loss').evaluate(node => node.open), false);
        await summary.click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        if (name === 'journey') {
          await page.waitForFunction(() => window.__journey.state.active === 5);
          assert.equal(await page.evaluate(() => document.querySelector('#obsFrame').contentWindow.obs.stats().realm), 'MODEL', 'training scene must not show serving stations');
          assert.equal(await page.evaluate(() => document.documentElement.dataset.journeyPhase), 'training', 'phase CSS stays in training during Ch 2');
          assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('obsEngine')).display), 'none', 'Observatory is hidden in early training chapters');
          assert.equal(await page.locator('[data-slot-id="braid-opening"]').getAttribute('data-overview'), null);
          assert.equal(await page.locator('[data-slot-id="braid-opening"]').getAttribute('data-engine'), 'diagram');
          assert.equal(await page.locator('[data-slot-id="ch2-diagram"]').getAttribute('data-engine'), 'diagram');
          const pose2 = Number(await page.locator('[data-slot-id="ch2-diagram"]').getAttribute('data-diagram-pose'));
          assert(pose2 >= 2 && pose2 < 3, 'Ch 2 diagram pose stays in Station 3 pretraining');
          // Opening training scrubber caps strictly at Station 5 (Frozen θ*) before Station 6 Request.
          await page.locator('#trainLineRange').fill('100');
          await page.locator('#trainLineRange').dispatchEvent('input');
          assert.equal(await page.locator('[data-slot-id="braid-opening"]').getAttribute('data-step'), '5.3');
          assert(Number(await page.locator('[data-slot-id="braid-opening"]').getAttribute('data-diagram-pose')) <= 4.92, 'opening training scrubber never crosses into Station 6 Request');
          assert.equal(await page.locator('#ch4 .step[data-mode="train"]').count(), 0);
          assert.equal(await page.locator('#ch4 [data-tb="w"]').textContent(), 'frozen');
          assert.equal(await page.evaluate(() => {
            const release = document.querySelector('#inference-transition');
            const post = document.querySelector('#ch3'), inference = document.querySelector('#ch4');
            return Boolean(post.compareDocumentPosition(release) & Node.DOCUMENT_POSITION_FOLLOWING) &&
              Boolean(release.compareDocumentPosition(inference) & Node.DOCUMENT_POSITION_FOLLOWING);
          }), true, 'post-training precedes release and inference');
        } else {
          assert.equal(await page.locator('#s-1 details[data-lab="cache"], #s-2 details[data-lab="cache"], #s-3 details[data-lab="cache"], #s-4 details[data-lab="cache"], #s-5 details[data-lab="cache"]').count(), 0);
          await page.locator('#reader-inference-transition').scrollIntoViewIfNeeded();
        }
        // Interactive handover transition swaps cleanly across training -> freeze -> inference.
        const handover = page.locator(name === 'journey' ? '#inference-transition .learning-handover' : '#reader-inference-transition .learning-handover');
        await handover.scrollIntoViewIfNeeded();
        assert.equal(await handover.getAttribute('data-phase'), 'infer');
        await handover.locator('button[data-phase="train"]').click();
        assert.equal(await handover.getAttribute('data-phase'), 'train');
        assert.match(await handover.locator('.learning-handover-readout strong').first().textContent(), /updating/i);
        await handover.locator('button[data-phase="infer"]').click();
        assert.equal(await handover.getAttribute('data-phase'), 'infer');
        assert.match(await handover.locator('.learning-handover-readout strong').first().textContent(), /frozen/i);
        // GRPO interactive verifier recomputes group advantage live.
        const grpo = page.locator(name === 'journey' ? '#step-11 .learning-grpo' : '#step-4\\.2 .learning-grpo');
        await grpo.scrollIntoViewIfNeeded();
        const muBefore = await grpo.locator('.learning-equation strong').first().textContent();
        await grpo.locator('.learning-chip').first().click();
        assert.notEqual(await grpo.locator('.learning-equation strong').first().textContent(), muBefore, 'GRPO verifier button updates mean and advantage');
        if (name === 'journey') {
          await page.locator('#step-28').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => document.documentElement.dataset.journeyPhase === 'inference');
          assert.equal(await page.locator('[data-slot-id="ch6-spatial"]').getAttribute('data-engine'), 'spatial');
          assert.equal(await page.locator('[data-slot-id="ch6-spatial"]').getAttribute('data-step'), '12.1');
          assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('obsEngine')).display), 'none', 'Observatory stays off during Ch 6 Beamline tool loop');
          await page.locator('#observatory-sandbox').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => document.documentElement.dataset.journeyPhase === 'observatory');
          await page.waitForFunction(() => document.getElementById('obsEngine').classList.contains('sandbox'));
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await input.scrollIntoViewIfNeeded();
        await page.screenshot({path: path.join(artifacts, name + '-expanded-' + width + '.png')});
        assert.deepEqual(errors, []);
        console.log(name, width, 'expanded cards, live math, keyboard, collapse persistence and training-first sequence passed');
      } finally { await page.close(); }
    }
  }

  // Motion-enabled downward scroll barrier: cannot scroll down past a stage until its animation finishes (100%).
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'no-preference'});
  const lockErrors = [];
  page.on('pageerror', err => lockErrors.push(err.message));
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.__journey && window.__ready && window.__stageLock);
    await page.mouse.move(720, 450);
    // Attempt to scroll far down the page; downward scroll must stop right at the opening training barrier and start playing.
    await page.evaluate(() => window.scrollTo(0, 8000));
    await page.waitForFunction(() => window.__stageLock.state.active && window.__stageLock.state.id === 'opening');
    const lockState = await page.evaluate(() => window.__stageLock.state);
    assert.equal(await page.locator('#stageLockHud').isVisible(), true);
    // Further downward wheeling cannot advance scrollY past barrierY while incomplete.
    await page.mouse.wheel(0, 2400);
    const poseStart = Number(await page.locator('[data-slot-id="braid-opening"]').getAttribute('data-diagram-pose'));
    await page.waitForTimeout(260);
    const midState = await page.evaluate(() => ({y: Math.round(scrollY), lock: window.__stageLock.state}));
    const poseMid = Number(await page.locator('[data-slot-id="braid-opening"]').getAttribute('data-diagram-pose'));
    assert(midState.y <= lockState.barrierY + 2, 'downward scroll cannot pass barrierY before completion');
    assert(poseMid > poseStart + 0.05, 'locked animation plays automatically');
    // Upward scrolling IS allowed while incomplete, and returning resumes from saved progress.
    await page.mouse.wheel(0, -320);
    await page.waitForTimeout(120);
    assert(await page.evaluate(() => scrollY) < lockState.barrierY - 40, 'upward scroll remains free');
    await page.evaluate(y => window.scrollTo(0, y), lockState.barrierY);
    // Wait for the opening animation (~3.8s total) to finish 100%, which unlocks downward scroll to Chapter 1.
    await page.waitForFunction(() => window.__stageLock.state.completed.includes('opening'), null, {timeout: 8000});
    assert.equal(await page.locator('[data-slot-id="braid-opening"]').getAttribute('data-step'), '5.3');
    // Now downward scrolling advances past the opening stage and stops at Chapter 1's barrier until Ch 1 completes.
    await page.evaluate(() => window.scrollTo(0, 8000));
    await page.waitForFunction(() => window.__stageLock.state.active && window.__stageLock.state.id === 'ch0');
    assert(await page.evaluate(() => scrollY) > lockState.barrierY + 200, 'downward scroll unlocked after opening stage completed');
    assert.deepEqual(lockErrors, []);
    console.log('journey 1440 downward scroll barrier until animation completion passed');
  } finally { await page.close(); }
  await verifyLabFeedback(browser, base);
}
// Change feedback: one shared helper (MicroLabs.flash) pulses the dependent element in orange, then settles.
async function verifyLabFeedback(browser, base) {
  const ORANGE = 'rgb(229, 103, 47)', ORANGE_HI = 'rgb(242, 166, 90)';
  for (const motion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: motion});
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    try {
      await page.goto(base);
      await page.waitForFunction(() => window.__journey && window.__ready);
      const card = page.locator('#step-15');
      await card.scrollIntoViewIfNeeded();
      const lab = card.locator('details[data-lab="kv"]');
      await page.waitForFunction(() => document.querySelector('#step-15 details[data-lab="kv"] .ml-body'));
      // Every lab on the Journey states what to try and why it matters.
      const bare = await page.evaluate(() => [...document.querySelectorAll('details.micro-lab, section.component-math')]
        .filter(l => !l.querySelector('.ml-try') || !l.querySelector('.ml-why')).map(l => l.dataset.lab || l.className));
      assert.deepEqual(bare, [], 'labs missing Try this / Why it matters');
      const probe = () => lab.evaluate(node => {
        const value = node.querySelector('.ml-value'), readout = node.querySelector('.ml-readout');
        const style = getComputedStyle(value), ro = getComputedStyle(readout);
        return {cls: value.className, anim: style.animationName, bg: style.backgroundColor, color: style.color, roCls: readout.className, roAnim: ro.animationName, roBg: ro.backgroundColor};
      });
      await lab.locator('input[type=range]').fill('19');
      await page.waitForTimeout(40);
      const during = await probe();
      assert.match(during.cls, /is-changed/, 'changing the slider flags the value');
      assert.match(during.roCls, /is-changed/, 'and the dependent readout');
      if (motion === 'reduce') {
        assert.equal(during.anim, 'none', 'reduced motion: no animation');
        assert.equal(during.bg, ORANGE, 'reduced motion: static orange highlight');
        assert.equal(during.roBg, ORANGE);
      } else {
        assert.equal(during.anim, 'ml-flash', 'motion: eased pulse');
        assert.equal(during.roAnim, 'ml-flash');
      }
      await page.waitForTimeout(900);
      const after = await probe();
      assert.doesNotMatch(after.cls, /is-changed/, 'class removed after the animation');
      assert.doesNotMatch(after.roCls, /is-changed/);
      assert.equal(after.bg, ORANGE_HI, 'the current value settles to the selected orange');
      assert.equal(after.color, 'rgb(27, 18, 9)', 'ink text on orange');
      // A chosen option is orange too (attention token button).
      const attention = page.locator('#step-14 details[data-lab="attention"]');
      await attention.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#step-14 details[data-lab="attention"] .ml-body'));
      await attention.locator('.ml-tokens button').first().click();
      await page.waitForTimeout(900);
      assert.equal(await attention.locator('.ml-tokens button[aria-pressed="true"]').evaluate(b => getComputedStyle(b).backgroundColor), ORANGE_HI);
      assert.deepEqual(errors, []);
      console.log('lab change feedback (' + motion + ') passed');
    } finally { await page.close(); }
  }
}
module.exports = {verifyLearning, verifyLabFeedback};
