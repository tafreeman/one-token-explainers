const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {stops, tracks, stages} = require('../one-token/stops-manifest.js');

function fixture({deferSeek = false} = {}) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {value: id === 'track' ? 'full' : '', checked: true,
      textContent: '', hidden: false, listeners: {}, setAttribute() {}, querySelector() { return null; },
      matches() { return false; }, addEventListener(type, callback) { this.listeners[type] = callback; }});
    return nodes.get(id);
  };
  let audio;
  const media = {srcSets: 0, playCalls: 0};
  const context = vm.createContext({window: {innerWidth: 1440}, document: {getElementById: get},
    Audio: function () {
      audio = this; this.time = 0; this.readyState = deferSeek ? 0 : 1; this.listeners = {};
      this.addEventListener = (type, callback) => { this.listeners[type] = callback; };
      Object.defineProperty(this, 'currentTime', {get() { return this.time; }, set(value) {
        if (!this.readyState) throw new Error('metadata not ready');
        this.time = value;
      }});
      Object.defineProperty(this, 'src', {get() { return this.source; }, set(value) {
        this.source = value; this.time = 0; media.srcSets++;
      }});
      this.pause = () => {}; this.play = async () => { media.playCalls++; };
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../one-token/playback.js'), 'utf8'), context);
  const positions = [];
  let readerPosition;
  const player = context.window.ReaderPlayback.create({tracks, stops, stages, asset: p => p,
    getPosition: () => readerPosition,
    onStart() {}, onPosition: (...args) => positions.push(args)});
  return {get, audio, media, positions, player, setPosition(value) { readerPosition = value; }};
}

const directSegment = (track, id) => tracks.routes[track].find(item => item.stepId === id && item.selectable);
const sourceClip = (track, id) => tracks[track].find(clip => clip.id === id);
const segmentTime = (item, localT) => item.start + localT * (item.end - item.start);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6,
  message || `${actual} should equal ${expected}`);

test('Narrated run starts at the introduction and plays the complete selected route', () => {
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
  const expected = directSegment('quick', '7.4');
  close(audio.currentTime, segmentTime(expected, .25));
  audio.currentTime += .5;
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
    const expected = directSegment('quick', stop.id);
    assert.equal(positions.at(-1)[0], stop.id, 'Play must retain step ' + stop.id);
    close(positions.at(-1)[1], .35, 'Play must retain progress within ' + stop.id);
    close(audio.currentTime, segmentTime(expected, .35));
    player.pause();
  }
});

test('switching narration tracks retains selected mechanism and within-step progress', () => {
  const {get, positions, player, setPosition, audio} = fixture();
  setPosition({id: '7.3', opening: false, localT: .4});
  player.selectPosition('7.3', false);
  get('play-audio').listeners.click();
  assert.equal(positions.at(-1)[0], '7.3');
  close(positions.at(-1)[1], .4);
  get('track').value = 'quick';
  get('track').listeners.change();
  assert.equal(positions.at(-1)[0], '7.3');
  close(positions.at(-1)[1], .4);
  get('track').value = 'full';
  get('track').listeners.change();
  assert.equal(positions.at(-1)[0], '7.3');
  close(positions.at(-1)[1], .4);
  const pausedAt = audio.currentTime;
  player.pause();
  get('play-audio').listeners.click();
  assert.equal(audio.currentTime, pausedAt, 'Pause and resume must not seek again');
});

test('direct selection chooses the first written route segment and reconstructs it in reverse', () => {
  for (const track of ['full', 'quick']) {
    const {get, audio, positions, player, setPosition} = fixture();
    get('track').value = track;
    get('track').listeners.change();
    const first = new Map();
    for (const stop of [...stops, ...stops.toReversed()]) {
      setPosition({id: stop.id, opening: false, localT: .25});
      player.selectPosition(stop.id, false);
      get('play-audio').listeners.click();
      const expected = directSegment(track, stop.id);
      const state = [positions.at(-1)[0], positions.at(-1)[1], audio.currentTime, audio.src];
      assert.equal(state[0], stop.id, track + ' Play retains ' + stop.id);
      close(state[1], .25);
      close(state[2], segmentTime(expected, .25), track + ' ' + stop.id + ' uses its explicit cue range');
      assert.equal(state[3], sourceClip(track, expected.clip).src);
      if (first.has(stop.id)) assert.deepEqual(state, first.get(stop.id), track + ' ' + stop.id + ' reverses identically');
      else first.set(stop.id, state);
      player.pause();
    }
  }
});

test('a segment boundary advances immediately without reloading the same MP3', () => {
  const {get, audio, media, positions, player} = fixture();
  get('track').value = 'quick';
  get('track').listeners.change();
  player.selectPosition('9.1', false, 0);
  get('play-audio').listeners.click();
  const srcSets = media.srcSets;
  audio.currentTime = 12.55;
  audio.listeners.timeupdate();
  assert.equal(positions.at(-1)[0], '9.1');
  audio.currentTime = 12.56;
  audio.listeners.timeupdate();
  assert.equal(positions.at(-1)[0], '9.2');
  close(positions.at(-1)[1], 0);
  assert.equal(media.srcSets, srcSets, 'the next range keeps the loaded recording');
  assert.equal(audio.currentTime, 12.56, 'advancement does not wait for the 20.459 second clip to end');
  assert.equal(player.playing, true);
  audio.currentTime = 15.6;
  audio.listeners.timeupdate();
  assert.equal(positions.at(-1)[0], '9.3');
  assert.equal(media.srcSets, srcSets);
});

test('segment ends alternate clips and revisit noncontiguous ranges in written order', () => {
  const {get, audio, positions, player} = fixture();
  player.selectPosition('10.1', false, 0);
  get('play-audio').listeners.click();
  const transitions = [
    [14.712, '10.2', '6d', 0],
    [3.68, '10.3', '6c', 9.147],
    [14.712, '10.4', '6d', 3.68],
    [10.219, '11.1', '6e', 0],
  ];
  for (const [at, id, clip, seek] of transitions) {
    audio.currentTime = at;
    audio.listeners.timeupdate();
    assert.equal(positions.at(-1)[0], id);
    assert.equal(audio.src, sourceClip('full', clip).src);
    close(audio.currentTime, seek);
    assert.equal(player.playing, true);
  }
});

test('backward seeks across same-clip boundaries reconstruct their owning segments', () => {
  const {get, audio, positions, player} = fixture();
  get('track').value = 'quick';
  get('track').listeners.change();
  player.selectPosition('9.3', false, 0);
  get('play-audio').listeners.click();
  audio.currentTime = 16;
  audio.listeners.timeupdate();
  assert.equal(positions.at(-1)[0], '9.3');
  audio.currentTime = 13;
  audio.listeners.timeupdate();
  assert.equal(positions.at(-1)[0], '9.2');
  close(positions.at(-1)[1], (13 - 12.56) / (15.6 - 12.56));
  audio.currentTime = 12;
  audio.listeners.timeupdate();
  assert.equal(positions.at(-1)[0], '9.1');
  close(positions.at(-1)[1], 12 / 12.56);
});

test('chapters and elapsed time use narrative route offsets rather than source order', () => {
  const {audio, positions, player, get} = fixture();
  player.seekStage(8);
  assert.equal(audio.src, sourceClip('full', 'p6').src);
  assert.equal(positions.at(-1)[0], '8.1');
  player.pause();
  player.selectPosition('10.3', false, .5);
  get('play-audio').listeners.click();
  const route = tracks.routes.full;
  const index = route.indexOf(directSegment('full', '10.3'));
  const expected = route.slice(0, index).reduce((sum, item) => sum + item.end - item.start, 0)
    + .5 * (directSegment('full', '10.3').end - directSegment('full', '10.3').start);
  const format = value => Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0');
  assert.ok(get('audio-time').textContent.startsWith(format(expected) + ' / '));
});

test('the final route segment stops at its end and resets the next run', () => {
  const {get, audio, player} = fixture();
  get('track').value = 'quick';
  get('track').listeners.change();
  player.selectPosition('12.4', false, 0);
  get('play-audio').listeners.click();
  audio.currentTime = 18.709;
  audio.listeners.timeupdate();
  assert.equal(audio.src, sourceClip('quick', '13-outro').src);
  audio.currentTime = 5.752;
  audio.listeners.ended();
  assert.equal(player.playing, false);
  assert.ok(get('audio-time').textContent.startsWith('0:00 / '));
  get('narrStory').listeners.click();
  assert.equal(audio.src, sourceClip('quick', '00-intro').src);
});
