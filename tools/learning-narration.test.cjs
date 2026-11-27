'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const inline = JSON.parse(html.match(/id="narration-manifest">(.*?)<\/script>/s)[1]);

test('inline narration manifest matches shared/journey-narration/manifest.json', () => {
  const shared = JSON.parse(fs.readFileSync(path.join(__dirname, '../shared/journey-narration/manifest.json'), 'utf8'));
  assert.deepEqual(inline, shared);
});

test('every Journey tour stop has narration: stations, release gate and stop 19 use the extra clips', () => {
  const slots = inline.extras.map(c => c.slot);
  assert.deepEqual(slots, ['station-1', 'station-2', 'station-3', 'station-4', 'station-5', 'release', 'step-20']);
  for (const c of inline.extras) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', c.src.replace(/^\.\.\//, ''))), c.src + ' exists');
    assert.ok(c.dur > 3 && c.cues.length && c.cues[0].t === 0, c.id + ' has a duration and cues from 0');
    assert.ok(c.cues.every((q, i) => i === 0 || q.t > c.cues[i - 1].t), c.id + ' cues are ordered');
  }
  assert.match(html, /const clip = s\.i === 19 \? extraBySlot\.get\('step-20'\) : clipByStop\.get\(s\.i\)/, 'stop 19 plays its frozen-weights clip, not the training recap');
});

test('Journey tour skips the retired training recap clip and keeps one clip per card', () => {
  const stops = inline.clips.filter(c => c.stop != null).map(c => c.stop);
  assert.equal(new Set(stops).size, stops.length, 'no two clips share a stop');
  assert.equal(inline.clips.find(c => c.stop === 19).id, '20-training');
  const narrated = inline.clips.filter(c => c.stop !== 19).reduce((sum, c) => sum + c.dur, 0);
  assert.equal(Math.round(narrated), 373, 'clip time shown before holds: 6:13');
});

test('removed top-bar controls are gone and the tour exposes its API hooks', () => {
  for (const id of ['storyDepthBtn', 'storyPresentBtn', 'narrRun', 'topStudioBtn', 'trainLinePlay', 'trainLineNarrate']) {
    assert.equal(html.includes('id="' + id + '"'), false, id + ' removed');
  }
  assert.match(html, /window\.JourneyTour = /);
  for (const event of ['tour:stop', 'tour:finale']) assert.ok(html.includes("'" + event + "'"), event + ' dispatched');
});
