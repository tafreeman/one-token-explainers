/* A single media element keeps the user's place as the figure changes views. */
window.ReaderPlayback = (() => {
  'use strict';
  function create({tracks, stops, stages = [], asset, getPosition, onPosition, onStart}) {
    const get = id => document.getElementById(id);
    const audio = new Audio();
    audio.preload = 'none';
    const play = get('play-audio'), select = get('track'), caption = get('spoken-caption');
    const status = get('audio-status'), panel = get('audio-panel'), narrStory = get('narrStory');
    const narrate = get('narrate'), chaptersEl = get('chapters'), sizeBtn = get('audio-size');
    let clips = tracks.full, clipIndex = 0, loaded = -1, playing = false, generation = 0;
    let selection = null, lastCue = '', pendingSeek = null;
    const seconds = n => Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');

    const stageOf = clip => Number(String(clip.stepId).split('.')[0]);
    function selectionTime() {
      if (!selection || selection.opening) return 0;
      const current = getPosition?.();
      const progress = current?.id === selection.id && !current.opening ? current.localT : selection.localT;
      const localT = Math.max(0, Math.min(.999, Number(progress) || 0));
      if (select.value === 'quick') {
        const stage = stops.filter(stop => stop.stage === stageOf(clips[clipIndex]));
        const index = stage.findIndex(stop => stop.id === selection.id);
        return index < 0 ? 0 : (index + localT) / stage.length * clips[clipIndex].dur;
      }
      return localT * clips[clipIndex].dur;
    }
    function applySeek() {
      if (pendingSeek === null) return;
      try {
        audio.currentTime = pendingSeek;
        if (audio.readyState >= 1) pendingSeek = null;
      } catch { /* Retry after metadata on browsers that cannot seek an unloaded source. */ }
    }
    // One chapter per lesson stage: the first clip of that stage after the previous
    // chapter began, so a clip narrated out of order (e.g. 8.3 before 7.1) cannot jump ahead.
    function chapterStarts() {
      const starts = [];
      let from = 0;
      for (let n = 1; n <= stages.length; n++) {
        let i = clips.findIndex((c, k) => k >= from && stageOf(c) === n && !/^(hero|00-intro)$/.test(c.id));
        if (i < 0) i = clips.findIndex((c, k) => k >= from && stageOf(c) === n);
        if (i < 0) continue;
        starts.push({stage: n, name: stages[n - 1].name, clip: i,
          offset: clips.slice(0, i).reduce((sum, c) => sum + c.dur, 0)});
        from = i + 1;
      }
      return starts;
    }
    let chapters = [];
    function renderChapters() {
      chapters = chapterStarts();
      if (!chaptersEl?.replaceChildren) return;
      chaptersEl.replaceChildren(...chapters.map(c => {
        const li = document.createElement('li'), button = document.createElement('button');
        button.type = 'button';
        button.dataset.stage = c.stage;
        button.setAttribute('aria-label', 'Jump to stage ' + String(c.stage).padStart(2, '0') + ', ' + c.name + ', at ' + seconds(c.offset));
        button.innerHTML = '<span>' + String(c.stage).padStart(2, '0') + '</span> ' + c.name + ' <time>' + seconds(c.offset) + '</time>';
        button.addEventListener('click', () => seekStage(c.stage));
        li.append(button);
        return li;
      }));
    }
    function seekStage(n) {
      const chapter = chapters.find(c => c.stage === n);
      if (!chapter) return;
      generation++;
      audio.pause();
      selection = null;
      clipIndex = chapter.clip;
      loaded = -1;
      start();
    }

    function paint() {
      const duration = clips.reduce((sum, c) => sum + c.dur, 0);
      const offset = clips.slice(0, clipIndex).reduce((sum, c) => sum + c.dur, 0);
      const elapsed = offset + (loaded === clipIndex ? (pendingSeek ?? audio.currentTime) : selectionTime());
      get('audio-time').textContent = seconds(elapsed) + ' / ' + seconds(duration);
      if (narrate?.dataset) {
        const live = narrate.querySelector('.narr-live');
        narrate.dataset.playing = String(playing);
        if (live) { live.hidden = !playing; live.textContent = seconds(elapsed); }
      }
      if (chaptersEl?.querySelectorAll) {
        const current = chapters.findLast(c => c.offset <= elapsed + .05);
        for (const b of chaptersEl.querySelectorAll('button')) {
          if (current && Number(b.dataset.stage) === current.stage) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
        }
      }
      play.textContent = playing ? 'Pause narration' : 'Play narration';
      play.setAttribute('aria-label', playing ? 'Pause narration' : 'Play narration');
      if (narrStory) {
        narrStory.setAttribute('aria-pressed', playing);
        const span = narrStory.querySelector('span');
        if (span) span.textContent = playing ? 'Pause narration' : 'Narrated run';
        const dur = narrStory.querySelector('.dur');
        if (dur) dur.textContent = '(' + seconds(duration) + ')';
      }
      const cue = loaded === clipIndex && playing
        ? clips[clipIndex].cues.findLast(c => c.t <= (pendingSeek ?? audio.currentTime))?.s || '' : '';
      caption.hidden = !cue || !get('captions').checked;
      if (cue !== lastCue) { caption.textContent = cue; lastCue = cue; }
    }
    // After Play the panel shrinks to a transport strip so it stops covering the figure.
    function setMini(on) {
      if (!panel?.classList) return;
      panel.classList.toggle('mini', on);
      if (sizeBtn) {
        sizeBtn.setAttribute('aria-pressed', String(on));
        sizeBtn.setAttribute('aria-label', on ? 'Expand narration panel' : 'Shrink to mini player');
        sizeBtn.textContent = on ? '▢' : '▁';
      }
    }
    sizeBtn?.addEventListener('click', () => setMini(!panel.classList.contains('mini')));
    function pause() {
      generation++;
      playing = false;
      audio.pause();
      paint();
    }
    function failure(err) {
      pause();
      status.hidden = false;
      const blocked = err && (err.name === 'NotAllowedError' || /user.*interact|gesture|permission/i.test(String(err.message || '')));
      status.textContent = blocked
        ? 'Browser blocked automatic audio playback. Press Play narration again or enable Captions to read along.'
        : 'This recording could not play. Try Play narration again, or continue with the written lesson.';
      loaded = -1;
    }
    function position() {
      if (!playing || loaded !== clipIndex) return;
      const clip = clips[clipIndex];
      const t = Math.min(.999, (pendingSeek ?? audio.currentTime) / clip.dur);
      let id = clip.stepId, localT = t;
      // Quick clips cover entire written stages. Let each visual substep play
      // within its recording instead of parking the whole stage on its first pose.
      if (select.value === 'quick' && clipIndex > 0 && clipIndex < clips.length - 1) {
        const stage = stops.filter(s => s.stage === Number(id.split('.')[0]));
        const at = t * stage.length;
        id = stage[Math.floor(at)].id;
        localT = at % 1;
      } else if (select.value === 'full' && selection?.id) {
        // When two consecutive steps share one spatialBeat clip (e.g. 1.2 and 1.3 -> 1b),
        // avoid yanking the reader backward to the earlier step at clip start.
        const currentStop = stops.find(s => s.id === selection.id);
        if (currentStop && currentStop.spatialBeat === clip.id) id = currentStop.id;
      }
      selection = {id, opening: clip.id === 'hero' || clip.id === '00-intro', localT};
      onPosition(id, localT, clip.id === '00-intro' ? 'hero' : select.value === 'full' ? clip.id : null);
      paint();
    }
    async function start() {
      const attempt = ++generation;
      status.hidden = true;
      playing = true;
      setMini(true);
      onStart();
      if (window.innerWidth < 768 && panel?.matches(':popover-open')) {
        try { panel.hidePopover(); } catch {}
      }
      if (loaded !== clipIndex) {
        const seek = selectionTime();
        loaded = clipIndex;
        audio.src = asset(clips[clipIndex].src);
        pendingSeek = seek;
        applySeek();
      }
      position();
      try { await audio.play(); }
      catch (err) { if (attempt === generation) failure(err); }
    }
    function selectPosition(id, opening, localT = 0) {
      pause();
      selection = {id, opening, localT};
      pendingSeek = null;
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
      const current = getPosition?.() || selection;
      clips = tracks[select.value];
      renderChapters();
      selectPosition(current?.id || stops[0].id, current?.opening ?? true, current?.localT || 0);
      if (resume) start();
    });
    play.addEventListener('click', () => playing ? pause() : start());
    narrStory?.addEventListener('click', () => {
      if (playing) { pause(); return; }
      selectPosition(stops[0].id, true);
      start();
    });
    get('captions').addEventListener('change', paint);
    get('muted').addEventListener('change', () => { audio.muted = get('muted').checked; });
    audio.addEventListener('loadedmetadata', () => {
      applySeek();
      position();
    });
    audio.addEventListener('timeupdate', () => {
      const activeGen = generation;
      if (playing && activeGen === generation) position();
    });
    audio.addEventListener('error', () => {
      const activeGen = generation;
      if (playing && activeGen === generation && audio.error) failure(audio.error);
    });
    audio.addEventListener('ended', () => {
      const activeGen = generation;
      if (!playing || activeGen !== generation) return;
      if (clipIndex + 1 < clips.length) { selection = null; clipIndex++; start(); }
      else { pause(); clipIndex = 0; loaded = -1; paint(); }
    });
    renderChapters();
    return {pause, selectPosition, seekStage, get playing() { return playing; }};
  }
  return {create};
})();
