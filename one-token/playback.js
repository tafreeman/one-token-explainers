/* A single media element keeps the user's place as the figure changes views. */
window.ReaderPlayback = (() => {
  'use strict';
  function create({tracks, stops, asset, onPosition, onStart}) {
    const get = id => document.getElementById(id);
    const audio = new Audio();
    audio.preload = 'none';
    const play = get('play-audio'), select = get('track'), caption = get('spoken-caption');
    const status = get('audio-status');
    let clips = tracks.full, clipIndex = 0, loaded = -1, playing = false, generation = 0;
    let selection = null, lastCue = '';
    const seconds = n => Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');

    function paint() {
      const duration = clips.reduce((sum, c) => sum + c.dur, 0);
      const offset = clips.slice(0, clipIndex).reduce((sum, c) => sum + c.dur, 0);
      get('audio-time').textContent = seconds(offset + (loaded === clipIndex ? audio.currentTime : 0)) + ' / ' + seconds(duration);
      play.textContent = playing ? 'Pause narration' : 'Play narration';
      const cue = loaded === clipIndex && playing
        ? clips[clipIndex].cues.findLast(c => c.t <= audio.currentTime)?.s || '' : '';
      caption.hidden = !cue || !get('captions').checked;
      if (cue !== lastCue) { caption.textContent = cue; lastCue = cue; }
    }
    function pause() {
      generation++;
      playing = false;
      audio.pause();
      paint();
    }
    function failure() {
      pause();
      status.hidden = false;
      status.textContent = 'This recording could not play. Try Play narration again, or continue with the written lesson.';
      loaded = -1;
    }
    function position() {
      if (!playing || loaded !== clipIndex) return;
      const clip = clips[clipIndex];
      const t = Math.min(.999, audio.currentTime / clip.dur);
      let id = clip.stepId, localT = t;
      // Quick clips cover entire written stages. Let each visual substep play
      // within its recording instead of parking the whole stage on its first pose.
      if (select.value === 'quick' && clipIndex > 0 && clipIndex < clips.length - 1) {
        const stage = stops.filter(s => s.stage === Number(id.split('.')[0]));
        const at = t * stage.length;
        id = stage[Math.floor(at)].id;
        localT = at % 1;
      }
      onPosition(id, localT, select.value === 'full' ? clip.id : null);
      paint();
    }
    async function start() {
      const attempt = ++generation;
      status.hidden = true;
      playing = true;
      onStart();
      if (loaded !== clipIndex) {
        loaded = clipIndex;
        audio.src = asset(clips[clipIndex].src);
      }
      position();
      try { await audio.play(); }
      catch { if (attempt === generation) failure(); }
    }
    function selectPosition(id, opening) {
      pause();
      selection = {id, opening};
      const index = stops.findIndex(s => s.id === id);
      const stop = stops[index];
      const exact = select.value === 'full' ? clips.findIndex(c => c.id === stop?.spatialBeat) : -1;
      let pick = exact >= 0 ? exact : clips.findIndex(c => c.stepId === id);
      if (select.value === 'quick') pick = stop?.stage ?? 0;
      if (pick < 0 && stop) {
        pick = clips.findIndex(c => c.stepId.split('.')[0] === String(stop.stage));
      }
      clipIndex = opening ? 0 : Math.max(0, pick);
      loaded = -1;
      paint();
    }
    select.addEventListener('change', () => {
      const resume = playing;
      clips = tracks[select.value];
      selectPosition(selection?.id || stops[0].id, selection?.opening ?? true);
      if (resume) start();
    });
    play.addEventListener('click', () => playing ? pause() : start());
    get('captions').addEventListener('change', paint);
    get('muted').addEventListener('change', () => { audio.muted = get('muted').checked; });
    audio.addEventListener('timeupdate', () => {
      if (playing) selection = {id: clips[clipIndex].stepId, opening: false};
      position();
    });
    audio.addEventListener('error', () => { if (playing && audio.error) failure(); });
    audio.addEventListener('ended', () => {
      if (!playing) return;
      if (clipIndex + 1 < clips.length) { clipIndex++; start(); }
      else { pause(); clipIndex = 0; loaded = -1; paint(); }
    });
    return {pause, selectPosition, get playing() { return playing; }};
  }
  return {create};
})();
