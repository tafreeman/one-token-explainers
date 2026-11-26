const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, statSync} = require('node:fs');
const path = require('node:path');
const lab = require('../shared/micro-labs.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
const root = path.resolve(__dirname, '..');

test('BPE consumes every byte once, preserves unknown scripts and reuses stable IDs', () => {
  for (const text of ['', ' The café 🚀', '你好 東京', ' a  a', '👩🏿‍💻', 'e\u0301', ' a\n\t"']) {
    const {ids} = lab.tokenize(text);
    assert.deepEqual(ids.flatMap(id => lab.pieces[id]), [...new TextEncoder().encode(text)]);
    assert.deepEqual(lab.tokenize(text).ids, ids);
  }
  const sample = lab.tokenize(' The The');
  assert.equal(sample.ids.length, 2);
  assert.equal(sample.ids[0], sample.ids[1]);
  assert.equal(lab.pieceLabel(lab.pieces[sample.ids[0]]), '␠The');
  assert.ok(sample.merges.every(m => m.count === 2));
});

test('teaching BPE agrees with an independent lowest-rank pair search', () => {
  const pieceId = new Map(lab.pieces.map((bytes, id) => [bytes.join(','), id]));
  const rank = new Map(lab.pieces.slice(256).map((bytes, i) => {
    const left = pieceId.get(bytes.slice(0, -1).join(','));
    return [left + ',' + bytes.at(-1), 256 + i];
  }));
  function reference(text) {
    const ids = [...new TextEncoder().encode(text)];
    for (;;) {
      let at = -1, best = Infinity;
      for (let i = 0; i < ids.length - 1; i++) {
        const candidate = rank.get(ids[i] + ',' + ids[i + 1]);
        if (candidate < best) {best = candidate; at = i;}
      }
      if (at < 0) return ids;
      ids.splice(at, 2, best);
    }
  }
  const samples = [' The', 'The', ' café!', ' café', ' sat', ' cat', ' Paris', 'the', '🚀', '你好', '東京', 'x', '  '];
  for (const a of samples) for (const b of samples) {
    assert.deepEqual(lab.tokenize(a + b).ids, reference(a + b), a + b);
  }
});

test('every SSE split preserves UTF-8 and only a complete blank line dispatches text', () => {
  const text = ' The café 🚀\n你好 "data:"';
  const total = lab.streamPrefix(text, 0).length;
  const pending = new Set();
  for (let at = 0; at <= total; at++) {
    const state = lab.streamPrefix(text, at);
    pending.add(state.pending);
    assert.equal(state.value, at === total ? text : null);
    assert.equal(state.delivered, at === total);
    assert.equal(state.prefix.includes('\uFFFD'), false);
  }
  assert.deepEqual([...pending].sort(), [0, 1, 2, 3]);
});

test('scaled causal softmax normalizes each visible prefix and masks all future keys', () => {
  const weights = lab.attention([[2, 0], [1, 0]], [[1, 0], [0, 1]]);
  assert.deepEqual(weights[0], [1, 0]);
  close(weights[1][0], 1 / (1 + Math.exp(-1 / Math.sqrt(2))));
  lab.attention().forEach((row, i) => {
    close(row.reduce((a, b) => a + b), 1);
    assert.ok(row.slice(i + 1).every(x => x === 0));
  });
});

test('RoPE phase and dot product depend on relative position', () => {
  close(lab.rope(8, 3).dot, lab.rope(11, 6).dot);
  close(lab.rope(3, 9).phase, -Math.PI / 2);
  close(lab.rope(4, 4).dot, 1);
});

test('KV geometry, units and published 1M endpoint stay distinct', () => {
  let last = 0;
  for (let exponent = 12; exponent <= 20; exponent++) {
    const length = 2 ** exponent, v = lab.kvFootprints(length);
    assert.equal(v.mha / v.gqa, 16);
    assert.equal(v.mla, length * 768);
    assert.ok(v.v4 > last && v.v4 < v.mla);
    last = v.v4;
    if (length < lab.maxContext) assert.equal(v.flopRatio, null);
    else {close(v.v4 / v.mla, .1); assert.equal(v.flopRatio, .27);}
  }
});

test('router normalizes original affinities across distinct selected slots', () => {
  for (const k of [1, 3, 6, 8]) for (const bias of [0, .4, 1]) for (const offset of [0, 29, 383]) {
    const entries = lab.routeExperts(k, bias, offset);
    assert.equal(new Set(entries.map(e => e.id)).size, k);
    assert.ok(entries.every(e => e.id >= 0 && e.id < 384 && e.weight > 0));
    close(entries.reduce((s, e) => s + e.weight, 0), 1);
  }
  const zero = lab.routeExperts(6, 0), balanced = lab.routeExperts();
  assert.ok(zero.every(e => e.hot)); assert.ok(balanced.every(e => !e.hot));
  assert.deepEqual(balanced.map(e => e.id), [12, 74, 141, 206, 279, 348]);
  assert.equal(new Set(balanced.map(e => e.weight)).size, 6);
  close(zero[0].weight / zero[1].weight, .99 / (.99 - .028));
});

test('ridge uses the bandwidth and dense peak of a single GPU', () => {
  const r = lab.roofline(4096, 1);
  assert.equal(r.ridge, 1250);
  assert.equal(r.prefill.pflops, 10); assert.equal(r.prefill.bound, 'compute');
  assert.equal(r.decode.bound, 'HBM bandwidth');
  assert.ok(lab.roofline(4096, 128).decode.intensity > r.decode.intensity);
  assert.equal(lab.roofline(4096, 1024).decode.bound, 'compute');
});

test('Guided Tour and Story offer the same component labs at all twelve lab stops', () => {
  const expected = {
    3: ['bpe'], 4: ['bpe'], 11: ['kl'], 14: ['attention', 'rope'], 15: ['kv'],
    16: ['mix'], 17: ['moe'], 23: ['pd'], 24: ['roof'], 25: ['roof'], 26: ['stream'], 30: ['cache']
  };
  assert.deepEqual(lab.tourStops, expected);
  assert.deepEqual(lab.storyStops, expected);
});

test('UTF-8 buffer-off mode corrupts split multi-byte emoji into U+FFFD while buffered mode stays clean', () => {
  const text = ' The café 🚀';
  const raw = new TextEncoder().encode('data: ' + JSON.stringify({text}));
  const emojiStart = raw.findIndex(b => b >= 240);
  assert.ok(emojiStart > 0);
  const safe = lab.streamPrefix(text, emojiStart + 2, true);
  const broken = lab.streamPrefix(text, emojiStart + 2, false);
  assert.equal(safe.corrupted, false);
  assert.equal(safe.prefix.includes('\uFFFD'), false);
  assert.equal(broken.corrupted, true);
  assert.equal(broken.prefix.includes('\uFFFD'), true);
});

test('MoE capacity factor preserves routed+dropped conservation and drops tokens on λ=0 collapse', () => {
  const balanced = lab.moeCapacity(6, 1);
  const collapsed = lab.moeCapacity(6, 0);
  assert.equal(balanced.routed + balanced.dropped, balanced.total);
  assert.equal(balanced.dropped, 0);
  assert.equal(collapsed.routed + collapsed.dropped, collapsed.total);
  assert.ok(collapsed.dropped > 0);
});

test('capacity counts actual expert assignments across the 384-expert batch', () => {
  for (const k of [1, 3, 6, 8]) for (const bias of [0, .3, .44, .45, .5, 1]) {
    const s = lab.moeCapacity(k, bias);
    const expected = Array(384).fill(0);
    for (let token = 0; token < 24; token++) {
      for (const {id} of lab.routeExperts(k, bias, token)) expected[id]++;
    }
    assert.equal(s.capPerExpert, Math.ceil(1.25 * 24 * k / 384));
    assert.deepEqual(s.loads, expected);
    assert.equal(s.total, expected.reduce((a, b) => a + b, 0));
    assert.equal(s.dropped, expected.reduce((n, load) => n + Math.max(0, load - s.capPerExpert), 0));
    assert.equal(s.routed + s.dropped, s.total);
  }
  assert.equal(lab.moeCapacity(6, 0).dropped, 138);
  assert.equal(lab.moeCapacity(6, 1).dropped, 0);
  const empty = lab.moeCapacity(6, 1, 1.25, 0);
  assert.equal(empty.total, 0); assert.equal(empty.hotShare, 0);
});

test('Prefix cache hit rate collapses on token 1 edit and is monotonic across edit position', () => {
  const warm = lab.prefixCache(null);
  const bust = lab.prefixCache(0);
  const mid = lab.prefixCache(10);
  close(warm.hitRate, 0.95);
  assert.equal(bust.hitRate, 0);
  assert.ok(bust.ttftMs > mid.ttftMs && mid.ttftMs > warm.ttftMs);
  assert.ok(bust.hitRate < mid.hitRate && mid.hitRate < warm.hitRate);
});

test('PD-disaggregation off models 64K prefill stall spiking decode ITL', () => {
  const sep = lab.pdSchedule(true, 64);
  const coloc = lab.pdSchedule(false, 64);
  assert.equal(sep.stallMs, 0);
  assert.equal(sep.peakItlMs, sep.baseItlMs);
  assert.ok(coloc.stallMs > 200 && coloc.peakItlMs > coloc.baseItlMs * 10);
  for (const s of [sep, coloc]) {
    const gaps = s.decodeTimesMs.slice(1).map((t, i) => t - s.decodeTimesMs[i]);
    assert.equal(Math.max(...gaps), s.peakItlMs);
    assert.equal(s.prefillStartMs, 36);
    assert.ok(s.decodeTimesMs.every(t => t >= 0 && t <= 450));
  }
});

test('3-bound roofline adds NVLink EP All-to-All ceiling without altering dense single-GPU ridge', () => {
  const dense = lab.roofline(4096, 1, 1);
  const ep64 = lab.roofline(4096, 1, 64);
  assert.equal(dense.ridge, 1250);
  assert.equal(dense.nvlinkCeiling, null);
  assert.ok(ep64.nvlinkCeiling > 0 && ep64.nvlinkCeiling < 10);
  assert.equal(ep64.prefill.bound, 'NVLink EP All-to-All');
  assert.ok(ep64.prefill.pflops <= ep64.nvlinkCeiling + 1e-9);
});

test('EP roofline compares FLOPs and bytes for the same top-six SwiGLU workload per GPU', () => {
  const d = 7168, m = 3072, k = 6;
  const r = lab.roofline(4096, 1, 64);
  const s = r.prefill;
  assert.equal(r.peakPflops, 5);
  assert.equal(r.ridge, 625);
  assert.equal(s.flops, 6 * k * d * m * 4096);
  assert.equal(s.nvBytes, 4 * k * d * 4096 * (63 / 64));
  assert.equal(s.hbmBytes, .5 * 3 * d * m * 6 + 4 * k * d * 4096);
  close(s.intensity, s.flops / s.hbmBytes);
  close(r.nvlinkCeiling, (s.flops / s.nvBytes) * 900e9 / 1e15);
  const dense = lab.roofline(4096, 1);
  assert.equal(dense.peakPflops, 10);
  assert.equal(dense.prefill.flops, 2 * d * d * 4096);
  assert.equal(dense.prefill.hbmBytes, .5 * d * d + 4 * d * 4096);
  assert.equal(dense.prefill.nvBytes, 0);
});

test('Muon singular-value polynomial is scale-invariant and preserves zero updates', () => {
  const {muonSpectrum} = require('../journey-story/component-math.js');
  const input = [1.45, .82, .48, .27, .14];
  const result = muonSpectrum(input);
  assert.ok(result.every(x => Math.abs(x - 1) < .001));
  muonSpectrum(input.map(x => x * 1e100)).forEach((x, i) => close(x, result[i]));
  assert.deepEqual(muonSpectrum([0, 0]), [0, 0]);
});

test('concept registry resolves all 7 concepts, aliases, and Swiss<->Beamline stage sync', () => {
  const links = require('../shared/concept-links.js');
  const expectedSlugs = ['tokenization', 'mhc-residual', 'csa-hca-kv', 'moe-router', 'prefill-decode', 'utf8-sse', 'mcp-loop'];
  assert.deepEqual(Object.keys(links.CONCEPTS), expectedSlugs);
  assert.equal(links.resolve('kv-cache').slug, 'csa-hca-kv');
  for (const slug of expectedSlugs) {
    const url = links.urlFor('tour', slug, {from: 'swiss', pos: 7.3});
    assert.match(url, /^\.\.\/journey-tour\/index\.html\?.*#concept=/);
  }
  assert.equal(links.stepToSwissG('1.1'), 0.06);
  assert.equal(links.stepToSwissG('7.2'), 6.248);
  assert.equal(links.stepToSwissG('7.3'), 6.436);
  assert.equal(links.stepToSwissG('12.1'), 11.06);
  assert.equal(links.stepToSwissG('12.2'), 11.295);
  for (let stage = 1; stage <= 12; stage++) {
    const href = links.editionHref('reader', 'swiss', {stage, step: stage + '.1', pos: stage + '.1'});
    const g = Number(new URL(href, 'https://example.test/').searchParams.get('g'));
    assert.equal(Math.floor(g), stage - 1, `Swiss stage ${stage} must map to zero-based index ${stage - 1}`);
  }
  assert.equal(links.swissToBeamlineBeat(6.436), '5e');
  assert.equal(links.beamlineBeatToSwissG('5e'), 6.436);
  assert.equal(links.beamlineBeatToStep('5g'), '7.5');
  assert.equal(links.editionHref('beamline', 'reader', {stage: 7, step: links.beamlineBeatToStep('5g'), pos: '5g', label: 'Beat 5g'}),
    '../index.html?from=beamline&pos=5g&fromLabel=Beat+5g#step-7.5');
  assert.equal(links.stageFromStop(17), '7.3');
  assert.equal(links.editionHref('reader', 'beamline', {stage: 7, step: '7.3', pos: '7.3', label: 'Step 7.3'}),
    './end-to-end-beamline/index.html?from=reader&pos=7.3&fromLabel=Step+7.3&beat=5e');
  assert.equal(links.editionHref('tour', 'reader', {stage: '7', step: '7.3', pos: '17', label: 'Stop 17'}),
    '../index.html?from=tour&pos=17&fromLabel=Stop+17#step-7.3');
  assert.equal(links.returnHref('tour', '17', false, 'reader'), './journey-tour/index.html#stop-17');
  assert.equal(links.returnHref('obs', 'MD-2g', false, 'reader'), './shared/obs-core.html?focus=MD-2g');
});

test('Ch. 4 causal feature steering preserves 100% probability sum and shifts predictions on clamp', () => {
  const math = require('../journey-story/component-math.js');
  for (const mode of ['natural', 'ablate', 'swap', 'amplify']) {
    const res = math.steerCircuit(mode);
    const sum = res.probs.reduce((acc, p) => acc + p.pct, 0);
    assert.equal(sum, 100, mode + ' probabilities must sum to 100');
  }
  assert.equal(math.steerCircuit('natural').probs[0].token, 'France');
  assert.equal(math.steerCircuit('swap').probs[0].token, 'Italy');
  assert.ok(math.steerCircuit('ablate').probs.find(p => p.token === 'France').pct < 40);
  assert.ok(math.steerCircuit('amplify').probs[0].pct > 90);
  const slice = math.activationSlice(38);
  assert.equal(slice.length, 24);
  assert.ok(slice.every(v => v >= -1 && v <= 1));
});

test('scene focus messages trust only the parent window and its paired origin', () => {
  const vm = require('node:vm');
  const script = readFileSync(path.join(root, 'shared/obs-file-bridge.js'), 'utf8');
  for (const location of [{protocol: 'https:', origin: 'https://example.test'}, {protocol: 'file:', origin: 'null'}]) {
    let receive, focused = 0;
    const parent = {}, child = {addEventListener: (name, handler) => {if (name === 'message') receive = handler;}};
    const document = {addEventListener() {}, getElementById: id => {
      assert.equal(id, 'threeCanvas');
      return {focus: options => {assert.equal(options.preventScroll, true); focused++;}};
    }};
    vm.runInNewContext(script, {window: child, parent, location, document});
    child.forwardJourneyKeys();
    const data = {type: 'journey-focus-scene'}, origin = location.origin;
    receive({source: {}, origin, data});
    receive({source: parent, origin: 'https://other.test', data});
    receive({source: parent, origin, data: {type: 'other'}});
    assert.equal(focused, 0);
    receive({source: parent, origin, data});
    assert.equal(focused, 1);
  }
});

test('lab and bridge stay below 68 KB with workload and timing explanations; Swiss stays independent', () => {
  const size = ['micro-labs.js', 'obs-file-bridge.js'].reduce((sum, f) =>
    sum + statSync(path.join(root, 'shared', f)).size, 0);
  assert.ok(size < 68000, size);
  assert.doesNotMatch(readFileSync(path.join(root, 'end-to-end-swiss/index.html'), 'utf8'), /micro-labs/);
});

test('isolated local-file frames exchange component data and routing commands', async () => {
  const {MessageChannel} = require('node:worker_threads');
  const vm = require('node:vm');
  const script = readFileSync(path.join(root, 'shared', 'obs-file-bridge.js'), 'utf8');
  const location = {protocol: 'file:'}, host = {};
  const components = [{id: 'MD-2g', title: 'Router'}];
  const pose = {pos: [1, 2, 3], target: [1, 0, 0]};
  let receive, childPort, parentPort, finish;
  const routed = new Promise(resolve => { finish = resolve; });
  const child = {obs: {ready: Promise.resolve({components: () => components, poseFor: () => pose,
    setRouting: (k, bias) => finish([k, bias])})},
    addEventListener: (_, handler) => { receive = handler; }};
  const contentWindow = {
    get obs() { throw Object.assign(new Error('Opaque origin'), {name: 'SecurityError'}); },
    postMessage(data, origin, ports) {
      assert.equal(origin, '*');
      childPort = ports[0];
      receive({source: host, origin: 'null', data, ports});
    }
  };
  vm.runInNewContext(script, {window: child, parent: host, location});
  class Channel extends MessageChannel { constructor() { super(); parentPort = this.port1; } }
  vm.runInNewContext(script, {window: host, parent: host, location, MessageChannel: Channel});
  try {
    const api = await host.journeyObservatory({contentWindow}, [{ch: 3, ids: ['MD-2g']}]);
    assert.equal(api.getComponent('MD-2g').title, 'Router');
    assert.equal(api.poseFor(['MD-2g']).target[0], 1);
    api.setRouting(3, .55);
    assert.deepEqual(await routed, [3, .55]);
  } finally {
    childPort?.close(); parentPort?.close();
  }
});
