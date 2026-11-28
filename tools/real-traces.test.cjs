'use strict';

// Schema and invariants for shared/real-traces.js, the measured router traces the MoE lab's
// "Real trace" view draws. Regenerate the file with tools/extract-real-traces.py, never by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, statSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'shared', 'real-traces.js');
const MAX_BYTES = 25000;
const PROMPTS = ['The cat sat on the mat', 'The Eiffel Tower is in Paris.', "What's the weather in Paris?", 'def fib(n): return n'];

function load() {
  const window = {};
  vm.runInNewContext(readFileSync(file, 'utf8'), {window});
  return window.RealMoETraces;
}

test('trace file stays a small classic script that sets window.RealMoETraces', () => {
  assert.ok(statSync(file).size < MAX_BYTES, `${statSync(file).size} bytes`);
  const src = readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /\b(import|export)\b\s|fetch\(|XMLHttpRequest|https?:\/\/(?!huggingface)/, 'no modules or network access');
  const T = load();
  assert.ok(T && Object.isFrozen(T) && Object.isFrozen(T.prompts[0].routes[0][0].e), 'deep-frozen data');
});

test('provenance and router geometry are recorded, not assumed', () => {
  const T = load();
  assert.match(T.modelId, /^[\w.-]+\/[\w.-]+$/);
  assert.match(T.revision, /^[0-9a-f]{40}$/);
  assert.match(T.extractedAt, /^\d{4}-\d{2}-\d{2}$/);
  for (const k of ['numLayers', 'numRouted', 'topK']) assert.ok(Number.isInteger(T[k]) && T[k] > 0, k);
  assert.ok(Number.isInteger(T.numShared) && T.numShared >= 0);
  assert.ok(T.topK < T.numRouted);
  assert.equal(T.scoring, 'softmax');
  assert.equal(typeof T.normTopK, 'boolean');
  assert.ok(T.layers.length > 0 && T.layers.every(l => Number.isInteger(l) && l >= 0 && l < T.numLayers));
  assert.deepEqual([...T.layers].sort((a, b) => a - b), [...T.layers], 'layers ascending');
  // The lab's simulated grid is V4-Pro's 384 experts; the real trace must never claim that geometry.
  assert.notEqual(T.numRouted, 384);
});

test('exactly the four canonical prompts, each token routed at every sampled layer', () => {
  const T = load();
  assert.deepEqual([...T.prompts.map(p => p.text)], PROMPTS); // spread: vm arrays have another realm's prototype
  for (const p of T.prompts) {
    assert.ok(p.tokens.length > 0, p.text);
    assert.equal(p.tokens.join(''), p.text, 'tokens rebuild the prompt (BOS excluded)');
    assert.equal(p.routes.length, p.tokens.length, p.text);
    for (const r of p.routes) assert.equal(r.length, T.layers.length, p.text);
  }
});

test('expert IDs are valid and distinct; shares sum to 1 within 1e-3; mass and entropy are bounded', () => {
  const T = load();
  const maxH = Math.log2(T.numRouted);
  for (const p of T.prompts) p.routes.forEach((byLayer, t) => byLayer.forEach((r, li) => {
    const at = `${p.text} token ${t} layer ${T.layers[li]}`;
    assert.equal(r.e.length, T.topK, at);
    assert.equal(r.w.length, T.topK, at);
    assert.ok(r.e.every(e => Number.isInteger(e) && e >= 0 && e <= T.numRouted - 1), at);
    assert.equal(new Set(r.e).size, T.topK, at + ' distinct experts');
    assert.ok(Math.abs(r.w.reduce((s, w) => s + w, 0) - 1) <= 1e-3, at + ' shares sum');
    assert.ok(r.w.every((w, i) => w >= 0 && (i === 0 || w <= r.w[i - 1] + 1e-9)), at + ' shares descend');
    // Top-k of a softmax over numRouted covers at least k/numRouted and at most all of it.
    assert.ok(r.m >= T.topK / T.numRouted - 1e-3 && r.m <= 1, at + ' mass');
    assert.ok(r.h >= 0 && r.h <= maxH + 1e-9, at + ' entropy');
  }));
});

test('every page with the labs loads the traces just before micro-labs.js; Swiss loads neither', () => {
  const root = path.join(__dirname, '..');
  for (const page of ['index.html', 'journey-tour/index.html', 'end-to-end-beamline/index.html', 'one-token/index.html', 'shared/obs-core.html']) {
    const html = readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<script src="(?:\.{1,2}\/shared\/)?real-traces\.js"><\/script><script src="(?:\.{1,2}\/shared\/)?micro-labs\.js"><\/script>/, page);
    // The BPE merge table is not a page script: micro-labs.js loads it the first time a tokenizer lab opens.
    assert.doesNotMatch(html, /bpe-merges/, page);
  }
  assert.match(readFileSync(path.join(root, 'shared', 'micro-labs.js'), 'utf8'), /'bpe-merges\.js'/);
  assert.doesNotMatch(readFileSync(path.join(root, 'end-to-end-swiss/index.html'), 'utf8'), /real-traces|bpe-merges|micro-labs/);
});

test('per-layer load counts every token assignment exactly once', () => {
  const T = load();
  const tokens = T.prompts.reduce((s, p) => s + p.tokens.length, 0);
  assert.equal(T.load.length, T.layers.length);
  T.load.forEach((counts, li) => {
    assert.equal(counts.length, T.numRouted);
    assert.equal(counts.reduce((s, c) => s + c, 0), tokens * T.topK, `layer ${T.layers[li]}`);
    const tally = new Array(T.numRouted).fill(0);
    for (const p of T.prompts) for (const r of p.routes) for (const e of r[li].e) tally[e] += 1;
    assert.deepEqual([...counts], tally, `layer ${T.layers[li]} load matches routes`);
  });
});
