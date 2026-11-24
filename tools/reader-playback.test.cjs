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

const fullClip = id => tracks.full.find(clip => clip.id === id);
const sharedBeats = [...new Set(stops.map(stop => stop.spatialBeat))]
  .filter(beat => fullClip(beat) && stops.filter(stop => stop.spatialBeat === beat).length > 1);

test('full recording maps every step of a shared clip to its own span of audio, forward and backward', () => {
  assert.ok(sharedBeats.length > 0, 'the manifest has clips that narrate several steps');
  for (const beat of sharedBeats) {
    const steps = stops.filter(stop => stop.spatialBeat === beat);
    const clip = fullClip(beat);
    const {get, audio, positions, player, setPosition} = fixture();
    for (const stop of [...steps, ...steps.toReversed()]) {
      setPosition({id: stop.id, opening: false, localT: .5});
      player.selectPosition(stop.id, false);
      get('play-audio').listeners.click();
      const slot = steps.indexOf(stop);
      assert.equal(audio.src, clip.src, stop.id + ' plays the clip that narrates it');
      assert.ok(Math.abs(audio.currentTime - (slot + .5) / steps.length * clip.dur) < 1e-6,
        'Play from ' + stop.id + ' must start inside its own span, not at the clip start');
      assert.equal(positions.at(-1)[0], stop.id, 'Play must keep ' + stop.id);
      assert.ok(Math.abs(positions.at(-1)[1] - .5) < 1e-6);
      player.pause();
    }
  }
});

test('narration advances through the steps of a shared clip in order and rewinds in reverse', () => {
  const beat = sharedBeats.find(id => stops.filter(stop => stop.spatialBeat === id).length === 3) || sharedBeats[0];
  const steps = stops.filter(stop => stop.spatialBeat === beat);
  const clip = fullClip(beat);
  const {get, audio, positions, player, setPosition} = fixture();
  setPosition({id: steps[0].id, opening: false, localT: 0});
  player.selectPosition(steps[0].id, false);
  get('play-audio').listeners.click();
  const seen = [];
  for (const at of [.05, .55, .95].map(share => share * clip.dur)) {
    audio.currentTime = at; audio.listeners.timeupdate();
    seen.push(positions.at(-1)[0]);
  }
  const expected = t => steps[Math.floor(t / clip.dur * steps.length)].id;
  assert.deepEqual(seen, [.05, .55, .95].map(share => expected(share * clip.dur)));
  // Going back (a rewind or a rail click) lands on the same step the same audio time maps to.
  for (const at of [.9, .4, .02].map(share => share * clip.dur)) {
    audio.currentTime = at; audio.listeners.timeupdate();
    assert.equal(positions.at(-1)[0], expected(at));
  }
});

test('switching between full and quick recordings from a later step keeps that step and progress', () => {
  for (const id of ['1.3', '4.4', '7.4', '10.4', '12.3']) {
    const {get, positions, player, setPosition} = fixture();
    setPosition({id, opening: false, localT: .6});
    player.selectPosition(id, false);
    get('play-audio').listeners.click();
    for (const track of ['quick', 'full', 'quick']) {
      get('track').value = track;
      get('track').listeners.change();
      assert.equal(positions.at(-1)[0], id, id + ' kept after switching to ' + track);
      assert.ok(Math.abs(positions.at(-1)[1] - .6) < 1e-6, id + ' progress kept after switching to ' + track);
    }
    player.pause();
  }
});

test('paused navigation, then resuming, reconstructs the same state in both directions', () => {
  for (const track of ['full', 'quick']) {
    const {get, audio, positions, player, setPosition} = fixture();
    get('track').value = track;
    get('track').listeners.change();
    const order = stops.filter(stop => stop.stage >= 6 && stop.stage <= 8);
    const sequence = [...order, ...order.toReversed(), ...order.filter((_, i) => i % 3 === 0).toReversed()];
    const first = new Map();
    for (const stop of sequence) {
      setPosition({id: stop.id, opening: false, localT: .25});
      player.selectPosition(stop.id, false);
      get('play-audio').listeners.click();
      const state = [positions.at(-1)[0], +positions.at(-1)[1].toFixed(6), +audio.currentTime.toFixed(6)];
      assert.equal(state[0], stop.id, track + ' Play retains ' + stop.id);
      if (first.has(stop.id)) assert.deepEqual(state, first.get(stop.id), track + ' ' + stop.id + ' resumes identically after going back');
      else first.set(stop.id, state);
      player.pause();
    }
  }
});
