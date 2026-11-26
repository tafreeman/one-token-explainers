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
    let clips = tracks.full, route = tracks.routes.full, routeIndex = 0;
    let loaded = null, playing = false, generation = 0;
    let selection = null, lastCue = '', pendingSeek = null;
    const seconds = n => Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');
    const stageOf = stepId => Number(String(stepId).split('.')[0]);
    const segment = () => route[routeIndex];
    const clipFor = item => clips.find(clip => clip.id === item.clip);

    function selectionTime() {
      const current = segment();
      if (!selection || selection.opening) return current.start;
      const position = getPosition?.();
      const progress = position?.id === selection.id && !position.opening ? position.localT : selection.localT;
      const localT = Math.max(0, Math.min(.999, Number(progress) || 0));
      const time = current.start + localT * (current.end - current.start);
      return selection.snap ? sentenceStart(current, time) : time;
    }
    // Resuming after a scroll starts the sentence the reader landed in, not mid-word.
    function sentenceStart(item, time) {
      const cue = clipFor(item)?.cues?.findLast(c => c.t <= time && c.t >= item.start);
      return cue ? cue.t : item.start;
    }
    function applySeek() {
      if (pendingSeek === null) return;
      try {
        audio.currentTime = pendingSeek;
        if (audio.readyState >= 1) pendingSeek = null;
      } catch { /* Retry after metadata on browsers that cannot seek an unloaded source. */ }
    }
    // Chapters follow narrative time, not the source MP3 order. Part cards open their part.
    function chapterStarts() {
      const starts = [];
      for (let n = 1; n <= stages.length; n++) {
        const index = route.findIndex(item => stageOf(item.stepId) === n && item.spatialBeat !== 'hero');
        if (index < 0) continue;
        starts.push({stage: n, name: stages[n - 1].name, route: index,
          offset: route.slice(0, index).reduce((sum, item) => sum + item.end - item.start, 0)});
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
      pendingSeek = null;
      routeIndex = chapter.route;
      loaded = null;
      start();
    }

    function paint() {
      const current = segment();
      const duration = route.reduce((sum, item) => sum + item.end - item.start, 0);
      const offset = route.slice(0, routeIndex).reduce((sum, item) => sum + item.end - item.start, 0);
      const at = loaded === current.clip ? (pendingSeek ?? audio.currentTime) : selectionTime();
      const within = Math.max(0, Math.min(current.end - current.start, at - current.start));
      const elapsed = offset + within;
      get('audio-time').textContent = seconds(elapsed) + ' / ' + seconds(duration);
      if (narrate?.dataset) {
        const live = narrate.querySelector('.narr-live');
        narrate.dataset.playing = String(playing);
        if (live) { live.hidden = !playing; live.textContent = seconds(elapsed); }
      }
      if (chaptersEl?.querySelectorAll) {
        const currentChapter = chapters.findLast(c => c.offset <= elapsed + .05);
        for (const b of chaptersEl.querySelectorAll('button')) {
          if (currentChapter && Number(b.dataset.stage) === currentChapter.stage) b.setAttribute('aria-current', 'true');
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
      const time = pendingSeek ?? audio.currentTime;
      const cue = loaded === current.clip && playing
        ? clipFor(current).cues.findLast(c => c.t <= time)?.s || '' : '';
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
        sizeBtn.title = on ? 'Expand panel' : 'Mini player';
        const use = get('audio-size-icon');
        if (use) use.setAttribute('href', on ? '#i-expand' : '#i-mini');
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
      loaded = null;
    }
    function finish() {
      pause();
      routeIndex = 0;
      loaded = null;
      selection = null;
      pendingSeek = null;
      paint();
    }
    function advance() {
      if (!playing) return;
      if (routeIndex + 1 >= route.length) { finish(); return; }
      const previousClip = segment().clip;
      routeIndex++;
      selection = null;
      const next = segment();
      if (next.clip === previousClip && loaded === previousClip) {
        pendingSeek = next.start;
        applySeek();
      } else {
        loaded = null;
        pendingSeek = null;
      }
      start();
    }
    function position() {
      let current = segment();
      if (!playing || loaded !== current.clip) return;
      const time = pendingSeek ?? audio.currentTime;
      // A backward seek within one MP3 reconstructs the route segment that owns it.
      if (time < current.start) {
        const earlier = route.findIndex(item => item.clip === current.clip && time >= item.start && time < item.end);
        if (earlier >= 0) {
          routeIndex = earlier;
          selection = null;
          current = segment();
        }
      }
      if (time >= current.end) { advance(); return; }
      const localT = Math.max(0, Math.min(.999, (time - current.start) / (current.end - current.start)));
      selection = {id: current.stepId, opening: current.spatialBeat === 'hero', localT};
      onPosition(current.stepId, localT, current.spatialBeat);
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
      const current = segment();
      if (loaded !== current.clip) {
        const seek = selectionTime();
        loaded = current.clip;
        audio.src = asset(clipFor(current).src);
        pendingSeek = seek;
      }
      applySeek();
      position();
      if (attempt !== generation || !playing) return;
      try { await audio.play(); }
      catch (err) { if (attempt === generation) failure(err); }
    }
    function selectPosition(id, opening, localT = 0) {
      const stop = stops.find(item => item.id === id);
      let pick = opening ? 0 : route.findIndex(item => item.stepId === id && item.selectable !== false);
      if (pick < 0 && stop) pick = route.findIndex(item => item.clip === stop.spatialBeat && item.selectable !== false);
      pause();
      selection = {id, opening, localT};
      routeIndex = Math.max(0, pick);
      pendingSeek = null;
      loaded = null;
      paint();
    }
    // Play from the reader's current place: where the audio paused if the step is
    // unchanged, otherwise the start of the sentence at the reader's position.
    function resume() {
      if (playing) return;
      if (selection && loaded !== segment().clip) selection = {...selection, snap: true};
      start();
    }
    function seekPosition(id, opening, localT = 0) {
      const resume = playing;
      selectPosition(id, opening, localT);
      if (resume) start();
    }
    select.addEventListener('change', () => {
      const resume = playing;
      const current = getPosition?.() || selection;
      pause();
      clips = tracks[select.value];
      route = tracks.routes[select.value];
      routeIndex = 0;
      loaded = null;
      selection = null;
      pendingSeek = null;
      renderChapters();
      selectPosition(current?.id || stops[0].id, current?.opening ?? true, current?.localT ?? 0);
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
      if (playing) position();
    });
    audio.addEventListener('error', () => {
      if (playing && audio.error) failure(audio.error);
    });
    audio.addEventListener('ended', () => {
      // Real MP3 metadata can be slightly shorter than the authored route duration.
      if (playing) advance();
    });
    renderChapters();
    return {pause, resume, selectPosition, seekPosition, seekStage, get playing() { return playing; }};
  }
  return {create};
})();
