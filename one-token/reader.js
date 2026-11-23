(() => {
  'use strict';
  const {stops, stages, tracks} = window.ReaderManifest;
  const $ = selector => document.querySelector(selector);
  const get = id => document.getElementById(id);
  const assetBase = new URL('.', document.currentScript.src);
  const asset = path => new URL(path, assetBase).href;
  const articles = stops.map(stop => get('step-' + stop.id));
  const sections = stages.map((_, i) => get('s-' + (i + 1)));
  const stageLinks = [...document.querySelectorAll('.rail ol a')];
  const first = stages.map((_, i) => stops.findIndex(stop => stop.stage === i + 1));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad = n => String(n).padStart(2, '0');
  const settings = {cache: 'hit', kv: 'sparse', effort: 'high'};
  const state = {index: 0, localT: 0, view: 'diagram', camera: 'director', opening: true, overview: false, present: false, recap: false};
  const readout = get('position'), slider = get('scrubber'), figure = get('figure');
  let host, suspended = false, raf = 0, timer = 0, studioOrigin, sceneBeat, speechTimer;
  let lastBoundary, lastScrollY = window.scrollY;
  const initialHash = location.hash;
  let anchorPending = Boolean(initialHash);

  const scene = {
    suspend() { suspended = true; host?.suspend(); },
    resume() { suspended = false; host?.resume(); },
    setRouting(k, bias) { host?.setRouting?.(k, bias); },
    stats() { return host?.stats() || {frames: 0, calls: 0, revision: null}; }
  };

  function draw() {
    const stop = stops[state.index], stage = stages[stop.stage - 1];
    const isArgument = stop.stage === 11 || stop.id === '10.4';
    const form = isArgument ? 'tool argument · no leading space' : stop.tokenForm;
    const prevStep = document.body.dataset.step;
    document.body.dataset.step = stop.id;
    document.body.dataset.mode = state.present ? 'present' : 'read';
    document.body.dataset.view = state.view;
    articles.forEach((el, idx) => el?.toggleAttribute('data-active', !state.opening && !state.overview && idx === state.index));
    get('token-form').textContent = form;
    get('token-id').textContent = (isArgument ? 'ID 9021' : 'ID 12842') + ' · illustrative';
    $('.space-mark').style.visibility = isArgument ? 'hidden' : '';
    const next = stages[Math.min(stages.length - 1, stop.stage)];
    const [g0, g1] = stop.diagramPose;
    const pose = g0 + (g1 - g0) * state.localT;
    const blend = state.opening ? 0 : clamp((pose - stop.stage + .28) / .28, 0, 1);
    const [width, weight] = stage.glyphAxes.map((axis, i) => Math.round(axis + (next.glyphAxes[i] - axis) * blend));
    const glyph = get('glyph');
    glyph.style.fontVariationSettings = '"wdth" ' + width + ', "wght" ' + weight + ', "opsz" 144';
    glyph.style.letterSpacing = width < 60 ? '0.015em' : '';
    get('plate-id').textContent = state.overview ? '12 / 12' : pad(stop.stage) + ' / 12';
    get('figure-name').textContent = state.overview ? 'The whole line' : stage.name;
    get('step-name').textContent = state.opening ? 'Word in a document' : state.overview ? 'Twelve stages, one token' : stop.title;
    readout.textContent = pad(stop.stage) + ' / 12 · ' + stage.name;
    slider.value = state.index;
    slider.setAttribute('aria-valuetext', 'Step ' + stop.id + ', ' + stop.title);
    get('previous').disabled = !state.index && !state.overview;
    get('next').disabled = state.index === stops.length - 1 && !state.opening;
    for (const [i, link] of stageLinks.entries()) {
      if (i + 1 === stop.stage) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    for (const button of document.querySelectorAll('[data-view][type=button]')) {
      button.setAttribute('aria-pressed', button.dataset.view === state.view);
    }
    $('.camera').hidden = state.view !== 'spatial';
    get('explain').hidden = !state.present;
    get('studio-play').hidden = !state.present;
    get('studio-play').textContent = timer ? 'Pause' : 'Play';
    get('studio-play').setAttribute('aria-label', timer ? 'Pause journey' : 'Play journey');
    get('present').setAttribute('aria-pressed', state.present);
    get('present').setAttribute('aria-label', state.present ? 'Read lesson' : 'Present');
    get('present').querySelector('span').textContent = state.present ? 'Read' : 'Present';
    get('runStory').setAttribute('aria-pressed', state.recap);
    get('runStory').querySelector('span').textContent = state.recap ? 'Pause recap' : 'Run end to end';
    if (prevStep !== stop.id || !lastBoundary) {
      lastBoundary = stop.id;
      clearTimeout(speechTimer);
      speechTimer = setTimeout(() => { get('announce').textContent = 'Step ' + stop.id + '. ' + stop.title; }, 280);
      updateExplanation();
    }
    const overallT = sceneBeat === 'f1' ? state.localT : (state.index + state.localT) / stops.length;
    const camera = state.view === 'spatial' ? state.camera : 'director';
    host?.update({...state, camera, settings, stepId: stop.id, stage: stop.stage, diagramPose: pose, spatialBeat: sceneBeat || stop.spatialBeat, overallT});
  }

  function anchorY() {
    const mastBottom = $('.mast').getBoundingClientRect().bottom;
    const stacked = getComputedStyle($('.spread')).display === 'block';
    return Math.round((stacked ? figure.getBoundingClientRect().bottom : mastBottom) + 12);
  }
  function scrollToElement(el) {
    window.scrollTo({top: window.scrollY + el.getBoundingClientRect().top - anchorY(), behavior: 'instant'});
  }
  function recordHash(hash) {
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  function syncScroll() {
    raf = 0;
    if (anchorPending || state.present || state.recap || playback.playing || inspector.isOpen) return;
    const y = anchorY() + 2;
    const stageIndex = Math.max(0, sections.findLastIndex(node => node.getBoundingClientRect().top <= y));
    const start = first[stageIndex], end = first[stageIndex + 1] ?? articles.length;
    const opening = sections[0].getBoundingClientRect().top > y;
    let index = start;
    for (let i = start + 1; i < end; i++) {
      if (articles[i].getBoundingClientRect().top > y) break;
      index = i;
    }
    const rect = articles[index].getBoundingClientRect();
    const lineTop = get('line')?.getBoundingClientRect().top ?? Infinity;
    const overview = !opening && lineTop <= y;
    if (state.index !== index || state.opening !== opening) {
      playback.selectPosition(stops[index].id, opening);
      if (location.hash.startsWith('#step-') && lastScrollY !== window.scrollY) recordHash('#step-' + stops[index].id);
    }
    lastScrollY = window.scrollY;
    Object.assign(state, {index, opening, overview, localT: opening ? 0 : clamp((y - rect.top) / Math.max(1, rect.height), 0, .999)});
    sceneBeat = null;
    draw();
  }
  function scheduleScroll() { if (!raf) raf = requestAnimationFrame(syncScroll); }
  function stopRun() {
    clearInterval(timer);
    timer = 0;
    state.recap = false;
  }
  function pause() {
    playback.pause();
    stopRun();
    draw();
  }
  function move(index, {scroll = true, header = false, hash = true} = {}) {
    pause();
    if (inspector.isOpen) inspector.close();
    index = clamp(index, 0, stops.length - 1);
    const stop = stops[index];
    Object.assign(state, {index, localT: 0, opening: false, overview: false});
    sceneBeat = null;
    if (scroll && !state.present) scrollToElement(header ? sections[stop.stage - 1] : articles[index]);
    if (hash) recordHash(header ? '#s-' + stop.stage : '#step-' + stop.id);
    playback.selectPosition(stop.id, false);
    draw();
  }
  function goToStep(id, options) {
    const index = stops.findIndex(stop => stop.id === id);
    if (index >= 0) move(index, options);
  }
  function togglePresent() {
    if (inspector.isOpen) inspector.close();
    if (!state.present) {
      studioOrigin = {y: window.scrollY, index: state.index, opening: state.opening, overview: state.overview};
      state.present = true;
      state.overview = false;
    } else {
      stopRun();
      state.present = false;
    }
    get('lesson').inert = state.present;
    get('explanation').hidden = true;
    get('explain').setAttribute('aria-expanded', false);
    draw();
    if (state.present) {
      requestAnimationFrame(() => get('studio-play')?.focus({preventScroll: true}));
    } else {
      if (studioOrigin.index === state.index && studioOrigin.opening === state.opening) window.scrollTo({top: studioOrigin.y, behavior: 'instant'});
      else scrollToElement(articles[state.index]);
      get('present').focus({preventScroll: true});
    }
  }
  function run(recap) {
    if (timer) { pause(); if (recap) syncScroll(); return; }
    playback.pause();
    if (recap || state.index === stops.length - 1) state.index = 0;
    state.opening = false;
    state.overview = false;
    state.recap = recap;
    sceneBeat = null;
    const start = performance.now();
    const initial = state.index;
    const perStep = recap ? 650 : 1800;
    function tick() {
      const progress = initial + (performance.now() - start) / perStep;
      state.index = Math.min(Math.floor(progress), stops.length - 1);
      state.localT = progress >= stops.length ? .999 : progress % 1;
      if (progress >= stops.length) { stopRun(); if (recap) syncScroll(); }
      draw();
    }
    timer = setInterval(tick, matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 55);
    tick();
  }
  function updateExplanation() {
    const dock = get('explanation');
    const stop = stops[state.index];
    const article = articles[state.index];
    dock.querySelector('h2').textContent = stop.id + ' · ' + stop.title;
    dock.querySelector('p').textContent = article.querySelector('p')?.textContent || '';
    const detailHost = get('explanation-detail');
    if (detailHost) {
      detailHost.replaceChildren();
      const effortBox = article.querySelector('fieldset.effort');
      if (effortBox) {
        const clone = effortBox.cloneNode(true);
        clone.querySelectorAll('input[type=radio]').forEach(r => { r.name = r.name + '_present'; });
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        detailHost.append(clone);
      }
      const tech = article.querySelector('.technical-detail');
      if (tech) detailHost.append(tech.cloneNode(true));
    }
    const inspect = dock.querySelector('button[data-inspect]');
    inspect.hidden = !stop.conceptSlug;
    inspect.dataset.inspect = stop.conceptSlug || '';
  }
  function setExplanation(show) {
    get('explanation').hidden = !show;
    get('explain').setAttribute('aria-expanded', show);
    if (show) get('close-explanation').focus();
    else get('explain').focus();
  }
  const playback = window.ReaderPlayback.create({
    tracks, stops, asset, getPosition: () => ({id: stops[state.index].id, opening: state.opening, localT: state.localT}), onStart() { stopRun(); },
    onPosition(id, localT, beat) {
      const from = state.index;
      state.index = stops.findIndex(stop => stop.id === id);
      if (state.index < 0) return;
      state.opening = beat === 'hero';
      state.localT = localT;
      sceneBeat = beat;
      if (from !== state.index && !state.present) scrollToElement(articles[state.index]);
      draw();
    }
  });
  const inspector = window.ReaderInspector.create({asset, scene, goToStep, pause});

  function followHash() {
    const hash = location.hash;
    const concept = window.SuiteLinks.parseConceptHash(hash);
    if (concept) {
      const stop = stops.find(s => s.conceptSlug === concept.slug);
      if (stop) {
        goToStep(stop.id, {hash: false});
        inspector.open(concept.slug, articles[state.index].querySelector('[data-inspect]'));
      }
      return;
    }
    if (inspector.isOpen) inspector.close();
    if (/^#step-\d+\.\d+$/.test(hash)) goToStep(hash.slice(6), {hash: false});
    else if (/^#s-(?:[1-9]|1[012])$/.test(hash)) move(first[Number(hash.slice(3)) - 1], {header: true, hash: false});
    else if (hash === '#sources' || hash === '#top') {
      if (state.present) togglePresent();
      pause();
      if (hash === '#top') window.scrollTo(0, 0);
      else scrollToElement(get('sources'));
      syncScroll();
    }
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('button,a');
    if (!target || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
    if (target.dataset.inspect) {
      event.preventDefault();
      inspector.open(target.dataset.inspect, target);
    } else if (target.dataset.view) { state.view = target.dataset.view; draw(); }
    else if (target.matches('a[href^="#s-"], a[href="#sources"], a[href="#top"]')) {
      event.preventDefault();
      const hash = target.getAttribute('href');
      if (location.hash !== hash) history.pushState(null, '', hash);
      followHash();
    }
  });
  get('camera').onchange = event => { state.camera = event.target.value; draw(); };
  get('present').onclick = togglePresent;
  get('previous').onclick = () => move(state.overview ? stops.length - 1 : state.index - 1);
  get('next').onclick = () => move(state.opening ? 0 : state.index + 1);
  get('studio-play').onclick = () => run(false);
  get('runStory').onclick = () => run(true);
  get('explain').onclick = () => setExplanation(get('explanation').hidden);
  get('close-explanation').onclick = () => setExplanation(false);
  get('explain').setAttribute('aria-controls', 'explanation');
  slider.oninput = () => move(Number(slider.value));
  // The browser owns range values and keyboard semantics. Capture a single
  // pointer through a drag; cancel, capture loss and blur all release the thumb.
  let pointer = null;
  slider.addEventListener('pointerdown', event => {
    if (!event.isPrimary || pointer !== null) { event.preventDefault(); return; }
    pointer = event.pointerId;
    slider.setPointerCapture(pointer);
  });
  function release() {
    const held = pointer;
    pointer = null;
    if (held !== null && slider.hasPointerCapture(held)) slider.releasePointerCapture(held);
  }
  for (const type of ['pointerup','pointercancel','lostpointercapture']) slider.addEventListener(type, release);
  window.addEventListener('blur', release);
  const descriptions = {
    kv: {sparse: $('[data-out="kv"]').textContent, dense: 'Illustrative dense attention reads all stored history. KV format and precision determine storage; this switch gives no measured bandwidth or speed ratio.'},
    cache: {hit: $('[data-out="cache"]').textContent, miss: 'Cold prefix cache miss ($8.00 / MTok): the full prompt is processed again.'}
  };
  function applySettingChange(input) {
    if (!input.matches('input[type=radio]')) return;
    const key = input.dataset.sync || 'effort';
    settings[key] = input.value;
    if (key === 'effort') {
      const effort = {low: 6, medium: 11, high: 16, xhigh: 21, max: 28};
      const text = effort[input.value] + ' thinking tokens in the drawing (illustrative; real runs use far more)';
      get('effortOut').textContent = text;
      document.querySelectorAll('input[name="effort"], input[name="effort_present"]').forEach(el => { el.checked = el.value === input.value; });
      document.querySelectorAll('#explanation-detail .effort-out').forEach(el => { el.textContent = text; });
    } else {
      document.querySelectorAll('input[data-sync="' + key + '"]').forEach(el => { el.checked = el.value === input.value; });
      document.querySelectorAll('output[data-out="' + key + '"]').forEach(el => { el.textContent = descriptions[key][input.value]; });
    }
    draw();
  }
  get('lesson').addEventListener('change', event => applySettingChange(event.target));
  get('explanation')?.addEventListener('change', event => applySettingChange(event.target));
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || inspector.isOpen || get('audio-panel').matches(':popover-open')) return;
    if (event.key === 'Escape') {
      if (!get('explanation').hidden) setExplanation(false);
      else if (state.present) togglePresent();
      else pause();
      return;
    }
    if (event.target.closest('input, select, button, a, summary, textarea, [contenteditable]')) return;
    switch (event.key) {
      case 'ArrowRight': move(state.opening ? 0 : state.index + 1); break;
      case 'ArrowLeft': move(state.overview ? stops.length - 1 : state.index - 1); break;
      case 'Home': move(0); break;
      case 'End': move(stops.length - 1); break;
      case ' ': if (state.present) run(false); else return; break;
      default: return;
    }
    event.preventDefault();
  });
  window.addEventListener('hashchange', followHash);
  window.addEventListener('scroll', scheduleScroll, {passive: true});
  window.addEventListener('resize', scheduleScroll);
  for (const type of ['wheel','touchstart']) {
    get('lesson').addEventListener(type, () => { if (playback.playing || timer) pause(); }, {passive: true});
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && timer) pause(); });
  document.documentElement.classList.add('enabled');
  window.OneToken = {scene, goToStep};
  if (initialHash) {
    // Fragment positioning, font metrics and the sticky plate are resolved
    // during layout. Keep the requested stop until that first layout is stable.
    Promise.all([document.fonts.ready, new Promise(resolve => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, {once: true});
    })]).then(() => requestAnimationFrame(() => {
      anchorPending = false;
      followHash();
    }));
  } else syncScroll();
  window.ReaderScene.create().then(result => {
    host = result;
    if (suspended) host.suspend();
    draw();
  });
})();
