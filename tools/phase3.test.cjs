const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('journey-story Ch 4 & 5 use non-overlapping .has-room split/stacked layout', () => {
  const html = read('index.html');
  assert.match(html, /\.s4-draw\.has-room\{\s*display:grid;\s*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(html, /\.stage\.has-room:not\(#stage4\)\{\s*display:grid;/);
  assert.match(html, /@media\(max-width:1023px\)\{[\s\S]*?\.s4-draw\.has-room\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(html, /c\.stage\.classList\.add\(isRoom\s*\?\s*'has-room'\s*:\s*'has-tile'\)/);
});

test('end-to-end-beamline exposes Watch vs Study mode switch and camera angle presets', () => {
  const html = read('end-to-end-beamline/index.html');
  assert.match(html, /id="watchModeBtn"/);
  assert.match(html, /id="studyBtn"/);
  assert.match(html, /id="camBar"/);
  assert.match(html, /html\.watch-mode \.step \.eq/);
  assert.match(html, /html\.watch-mode\.narrating \.step p\{display:none\}/);
  assert.match(html, /html\.study \.study-note\{display:block\}/);
  for (const preset of ['director', 'wide', 'close', 'overhead']) {
    assert.match(html, new RegExp(`data-cam="${preset}"`));
  }
});

test('end-to-end-swiss preserves clean visuals while fixing axis crowding and label clamping', () => {
  const html = read('end-to-end-swiss/index.html');
  assert.doesNotMatch(html, /micro-labs/);
  assert.doesNotMatch(html, /study-note/);
  assert.doesNotMatch(html, /cam-bar/);
  assert.match(html, /\.ticks li\.crowded a\{opacity:0;pointer-events:none\}/);
  assert.match(html, /function layoutTicks\(\)/);
  assert.match(html, /max-width:calc\(100% - 24px\)/);
});

test('journey-tour Stops 10, 11, 12 assign three distinct TR-5 sub-poses defined in obs-core', () => {
  const tour = read('journey-tour/index.html');
  const core = read('shared/obs-core.html');
  const m = tour.match(/const STOPS=(\[.*?\]);/s);
  assert.ok(m, 'STOPS array found in journey-tour');
  const stops = JSON.parse(m[1]);
  const s10 = stops[9], s11 = stops[10], s12 = stops[11];
  assert.equal(s10.ids[0], 'TR-5');
  assert.equal(s11.ids[0], 'TR-5');
  assert.equal(s12.ids[0], 'TR-5');
  const subposes = [s10.pose?.subpose, s11.pose?.subpose, s12.pose?.subpose];
  assert.deepEqual(subposes, ['grpo', 'verifier', 'opd']);
  assert.equal(new Set(subposes).size, 3);
  for (const sp of subposes) {
    assert.match(core, new RegExp(`'TR-5:${sp}'\\s*:\\s*\\{`));
  }
});
