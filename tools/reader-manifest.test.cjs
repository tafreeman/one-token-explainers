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

// Caption-only factual corrections. The MP3s and all unlisted source text stay unchanged.
const captionCorrections = {
  '2d': {
    0: 'Context extension can be applied to a pretrained model.',
    3.68: 'In the representative config, position rescaling extends addressable positions from sixty-five thousand, five hundred and thirty-six to one million, forty-eight thousand, five hundred and seventy-six.',
  },
  '3c': {
    0: 'For behavior no test can check, model judgments guided by a written constitution can train a preference model.',
    8.56: 'A KL penalty to the frozen reference model, the outline on the left, discourages drift.',
  },
  '3d': {
    0: 'Reinforcement can train reasoning when answers can be verified.',
    2.64: "Verified reasoning can earn reward during post-training; Fable five point two's exact training recipe is private.",
  },
  '4c': {
    0: 'With caching enabled, an eligible unchanged live prefix may be reused.',
    5.76: 'The doubled track is the prefix eligible for reuse.',
    8.56: 'On a cache hit, only the rest has to be computed.',
  },
  '5c': {7.12: 'Thicker arcs mean more weight, and the neutral mask hides everything that comes after.'},
  '6b': {
    0: 'Fable five point two has adaptive thinking enabled on every turn.',
    8.4: 'Raw reasoning is not returned as readable text, which is why the hollow tiles stop short of your app.',
  },
  '6c': {9.147: 'The cache gains compressed state as generation continues, so earlier computation is not repeated.'},
  '6e': {0: 'Tokens can be decoded and streamed as server-sent events; output classifiers are a separate safeguard whose ordering is not set by the stream contract.'},
  '7c': {
    0: 'With caching enabled and an eligible live prefix, the unchanged request prefix may be reused.',
    6.48: "On a cache hit, the old Paris doesn't go up the tower again.",
    9.52: 'Then only the new part is computed.',
  },
  '7e': {2.36: 'With compaction enabled, nearing a configurable threshold summarizes earlier turns into one block so the run can continue.'},
  '09-think': {12.56: 'Raw reasoning is not returned as readable text.'},
  '12-tool-loop': {8.747: 'The whole conversation goes back in; with caching enabled and an eligible live prefix, its unchanged prefix may be reused.'},
};

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

test('the two audio tracks retain source order, cue timing, local MP3s and only listed caption corrections', () => {
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
      assert.equal(cues.length, original[index].cues.length, id);
      for (const [cueIndex, cue] of cues.entries()) {
        const sourceCue = original[index].cues[cueIndex];
        assert.equal(cue.t, sourceCue.t, id + ' cue time');
        assert.equal(cue.s, captionCorrections[id]?.[cue.t] ?? sourceCue.s, id + ' caption at ' + cue.t);
      }
      assert.ok(fs.statSync(path.resolve(root, 'one-token', src)).size > 0, id);
      assert.equal(cues[0].t, 0, id);
      assert.ok(cues.every(({ t, s }, i) => s.trim() && t < dur && (!i || t > cues[i - 1].t)), id);
    }
  }
});

test('source clip order stays independent of the written narrative route', () => {
  const full = Object.fromEntries(tracks.full.map(({ id, stepId }) => [id, stepId]));
  assert.deepEqual([full['4d'], full.p5], ['8.3', '7.1']); // Beamline source order is unchanged.
  assert.deepEqual([full['5b'], full['5c'], full['5d'], full['5e']], ['7.4', '7.2', '7.2', '7.3']);
  assert.deepEqual(tracks.quick.slice(1, -1).map(({ stepId }) => stepId), stages.map((_, i) => (i + 1) + '.1'));
});

test('narrative routes cover every source range exactly once in written stop order', () => {
  const stepIds = new Set(stops.map(({ id }) => id));
  for (const track of ['full', 'quick']) {
    const clips = tracks[track];
    const byId = new Map(clips.map(clip => [clip.id, clip]));
    const ranges = new Map(clips.map(clip => [clip.id, []]));
    for (const item of tracks.routes[track]) {
      const clip = byId.get(item.clip);
      assert.ok(clip, track + ' route references ' + item.clip);
      assert.ok(stepIds.has(item.stepId), item.clip + ' has a written step');
      assert.ok(beamlineBeats.includes(item.spatialBeat), item.clip + ' has a spatial beat');
      assert.ok(item.start >= 0 && item.end > item.start && item.end <= clip.dur, item.clip + ' range');
      ranges.get(item.clip).push([item.start, item.end]);
    }
    for (const clip of clips) {
      const owned = ranges.get(clip.id).sort((a, b) => a[0] - b[0]);
      assert.equal(owned[0][0], 0, clip.id + ' starts at zero');
      for (let index = 1; index < owned.length; index++) {
        assert.equal(owned[index][0], owned[index - 1][1], clip.id + ' has neither gaps nor overlap');
      }
      assert.equal(owned.at(-1)[1], clip.dur, clip.id + ' ends at its source duration');
    }
    const written = tracks.routes[track].filter(item => item.selectable).map(item => item.stepId)
      .filter((id, index, ids) => index === 0 || id !== ids[index - 1]);
    assert.deepEqual(written, stops.map(({ id }) => id), track + ' follows 1.1 through 12.4');
  }
});

test('route order and cue ownership match the written mechanisms', () => {
  const full = tracks.routes.full;
  const clipsAt = id => full.filter(item => item.selectable && item.stepId === id).map(item => item.clip);
  assert.deepEqual(clipsAt('7.2'), ['5c', '5d']);
  assert.deepEqual(clipsAt('7.4'), ['5b', '5f']);
  assert.deepEqual(clipsAt('12.2'), ['7b', '7c']);
  assert.deepEqual(clipsAt('8.3'), ['4d']);
  assert.deepEqual(['10.1', '10.2', '10.3', '10.4'].flatMap(clipsAt), ['6c', '6d', '6c', '6d']);
  assert.deepEqual(['11.1', '11.2', '11.3'].flatMap(clipsAt), ['6e', '6e', '6e']);

  const direct = (track, id) => tracks.routes[track].find(item => item.selectable && item.stepId === id);
  const owns = (track, id, time) => {
    const item = direct(track, id);
    assert.ok(item.start <= time && time < item.end, `${track} ${id} owns cue ${time}`);
  };
  owns('quick', '7.1', 8.347);
  assert.equal(direct('quick', '7.2').start, 11.867);
  assert.equal(direct('quick', '8.2').start, 6.16);
  assert.equal(direct('quick', '8.3').start, 14.64);
  assert.equal(direct('quick', '9.2').start, 12.56);
  assert.equal(direct('quick', '9.3').start, 15.6);
  assert.equal(direct('quick', '10.3').start, 9.707);
  assert.equal(direct('quick', '10.4').start, 14.107);
  assert.equal(direct('quick', '11.3').start, 10.533);
  owns('full', '10.4', 3.68);
  owns('full', '11.3', 6.56);
});

test('browser scripts expose the same data without fetching a manifest', () => {
  const context = vm.createContext({ window: {} });
  for (const file of ['shared/concept-map.js', 'shared/concept-links.js', 'one-token/narration-data.js', 'one-token/stops-manifest.js']) {
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
