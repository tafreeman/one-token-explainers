const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.resolve(root, file), 'utf8');
const manifest = require('../one-token/stops-manifest.js');
const { CONCEPTS } = require('../shared/concept-links.js');
const { stops, tracks, stages } = manifest;

const ids = (markup, pattern) => Array.from(markup.matchAll(pattern), (match) => match[1]);
const lesson = () => read('index.html');
const swiss = read('end-to-end-swiss/index.html');
const beamline = read('end-to-end-beamline/index.html');
const beamlineBeats = ids(beamline, /data-beat="([a-z0-9]+)"/g);
const embeddedClips = (source, id) =>
  JSON.parse(source.match(new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>'))[1]).clips;

test('reader lessons and selected mechanisms match the canonical stops', () => {
  const html = lesson();
  const articles = Array.from(html.matchAll(/<article\b[^>]*\bid="step-([\d.]+)"[^>]*\bdata-step="([\d.]+)"[^>]*>([\s\S]*?)<\/article>/g));
  assert.equal(stops.length, 43);
  assert.equal(stages.length, 12);
  assert.deepEqual(ids(html, /<section\b[^>]*\bid="s-(\d+)"/g), stages.map((_, i) => String(i + 1)));
  assert.deepEqual(articles.map(([, id]) => id), stops.map(({ id }) => id));
  assert.deepEqual(articles.map(([, , id]) => id), stops.map(({ id }) => id));
  assert.deepEqual(ids(swiss, /<h3><span class="sn">([\d.]+)<\/span>/g), stops.map(({ id }) => id));
  for (const [index, [, id, , body]] of articles.entries()) {
    const stop = stops[index];
    const stageNumber = Number(id.split('.')[0]);
    assert.equal(stop.stage, stageNumber);
    assert.ok(body.includes('<h3><span class="sn">' + id + '</span>' + stop.title + '</h3>'));
    assert.ok(beamlineBeats.includes(stop.spatialBeat), id);
    const [g0, g1] = stop.diagramPose;
    assert.ok(g0 >= stageNumber - 1 && g1 <= stageNumber && g1 > g0, id);
    assert.deepEqual(stop.glyphAxes, stages[stageNumber - 1].glyphAxes);
    assert.equal(stop.tokenForm, stages[stageNumber - 1].tokenForm);
    assert.deepEqual(ids(body, /data-inspect="([a-z0-9-]+)"/g), stop.conceptSlug ? [stop.conceptSlug] : []);
    if (stop.conceptSlug) {
      const concept = CONCEPTS[stop.conceptSlug];
      assert.equal(stop.labId, concept.lab);
      assert.deepEqual(stop.obsFocus, concept.obs);
    }
  }
  assert.deepEqual(stops.flatMap(({ conceptSlug }) => conceptSlug || []).sort(), Object.keys(CONCEPTS).sort());
});

test('reader contains all Swiss technical disclosures, controls and citations as static HTML', () => {
  const html = lesson();
  const technicalBlocks = /(<dl class="spec">[\s\S]*?<\/dl>|<pre class="eq">[\s\S]*?<\/pre>)/g;
  const controls = /(<input type="radio"[^>]+>)/g;
  const citations = /<section class="sources" id="sources"[\s\S]*?<\/section>/;
  const normalized = (source, pattern) => ids(source, pattern).map((part) => part.replace(/\s+/g, ' ').trim());
  assert.deepEqual(normalized(html, technicalBlocks), normalized(swiss, technicalBlocks));
  assert.deepEqual(ids(html, controls), ids(swiss, controls));
  const citedUrls = (source) => ids(source.match(citations)[0], /href="(https:\/\/[^"]+)"/g);
  assert.deepEqual(citedUrls(html), citedUrls(swiss));
});

test('the two audio tracks retain source order, cue timing and corresponding local MP3s', () => {
  const swissFileClips = JSON.parse(read('end-to-end-swiss/assets/narration/manifest.json')).clips;
  assert.deepEqual(embeddedClips(swiss, 'narration-manifest'), swissFileClips);
  const originals = [
    [tracks.full, embeddedClips(beamline, 'narration-data'), 'end-to-end-beamline', 45, 581.174],
    [tracks.quick, swissFileClips, 'end-to-end-swiss', 14, 278.017],
  ];
  const stepIds = new Set(stops.map(({ id }) => id));
  assert.deepEqual(tracks.full.map(({ id }) => id), beamlineBeats);
  for (const [clips, original, directory, count, duration] of originals) {
    assert.equal(clips.length, count);
    assert.equal(new Set(clips.map(({ id }) => id)).size, count);
    assert.ok(Math.abs(clips.reduce((seconds, clip) => seconds + clip.dur, 0) - duration) < 0.001);
    for (const [index, { id, src, dur, cues, stepId }] of clips.entries()) {
      assert.ok(stepIds.has(stepId), id);
      assert.equal(id, original[index].id);
      assert.equal(dur, original[index].dur);
      assert.equal(src, '../' + directory + '/' + original[index].src.replace(/^\.\//, ''));
      assert.deepEqual(cues, original[index].cues, id);
      assert.ok(fs.statSync(path.resolve(root, 'one-token', src)).size > 0, id);
      assert.equal(cues[0].t, 0, id);
      assert.ok(cues.every(({ t, s }, i) => s.trim() && t < dur && (!i || t > cues[i - 1].t)), id);
    }
  }
});

test('narrated mechanisms can follow an order that differs from the written lesson', () => {
  const full = Object.fromEntries(tracks.full.map(({ id, stepId }) => [id, stepId]));
  assert.deepEqual([full['4d'], full.p5], ['8.3', '7.1']); // Continuous batching precedes embedding in Beamline.
  assert.deepEqual([full['5b'], full['5c'], full['5d'], full['5e']], ['7.4', '7.2', '7.2', '7.3']);
  assert.deepEqual(tracks.quick.slice(1, -1).map(({ stepId }) => stepId), stages.map((_, i) => (i + 1) + '.1'));
});

test('browser scripts expose the same data without fetching a manifest', () => {
  const context = vm.createContext({ window: {} });
  for (const file of ['shared/concept-links.js', 'one-token/narration-data.js', 'one-token/stops-manifest.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.ReaderManifest)), manifest);
});

test('one-token/index.html redirects cleanly to the promoted root reader', () => {
  const stub = read('one-token/index.html');
  assert.match(stub, /url=\.\.\/index\.html/);
  assert.match(stub, /location\.replace\(new URL\('\.\.\/index\.html'/);
  const rootHtml = lesson();
  assert.ok(!/(?:href|src)="\.\.\//.test(rootHtml), 'root index.html must not contain ../ asset links');
  assert.ok(rootHtml.includes('./shared/obs-core.html?realm=MODEL'));
});

// Existing recording drift to reconcile with any targeted re-recording (audit W1/W5).
// Beamline 1d / Swiss 02: vision patches illustrate a separate multimodal path.
// Beamline 2d: verify actual training-length schedule separately from YaRN config arithmetic.
// Beamline 3c: AI feedback trains a preference model. 3d: Fable's training recipe is private.
// Beamline 4c/7c / Swiss 12: prefix identity alone does not guarantee an eligible cache hit.
// Beamline 6e: output moderation order is not established by the SSE contract.
// Beamline 7e: compaction must be enabled and its threshold is configurable.
