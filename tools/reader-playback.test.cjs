const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {stops, tracks} = require('../one-token/stops-manifest.js');

test('Narrated run starts at the introduction and plays the complete selected recording', () => {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {value: id === 'track' ? 'full' : '', checked: true,
      textContent: '', hidden: false, listeners: {}, setAttribute() {}, querySelector() { return null; },
      matches() { return false; }, addEventListener(type, callback) { this.listeners[type] = callback; }});
    return nodes.get(id);
  };
  let audio;
  const context = vm.createContext({window: {innerWidth: 1440}, document: {getElementById: get},
    Audio: function () { audio = this; this.currentTime = 0; this.addEventListener = () => {};
      this.pause = () => {}; this.play = async () => {}; }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../one-token/playback.js'), 'utf8'), context);
  const positions = [];
  const player = context.window.ReaderPlayback.create({tracks, stops, asset: p => p,
    onStart() {}, onPosition: (...args) => positions.push(args)});
  get('narrStory').listeners.click();
  assert.equal(audio.src, tracks.full[0].src);
  assert.ok(get('audio-time').textContent.startsWith('0:00 / '));
  assert.equal(positions[0][2], 'hero');
  player.pause();
  get('track').value = 'quick';
  get('track').listeners.change();
  get('narrStory').listeners.click();
  assert.equal(audio.src, tracks.quick[0].src);
  assert.ok(get('audio-time').textContent.startsWith('0:00 / '));
});
