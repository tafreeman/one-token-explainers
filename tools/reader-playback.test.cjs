const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {stops, tracks} = require('../one-token/stops-manifest.js');

function fixture({deferSeek = false} = {}) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {value: id === 'track' ? 'full' : '', checked: true,
      textContent: '', hidden: false, listeners: {}, setAttribute() {}, querySelector() { return null; },
      matches() { return false; }, addEventListener(type, callback) { this.listeners[type] = callback; }});
    return nodes.get(id);
  };
  let audio;
  const context = vm.createContext({window: {innerWidth: 1440}, document: {getElementById: get},
    Audio: function () {
      audio = this; this.time = 0; this.readyState = deferSeek ? 0 : 1; this.listeners = {};
      this.addEventListener = (type, callback) => { this.listeners[type] = callback; };
      Object.defineProperty(this, 'currentTime', {get() { return this.time; }, set(value) {
        if (!this.readyState) throw new Error('metadata not ready');
        this.time = value;
      }});
      Object.defineProperty(this, 'src', {get() { return this.source; }, set(value) { this.source = value; this.time = 0; }});
      this.pause = () => {}; this.play = async () => {};
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../one-token/playback.js'), 'utf8'), context);
  const positions = [];
  let readerPosition;
  const player = context.window.ReaderPlayback.create({tracks, stops, asset: p => p,
    getPosition: () => readerPosition,
    onStart() {}, onPosition: (...args) => positions.push(args)});
  return {get, audio, positions, player, setPosition(value) { readerPosition = value; }};
}

test('Narrated run starts at the introduction and plays the complete selected recording', () => {
  const {get, audio, positions, player} = fixture();
  get('narrStory').listeners.click();
  assert.equal(audio.src, tracks.full[0].src);
  assert.ok(get('audio-time').textContent.startsWith('0:00 / '));
  assert.equal(positions[0][2], 'hero');
  player.pause();
  get('track').value = 'quick';
  get('track').listeners.change();
  get('narrStory').listeners.click();
  assert.equal(audio.src, tracks.quick[0].src);
  assert.equal(positions.at(-1)[2], 'hero', 'the quick introduction keeps the opening scene');
  assert.ok(get('audio-time').textContent.startsWith('0:00 / '));
});

test('a pending metadata seek keeps captions and the scene on the selected quick substep', () => {
  const {get, audio, positions, player, setPosition} = fixture({deferSeek: true});
  get('track').value = 'quick';
  get('track').listeners.change();
  setPosition({id: '7.4', opening: false, localT: .25});
  player.selectPosition('7.4', false);
  get('play-audio').listeners.click();
  assert.equal(positions.at(-1)[0], '7.4', 'waiting for metadata does not jump to the start');
  audio.readyState = 1;
  audio.listeners.loadedmetadata();
  assert.equal(positions.at(-1)[0], '7.4');
  assert.ok(Math.abs(audio.currentTime - tracks.quick[7].dur * 3.25 / 5) < 1e-6);
  audio.currentTime += 1;
  audio.listeners.timeupdate();
  const at = audio.currentTime;
  player.pause();
  get('play-audio').listeners.click();
  assert.equal(audio.currentTime, at, 'a resolved seek never rewinds on resume');
});

test('quick narration resumes the selected substep in either navigation direction', () => {
  const {get, audio, positions, player, setPosition} = fixture();
  get('track').value = 'quick';
  get('track').listeners.change();
  const stage = stops.filter(stop => stop.stage === 7);
  for (const stop of [...stage, ...stage.toReversed()]) {
    setPosition({id: stop.id, opening: false, localT: .35});
    player.selectPosition(stop.id, false);
    get('play-audio').listeners.click();
    assert.equal(positions.at(-1)[0], stop.id, 'Play must retain step ' + stop.id);
    assert.ok(Math.abs(positions.at(-1)[1] - .35) < 1e-6, 'Play must retain progress within ' + stop.id);
    const expectedTime = (stage.indexOf(stop) + .35) / stage.length * tracks.quick[7].dur;
    assert.ok(Math.abs(audio.currentTime - expectedTime) < 1e-6);
    player.pause();
  }
});

test('switching narration tracks retains selected mechanism and within-step progress', () => {
  const {get, positions, player, setPosition, audio} = fixture();
  setPosition({id: '7.3', opening: false, localT: .4});
  player.selectPosition('7.3', false);
  get('play-audio').listeners.click();
  assert.equal(positions.at(-1)[0], '7.3');
  assert.ok(Math.abs(positions.at(-1)[1] - .4) < 1e-6);
  get('track').value = 'quick';
  get('track').listeners.change();
  assert.equal(positions.at(-1)[0], '7.3');
  assert.ok(Math.abs(positions.at(-1)[1] - .4) < 1e-6);
  get('track').value = 'full';
  get('track').listeners.change();
  assert.equal(positions.at(-1)[0], '7.3');
  assert.ok(Math.abs(positions.at(-1)[1] - .4) < 1e-6);
  const pausedAt = audio.currentTime;
  player.pause();
  get('play-audio').listeners.click();
  assert.equal(audio.currentTime, pausedAt, 'Pause and resume must not seek again');
});
