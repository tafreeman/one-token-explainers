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

test('the local sampling probe identifies each non-default parameter', () => {
  assert.equal(lab.sampling(null, null).status, 200);
  assert.equal(lab.sampling(1, 1).status, 200);
  assert.deepEqual(lab.sampling(0, .9), {status: 400, rejected: ['temperature', 'top_p']});
  assert.deepEqual(lab.sampling(null, .5).rejected, ['top_p']);
});

test('Guided Tour and Story offer the same component labs at all ten lab stops', () => {
  const expected = {
    3: ['bpe'], 4: ['bpe'], 11: ['kl'], 14: ['attention', 'rope'], 15: ['kv'],
    16: ['mix'], 17: ['moe'], 24: ['roof'], 25: ['roof'], 26: ['stream']
  };
  assert.deepEqual(lab.tourStops, expected);
  assert.deepEqual(lab.storyStops, expected);
});

test('lab code and offline bridge stay below 40 KB together; Swiss stays independent', () => {
  const size = ['micro-labs.js', 'obs-file-bridge.js'].reduce((sum, f) =>
    sum + statSync(path.join(root, 'shared', f)).size, 0);
  assert.ok(size < 40000, size);
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
