'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('Journey narration stays in inference after release and skips the retired training recap', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const source = html.slice(html.indexOf('function makeNarrator(o){'), html.indexOf('const narrRM='));
  const manifest = html.match(/id="narration-manifest">(.*?)<\/script>/s)[1];
  const handlers = {}, fields = {}, visited = [], played = [];
  class Audio {
    constructor(src) { this.src = src; this.currentTime = 0; }
    play() { played.push(this); return Promise.resolve(); }
    pause() {}
  }
  const button = {
    querySelector(key) { return fields[key] ||= {}; },
    addEventListener(name, callback) { handlers[name] = callback; },
    setAttribute() {}
  };
  const context = vm.createContext({Audio, location: {protocol: 'file:'}, document: {getElementById: () => ({textContent: manifest})}});
  vm.runInContext(source, context);
  context.makeNarrator({btn: button, cap: {}, label: 'Narrate', getStop: () => 18, goStop: n => visited.push(n)});
  await handlers.click();
  assert.match(played.at(-1).src, /19-vocab\.mp3$/);
  played.at(-1).onended();
  assert.deepEqual(visited, [20]);
  assert.match(played.at(-1).src, /21-inference\.mp3$/);
  played.at(-1).onended();
  assert.deepEqual(visited, [20, 21]);
  assert.match(played.at(-1).src, /22-gate\.mp3$/);
  assert.equal(played.some(audio => /20-training/.test(audio.src)), false);
  assert.equal(fields['.narr-dur'].textContent, '6:13');
});
