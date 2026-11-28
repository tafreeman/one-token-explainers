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

test('every Break lab sits on its concept card in Story, Tour, Observatory and Beamline Study', () => {
  const links = require('../shared/concept-links.js');
  const breaks = {'moe-router': 'moe', 'prefill-decode': 'pd', 'utf8-sse': 'stream', 'mcp-loop': 'cache'};
  const beam = readFileSync(path.join(root, 'end-to-end-beamline/index.html'), 'utf8');
  const literal = name => Function('return ' + beam.match(new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\});'))[1])();
  const studyLabs = literal('studyLabs'), beamConcepts = literal('beamConcepts');
  for (const [slug, name] of Object.entries(breaks)) {
    const c = links.CONCEPTS[slug];
    assert.equal(c.lab, name, slug + ' registry lab');
    assert.ok(lab.storyStops[c.story.stop]?.includes(name), slug + ' Story stop ' + c.story.stop);
    assert.ok(lab.tourStops[c.tour.stop]?.includes(name), slug + ' Tour stop ' + c.tour.stop);
    for (const code of links.map.CONCEPTS[slug].obs) assert.ok(lab.components[code]?.includes(name), slug + ' Observatory ' + code);
    assert.equal(beamConcepts[c.beamline.beat], slug, slug + ' Beamline beat');
    assert.ok(studyLabs[c.beamline.beat]?.includes(name), slug + ' Beamline Study beat ' + c.beamline.beat);
  }
});

test('Swiss concept bridges come from the registry and return to the same zero-based stage', () => {
  const links = require('../shared/concept-links.js');
  const swiss = readFileSync(path.join(root, 'end-to-end-swiss/index.html'), 'utf8');
  const hrefs = [...swiss.matchAll(/class="concept-bridge" href="([^"]+)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
  assert.equal(hrefs.length, 7);
  for (const href of hrefs) {
    const slug = href.match(/#concept=([a-z0-9-]+)$/)[1], c = links.CONCEPTS[slug];
    assert.equal(href, links.urlFor('tour', slug, {from: 'swiss', pos: c.swiss.g}));
    const back = links.returnHref('swiss', new URL(href, 'https://example.test/x/').searchParams.get('pos'), false, 'tour');
    const g = Number(new URL(back, 'https://example.test/x/').searchParams.get('g'));
    assert.equal(Math.floor(g), c.swiss.stage - 1, slug + ' returns to Swiss stage ' + c.swiss.stage);
  }
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
    '../one-token/index.html?from=beamline&pos=5g&fromLabel=Beat+5g#step-7.5');
  assert.equal(links.stageFromStop(17), '7.3');
  assert.equal(links.editionHref('reader', 'beamline', {stage: 7, step: '7.3', pos: '7.3', label: 'Step 7.3'}),
    '../end-to-end-beamline/index.html?from=reader&pos=7.3&fromLabel=Step+7.3&beat=5e');
  assert.equal(links.editionHref('tour', 'reader', {stage: '7', step: '7.3', pos: '17', label: 'Stop 17'}),
    '../one-token/index.html?from=tour&pos=17&fromLabel=Stop+17#step-7.3');
  assert.equal(links.returnHref('tour', '17', false, 'reader'), '../journey-tour/index.html#stop-17');
  assert.equal(links.returnHref('obs', 'MD-2g', false, 'reader'), '../shared/obs-core.html?focus=MD-2g');
  assert.equal(links.returnHref('tour', '17', false, 'story'), './journey-tour/index.html#stop-17');
});

test('Ch. 4 causal feature steering preserves 100% probability sum and shifts predictions on clamp', () => {
  const math = require('../journey-story/component-math.js');
  for (const mode of ['natural', 'ablate', 'swap', 'amplify']) {
    const res = math.steerCircuit(mode);
    const sum = res.probs.reduce((acc, p) => acc + p.pct, 0);
    assert.equal(sum, 100, mode + ' probabilities must sum to 100');
  }
  assert.equal(math.steerCircuit('natural').top.token, 'France');
  assert.equal(math.steerCircuit('swap').top.token, 'Italy');
  assert.ok(math.steerCircuit('ablate').probs.find(p => p.token === 'France').pct < 40);
  assert.ok(math.steerCircuit('amplify').top.pct > 90);
  // The clamp slider (0x..2x in 5% steps) moves France monotonically and keeps a 100% total.
  let previous = -1;
  for (let step = 0; step <= 200; step += 5) {
    const res = math.steerCircuit('natural', step / 100);
    assert.equal(res.probs.reduce((acc, p) => acc + p.pct, 0), 100, 'clamp ' + step);
    assert.deepEqual(res.probs.map(p => p.token), ['France', 'Italy', 'Belgium', 'Other'], 'rows stay in place');
    const france = res.probs[0].pct;
    assert.ok(france >= previous, 'France share must not fall as the Paris clamp rises');
    previous = france;
  }
  assert.equal(math.steerCircuit('natural', 9).clamp, 2, 'clamp is bounded to 2x');
  assert.equal(math.steerCircuit('swap', 0).probs.find(p => p.token === 'Italy').pct < 20, true, 'Rome at 0x no longer pushes Italy');
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

test('KV residency: per-request size, tier ordering, linear recompute and a length-free break-even', () => {
  const {GB200} = lab;
  for (let exponent = 12; exponent <= 20; exponent++) {
    const len = 2 ** exponent, t = lab.kvTiers(len);
    close(t.bytes, lab.kvFootprints(len).v4 * GB200.layers);
    close(t.hostS / t.hbmS, GB200.hbm / GB200.host);
    assert.ok(t.hbmS < t.hostS && t.hostS < t.recomputeS, `tiers ordered at ${len}`);
    // V4's compressed cache stays far below the break-even size, so fetching beats recomputing at every length.
    assert.ok(t.perToken < t.breakEvenPerToken / 100, `${t.perToken} B/token at ${len}`);
    if (exponent > 12) close(t.recomputeS / lab.kvTiers(len / 2).recomputeS, 2);
  }
  // Both fetch and recompute scale with tokens, so the break-even is a size per token, not a context length.
  close(lab.kvTiers(4096).breakEvenPerToken, lab.kvTiers(2 ** 20).breakEvenPerToken);
  close(lab.kvTiers(4096).breakEvenPerToken, 2 * GB200.active / GB200.pflops * GB200.host);
  assert.equal(GB200.host, 512e9 / 2, 'Grace LPDDR5X is shared by the superchip’s two GPUs');
});

test('TP/EP sharding traffic is zero unsharded and grows with group size and batch', () => {
  const none = lab.shardComm(8, 1, 1);
  assert.equal(none.tpBytes, 0); assert.equal(none.epBytes, 0); assert.equal(none.stepsPerS, Infinity);
  let prev = 0;
  for (const tp of [2, 4, 8]) { const c = lab.shardComm(8, tp, 1); assert.ok(c.tpBytes > prev); assert.equal(c.epBytes, 0); prev = c.tpBytes; }
  prev = 0;
  for (const ep of [2, 8, 32, 64]) { const c = lab.shardComm(8, 1, ep); assert.ok(c.epBytes > prev); assert.equal(c.tpBytes, 0); prev = c.epBytes; }
  const one = lab.shardComm(1, 8, 64), many = lab.shardComm(64, 8, 64);
  close(many.tpBytes / one.tpBytes, 64); close(many.epBytes / one.epBytes, 64);
  assert.ok(many.stepsPerS < one.stepsPerS && Number.isFinite(many.stepsPerS));
  // EP traffic per layer matches roofline()'s decode NVLink bytes, so the two read-outs agree.
  close(lab.shardComm(16, 1, 32).epBytes, lab.GB200.layers * lab.roofline(4096, 16, 32).decode.nvBytes);
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

/* ---------- change feedback: MicroLabs.flash / setValue and the orange selected state ---------- */

function loadDomLabs({reduced = false, rm = false} = {}) {
  const vm = require('node:vm');
  const classes = () => { const set = new Set(); return {set, add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c)}; };
  const node = (text = '') => ({classList: classes(), textContent: text, isConnected: true, tagName: 'SPAN'});
  const documentElement = {classList: classes(), offsetWidth: 0};
  if (rm) documentElement.classList.add('rm');
  const frames = [];
  let now = 0;
  const window = {};
  const context = vm.createContext({
    window, document: {documentElement, addEventListener() {}, createElement: () => node()},
    matchMedia: query => ({matches: reduced && /reduce/.test(query)}),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id),
    requestAnimationFrame: fn => frames.push(fn), cancelAnimationFrame() {},
    performance: {now: () => now}, TextEncoder, TextDecoder, Node: class {}, MutationObserver: class { observe() {} }, console
  });
  vm.runInContext(readFileSync(path.join(root, 'shared/micro-labs.js'), 'utf8'), context);
  const play = ms => { now += ms; const batch = frames.splice(0); batch.forEach(fn => fn(now)); };
  return {api: window.MicroLabs, node, play, frames};
}

test('flash adds .is-changed, restarts cleanly and removes it after the animation', t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {api, node} = loadDomLabs();
  const box = node(), other = node();
  api.flash(box);
  assert.ok(box.classList.contains('is-changed'));
  t.mock.timers.tick(600);
  assert.ok(box.classList.contains('is-changed'), 'still pulsing at 600 ms');
  api.flash(box); // a second change restarts the pulse instead of stacking timers
  t.mock.timers.tick(600);
  assert.ok(box.classList.contains('is-changed'));
  t.mock.timers.tick(200);
  assert.equal(box.classList.contains('is-changed'), false, 'class removed once the animation is over');
  api.flashAll([box, box, other, null]);
  assert.ok(box.classList.contains('is-changed') && other.classList.contains('is-changed'));
});

test('setValue tweens old to new under motion and lands on the exact new text', () => {
  const {api, node, play} = loadDomLabs();
  const out = node('10 MiB');
  assert.equal(api.setValue(out, '50 MiB'), true);
  assert.equal(out.textContent, '10 MiB', 'tween starts from the old value');
  assert.ok(out.classList.contains('is-changed'));
  play(200);
  const mid = parseFloat(out.textContent);
  assert.ok(mid > 10 && mid < 50, 'mid-tween value ' + out.textContent);
  play(400);
  assert.equal(out.textContent, '50 MiB');
  assert.equal(api.setValue(out, '50 MiB'), false, 'unchanged value does not pulse');
  const big = node('4,096 tokens');
  api.setValue(big, '65,536 tokens'); play(600);
  assert.equal(big.textContent, '65,536 tokens');
});

test('under prefers-reduced-motion setValue snaps and flash is only a static highlight class', t => {
  for (const mode of [{reduced: true}, {rm: true}]) {
    t.mock.timers.enable({apis: ['setTimeout']});
    const {api, node, frames} = loadDomLabs(mode);
    const out = node('10 MiB');
    api.setValue(out, '50 MiB');
    assert.equal(out.textContent, '50 MiB', 'no tween');
    assert.equal(frames.length, 0, 'no animation frames requested');
    assert.ok(out.classList.contains('is-changed'), 'static highlight still marks the change');
    t.mock.timers.tick(720);
    assert.equal(out.classList.contains('is-changed'), false);
    t.mock.timers.reset();
  }
});

test('orange token marks selected and changed state; reduced motion removes the animation; text on orange is legible', () => {
  const css = readFileSync(path.join(root, 'shared/micro-labs.css'), 'utf8');
  const hex = name => css.match(new RegExp('--' + name + ': *(#[0-9a-fA-F]{6})'))[1];
  const [orange, orangeHi, ink] = [hex('ml-orange'), hex('ml-orange-hi'), hex('ml-orange-ink')];
  assert.equal(orange.toUpperCase(), '#E5672F');
  assert.equal(orangeHi.toUpperCase(), '#F2A65A');
  const lum = c => { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  assert.ok(ratio(ink, orange) >= 4.5, 'ink on #E5672F ' + ratio(ink, orange).toFixed(2));
  assert.ok(ratio(ink, orangeHi) >= 4.5, 'ink on #F2A65A ' + ratio(ink, orangeHi).toFixed(2));
  assert.match(css, /\.ml-tokens button\[aria-pressed=true\][^{]*\{[^}]*background: var\(--ml-orange-hi\)/);
  assert.match(css, /\.ml-value,\.ml-num \{ background: var\(--ml-orange-hi\)/);
  assert.match(css, /\.is-changed \{ animation: ml-flash 650ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.is-changed,svg \.is-changed,svg text\.is-changed \{ animation: none \}/);
  assert.match(css, /html\.rm \.is-changed,html\.rm svg \.is-changed,html\.rm svg text\.is-changed \{ animation: none \}/);
  for (const file of ['one-token/learning-panels.css', 'journey-story/component-math.css']) {
    const src = readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /\[aria-pressed="true"\]\s*\{[^}]*background: var\(--ml-orange-hi/, file + ' selected chips use the orange token');
  }
});
