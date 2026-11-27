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

test('Journey tour skips the retired training recap clip and keeps one clip per card', () => {
  assert.match(html, /const clip = s\.i === 19 \? null : clipByStop\.get\(s\.i\)/, 'stop 19 is held silently, not narrated');
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
