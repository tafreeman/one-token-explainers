'use strict';

// Schema, size and encoding checks for shared/bpe-merges.js, the slice of DeepSeek's real BPE merge table the
// BPE lab encodes with. Regenerate it (and tools/bpe-golden.json) with tools/extract-deepseek-merges.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, statSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const file = path.join(root, 'shared', 'bpe-merges.js');
const MAX_BYTES = 45000;
const T = require('../shared/bpe-merges.js');
globalThis.DeepSeekBPE = T;
const lab = require('../shared/micro-labs.js');
const golden = JSON.parse(readFileSync(path.join(__dirname, 'bpe-golden.json'), 'utf8'));

// An independent reading of the packed IDs (printable ASCII without '"' and '\', base 92, 1-3 digits).
const ALPHABET = [...Array(94)].map((_, i) => String.fromCharCode(33 + i)).filter(c => c !== '"' && c !== '\\').join('');
function unpack(s, {base, one, two}) {
  const digit = i => ALPHABET.indexOf(s[i]), out = [];
  for (let i = 0; i < s.length;) {
    const d = digit(i);
    if (d < 0) throw new Error('bad digit ' + JSON.stringify(s[i]));
    if (d < one) { out.push(d); i += 1; }
    else if (d < one + two) { out.push(one + (d - one) * base + digit(i + 1)); i += 2; }
    else { out.push(one + two * base + ((d - one - two) * base + digit(i + 1)) * base + digit(i + 2)); i += 3; }
  }
  return out;
}

test('merge table is a small, deep-frozen classic script that sets window.DeepSeekBPE', () => {
  assert.ok(statSync(file).size < MAX_BYTES, `${statSync(file).size} bytes`);
  const src = readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /\b(import|export)\b\s|fetch\(|XMLHttpRequest|https?:\/\//, 'no modules or network access');
  const window = {};
  vm.runInNewContext(src, {window});
  assert.equal(window.DeepSeekBPE.merges, T.merges, 'browser global and module.exports carry the same table');
  for (const o of [T, T.code, T.split]) assert.ok(Object.isFrozen(o), 'deep-frozen');
});

test('provenance and schema are recorded, and every merge builds on earlier IDs only', () => {
  assert.match(T.modelId, /^deepseek-ai\/[\w.-]+$/);
  assert.match(T.revision, /^[0-9a-f]{40}$/);
  assert.equal(T.vocabSize, 129280, 'DeepSeek-V4 vocabulary, special tokens included');
  assert.ok(Number.isInteger(T.mergesKept) && T.mergesKept > 0 && T.mergesKept <= T.mergesTotal);
  assert.equal(T.flags, 'gu');
  assert.ok(T.split.length > 0 && T.split.every(p => new RegExp(p, T.flags) instanceof RegExp), 'patterns compile in JS');
  assert.equal(T.code.base, ALPHABET.length);
  const bytes = unpack(T.bytes, T.code), pairs = unpack(T.merges, T.code);
  assert.equal(bytes.length, 256);
  assert.equal(new Set(bytes).size, 256, 'one ID per byte');
  assert.ok(bytes.every(id => id >= T.firstMergeId - 256 && id < T.firstMergeId), 'byte IDs come just before the merges');
  assert.equal(pairs.length, 2 * T.mergesKept);
  const seen = new Set();
  for (let i = 0; i < T.mergesKept; i++) {
    const [left, right] = [pairs[2 * i], pairs[2 * i + 1]], key = left + ',' + right;
    assert.ok(left >= T.firstMergeId - 256 && left < T.firstMergeId + i && right >= T.firstMergeId - 256 && right < T.firstMergeId + i, 'merge ' + i);
    assert.ok(!seen.has(key), 'merge ' + i + ' repeats a pair');
    seen.add(key);
  }
  // The lab's own reading agrees with this one.
  assert.deepEqual(lab.rules.slice(0, 3).map(r => [r.left, r.right, r.id]), [0, 1, 2].map(i => [pairs[2 * i], pairs[2 * i + 1], T.firstMergeId + i]));
  assert.equal(lab.rules.length, T.mergesKept);
  bytes.forEach((id, b) => assert.deepEqual(lab.pieces[id], [b]));
});

test('every byte round-trips: decode(encode(x)) === x', () => {
  const decoder = new TextDecoder('utf-8', {fatal: true}), max = T.firstMergeId + T.mergesKept;
  const ascii = [...Array(128)].map((_, i) => String.fromCharCode(i)).join('');
  for (const text of [ascii, 'café naïve résumé façade ¿Dónde?', 'é Å ß ø', '🚀 👩🏿‍💻 🇫🇷 🙂', '你好 東京 こんにちは カタカナ',
    '한국어 Привет مرحبا', '   ﻿�', '1234567890 3.14', '  \t\n\r\n  ', '']) {
    const {ids} = lab.tokenize(text);
    assert.ok(ids.every(id => Number.isInteger(id) && id >= 0 && id < max), JSON.stringify(text));
    const bytes = ids.flatMap(id => lab.pieces[id]);
    assert.deepEqual(bytes, [...new TextEncoder().encode(text)], JSON.stringify(text));
    assert.equal(decoder.decode(Uint8Array.from(bytes)), text);
  }
});

test('the lab encodes exactly like the tokenizers library on the same cut (golden file)', () => {
  for (const k of ['modelId', 'revision', 'mergesKept']) assert.equal(golden[k], T[k], k);
  assert.ok(golden.cases.length >= 40, golden.cases.length + ' cases');
  const texts = golden.cases.map(c => c.text);
  for (const lesson of ['is in Paris.', ' Paris', 'the cat sat']) assert.ok(texts.includes(lesson), lesson);
  for (const {text, ids} of golden.cases) assert.deepEqual(lab.tokenize(text).ids, ids, JSON.stringify(text));
  // The lesson's token stays whole: the kept merges reach rank 10,852, which builds " Paris".
  assert.deepEqual(golden.cases.find(c => c.text === ' Paris').ids, [11111]);
});
