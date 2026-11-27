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
  function withTransition(fn) {
    if (typeof document.startViewTransition === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { return document.startViewTransition(fn); } catch { /* fall through */ }
    }
    fn();
    return null;
  }
  const settings = {cache: 'hit', kv: 'sparse', effort: 'high'};
  const state = {index: 0, localT: 0, view: 'diagram', camera: 'director', opening: true, overview: false, present: false, recap: false};
  const readout = get('position'), slider = get('scrubber'), figure = get('figure');
  let host, suspended = false, raf = 0, timer = 0, studioOrigin, sceneBeat, speechTimer;
  let lastBoundary, explanationKey, explanationOrigin, lastScrollY = window.scrollY, holdSync = 0;
  let gesture = false, touching = false, resumeAfterScroll = false, settleTimer = 0;
  const READING_LINE = .35, SCROLL_SETTLE_MS = 160;
  const initialHash = location.hash;
  let anchorPending = Boolean(initialHash);

  const scene = {
    suspend() { suspended = true; host?.suspend(); },
    resume() { suspended = false; host?.resume(); },
    setRouting(k, bias) { host?.setRouting?.(k, bias); },
    resetPerformance() { host?.resetPerformance?.(); },
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
    const stageVisual = ({
      1: ['#st-doc', 'token'], 2: ['#st-chip', 'token'], 3: ['#st-train', 'fault'],
      4: ['#st-train', 'fault'], 5: ['#st-train', 'fault'], 6: ['#st-chip', 'cache'],
      7: ['#st-vec', 'attention'], 8: ['#st-kv', 'cache'], 9: ['#st-kv', 'cache'],
      10: ['#st-wire', 'token'], 11: ['#st-wire', 'token'], 12: ['#st-wire', 'tool']
    })[stop.stage] || ['#st-doc', 'token'];
    const stateIcon = get('state-icon');
    // draw() runs every scroll frame; only write the glyph's attributes when they change.
    if (stateIcon) {
      if (stateIcon.getAttribute('href') !== stageVisual[0]) stateIcon.setAttribute('href', stageVisual[0]);
      const head = stateIcon.closest('.figure-head');
      if (head && head.dataset.stageRole !== stageVisual[1]) head.dataset.stageRole = stageVisual[1];
    }
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
    readout.replaceChildren(pad(stop.stage) + ' / 12', Object.assign(document.createElement('span'), {className: 'rn', textContent: ' · ' + stage.name}));
    slider.value = state.index;
    slider.style.setProperty('--slider-progress', ((state.index / Math.max(1, stops.length - 1)) * 100).toFixed(2) + '%');
    slider.setAttribute('aria-valuetext', 'Stage ' + pad(stop.stage) + ' ' + stage.name + ', step ' + stop.id + ', ' + stop.title);
    get('previous').disabled = !state.index && !state.overview;
    get('next').disabled = state.index === stops.length - 1 && !state.opening;
    for (const [i, link] of stageLinks.entries()) {
      if (i + 1 === stop.stage) {
        link.setAttribute('aria-current', 'step');
        const strip = link.closest('ol');
        if (strip && strip.scrollWidth > strip.clientWidth) {
          strip.scrollLeft = link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2;
        }
      } else link.removeAttribute('aria-current');
    }
    for (const button of document.querySelectorAll('[data-view][type=button]')) {
      button.setAttribute('aria-pressed', button.dataset.view === state.view);
    }
    $('.camera').hidden = state.view !== 'spatial';
    get('explain').hidden = false;
    get('studio-play').hidden = !state.present;
    get('studio-play').textContent = timer ? 'Pause' : 'Play';
    get('studio-play').setAttribute('aria-label', timer ? 'Pause journey' : 'Play journey');
    get('present').setAttribute('aria-pressed', state.present);
    get('present').setAttribute('aria-label', state.present ? 'Read lesson' : 'Present');
    get('present').querySelector('span').textContent = state.present ? 'Read' : 'Present';
    get('runStory').setAttribute('aria-pressed', state.recap);
    get('runStory').querySelector('span').textContent = state.recap ? 'Pause recap' : 'Run end to end';
    const navKey = stop.id + ':' + state.opening;
    if (prevStep !== stop.id || lastBoundary !== navKey) {
      lastBoundary = navKey;
      if (prevStep !== stop.id) {
        clearTimeout(speechTimer);
        speechTimer = setTimeout(() => { get('announce').textContent = 'Step ' + stop.id + '. ' + stop.title; }, 280);
      }
      syncSuiteNavigation(stop, stage);
    }
    updateExplanation();
    const overallT = sceneBeat === 'f1' ? state.localT : (state.index + state.localT) / stops.length;
    const camera = state.view === 'spatial' ? state.camera : 'director';
    host?.update({...state, camera, settings, stepId: stop.id, stage: stop.stage, diagramPose: pose,
      spatialBeat: sceneBeat || stop.spatialBeat, narrated: Boolean(sceneBeat), overallT});
  }

  function anchorY() {
    const mastBottom = $('.mast').getBoundingClientRect().bottom;
    const stacked = getComputedStyle($('.spread')).display === 'block';
    return Math.round((stacked ? figure.getBoundingClientRect().bottom : mastBottom) + 12);
  }
  // The line a heading must cross to take over the figure: about 35% down the viewport,
  // never above the sticky header (or, stacked on phones, the figure that sits over the text).
  function readingLine() {
    return Math.max(anchorY() + 2, Math.round(window.innerHeight * READING_LINE));
  }
  function syncScrollProgress() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    document.documentElement.style.setProperty('--scroll-p', clamp(window.scrollY / maxScroll, 0, 1).toFixed(4));
    document.body.dataset.scrolled = window.scrollY > 24 ? 'true' : 'false';
  }
  function scrollToElement(el) {
    holdSync = performance.now() + 160;
    window.scrollTo({top: window.scrollY + el.getBoundingClientRect().top - anchorY(), behavior: 'instant'});
    syncScrollProgress();
  }
  function recordHash(hash) {
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  function syncScroll() {
    raf = 0;
    syncScrollProgress();
    if (anchorPending || state.present || state.recap || inspector.isOpen) return;
    const narrating = playback.playing;
    // A step the reader just picked (Next, a stage tab, a link) stays put until they scroll on.
    if (performance.now() < holdSync) { lastScrollY = window.scrollY; return; }
    const y = readingLine();
    // A stage takes over when its heading (not the section's padding above it) crosses the line.
    const stageIndex = Math.max(0, sections.findLastIndex(node => (node.querySelector('.st-title') || node).getBoundingClientRect().top <= y));
    const start = first[stageIndex], end = first[stageIndex + 1] ?? articles.length;
    const opening = (sections[0].querySelector('.st-title') || sections[0]).getBoundingClientRect().top > y;
    let index = start;
    for (let i = start + 1; i < end; i++) {
      if (articles[i].getBoundingClientRect().top > y) break;
      index = i;
    }
    const rect = articles[index].getBoundingClientRect();
    const lineTop = get('line')?.getBoundingClientRect().top ?? Infinity;
    const overview = !opening && lineTop <= y;
    if (state.index !== index || state.opening !== opening) {
      if (narrating) playback.seekPosition(stops[index].id, opening, opening ? 0 : clamp((y - rect.top) / Math.max(1, rect.height), 0, .999));
      else playback.selectPosition(stops[index].id, opening);
      if (location.hash.startsWith('#step-') && lastScrollY !== window.scrollY) recordHash('#step-' + stops[index].id);
    }
    lastScrollY = window.scrollY;
    Object.assign(state, {index, opening, overview, localT: opening ? 0 : clamp((y - rect.top) / Math.max(1, rect.height), 0, .999)});
    if (!narrating) sceneBeat = null;
    draw();
  }
  function scheduleScroll() { if (!raf) raf = requestAnimationFrame(syncScroll); }
  function stopRun() {
    clearInterval(timer);
    timer = 0;
    state.recap = false;
  }
  function pause() {
    resumeAfterScroll = false;
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
  function hideAuxPopovers() {
    for (const id of ['views-panel', 'steps-panel']) {
      const pop = get(id);
      if (pop?.matches(':popover-open')) pop.hidePopover();
    }
  }
  function syncSuiteNavigation(stop, stage) {
    if (!window.SuiteLinks) return;
    const rm = new URLSearchParams(location.search).get('rm') === '1';
    const syncState = state.opening ? { rm } : {
      rm,
      stage: stop.stage,
      step: stop.id,
      pos: stop.id,
      label: 'Step ' + stop.id + ' · ' + stage.name
    };
    const viewsSync = get('views-sync');
    if (viewsSync) {
      viewsSync.textContent = state.opening
        ? 'Switch format at the start of the journey'
        : 'Synced to ' + pad(stop.stage) + ' · ' + stage.name + ' (' + stop.id + ')';
    }
    for (const link of document.querySelectorAll('a[data-edition]')) {
      const href = window.SuiteLinks.editionHref('reader', link.dataset.edition, syncState);
      if (href) link.href = href;
    }
    for (const btn of document.querySelectorAll('#steps-grid .steps-jump')) {
      if (btn.dataset.stepJump === stop.id && !state.opening) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
    }
  }
  function buildQuickNav() {
    if (window.SuiteLinks) {
      window.SuiteLinks.mountReturnChip(get('readerReturnSlot'), 'reader');
    }
    const labHost = get('views-labs');
    if (labHost && window.ConceptMap) {
      for (const [slug, info] of Object.entries(window.ConceptMap.CONCEPTS)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'views-lab-btn';
        btn.dataset.inspect = slug;
        btn.dataset.stepJump = info.step;
        const name = document.createTextNode(info.button + ' ');
        const stepBadge = document.createElement('span');
        stepBadge.textContent = info.step;
        btn.append(name, stepBadge);
        labHost.appendChild(btn);
      }
    }
    const stepsGrid = get('steps-grid');
    if (stepsGrid) {
      for (let sIdx = 0; sIdx < stages.length; sIdx++) {
        const stage = stages[sIdx];
        const stageNum = sIdx + 1;
        const block = document.createElement('div');
        block.className = 'steps-stage';
        const h3 = document.createElement('h3');
        const num = document.createElement('span');
        num.textContent = pad(stageNum);
        h3.append(num, document.createTextNode(stage.name));
        const ol = document.createElement('ol');
        for (const stop of stops.filter(item => item.stage === stageNum)) {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'steps-jump';
          btn.dataset.stepJump = stop.id;
          const sn = document.createElement('span');
          sn.className = 'sj-n';
          sn.textContent = stop.id;
          btn.append(sn, document.createTextNode(stop.title));
          if (stop.conceptSlug) {
            const lab = document.createElement('span');
            lab.className = 'sj-lab';
            lab.textContent = 'Lab';
            btn.appendChild(lab);
          }
          li.appendChild(btn);
          ol.appendChild(li);
        }
        block.append(h3, ol);
        stepsGrid.appendChild(block);
      }
    }
  }
  buildQuickNav();

  function applyDepth(next) {
    const depth = next === 'deep' ? 'deep' : 'basic';
    document.body.dataset.depth = depth;
    const deep = depth === 'deep';
    const btn = get('depth-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', String(deep));
      const lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = deep ? 'Deep' : 'Basic';
    }
    const inline = get('depth-inline');
    if (inline) inline.textContent = deep ? 'Switch to Basic mode' : 'Switch to Deep mode';
  }
  function toggleDepth() {
    const next = document.body.dataset.depth === 'deep' ? 'basic' : 'deep';
    try { sessionStorage.setItem('oneTokenDepth', next); } catch {}
    applyDepth(next);
  }
  function initDepth() {
    let saved = null;
    try { saved = sessionStorage.getItem('oneTokenDepth'); } catch {}
    applyDepth(saved === 'basic' || saved === 'deep' ? saved : 'deep');
    for (const stepEl of articles) {
      const tech = stepEl?.querySelector('.technical-detail');
      if (!tech || stepEl.querySelector('.card-deep-btn')) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-deep-btn';
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = '+ Math & specs';
      btn.addEventListener('click', () => {
        const open = stepEl.dataset.cardDeep === 'true';
        if (open) {
          delete stepEl.dataset.cardDeep;
          btn.setAttribute('aria-expanded', 'false');
          btn.textContent = '+ Math & specs';
        } else {
          stepEl.dataset.cardDeep = 'true';
          btn.setAttribute('aria-expanded', 'true');
          btn.textContent = '− Hide math & specs';
        }
      });
      tech.before(btn);
    }
    const depthBtn = get('depth-btn');
    if (depthBtn) depthBtn.onclick = toggleDepth;
    const depthInline = get('depth-inline');
    if (depthInline) depthInline.onclick = toggleDepth;
  }
  initDepth();
  window.LearningPanels.reader({stops, articles, scene});

  function togglePresent() {
    hideAuxPopovers();
    if (inspector.isOpen) inspector.close();
    const entering = !state.present;
    if (entering) {
      studioOrigin = {y: window.scrollY, index: state.index, opening: state.opening, overview: state.overview};
      state.present = true;
      state.overview = false;
    } else {
      stopRun();
      state.present = false;
    }
    get('lesson').inert = state.present;
    setExplanation(false, {focus: false, instant: true});
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
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick() {
      const progress = initial + (performance.now() - start) / perStep;
      state.index = Math.min(Math.floor(progress), stops.length - 1);
      state.localT = progress >= stops.length ? .999 : reduced ? .5 : progress % 1;
      if (progress >= stops.length) { stopRun(); if (recap) syncScroll(); }
      draw();
    }
    timer = setInterval(tick, reduced ? Math.round(perStep / 2) : 55);
    tick();
  }
  function updateExplanation() {
    const dock = get('explanation');
    const stop = stops[state.index];
    const article = articles[state.index];
    const key = stop.id + ':' + state.opening + ':' + state.overview;
    if (key === explanationKey) return;
    explanationKey = key;
    dock.dataset.step = stop.id;
    const title = state.opening ? 'Word in a document' : state.overview ? 'Twelve stages, one token' : stop.id + ' · ' + stop.title;
    const source = state.opening ? $('.opening > p') : state.overview ? $('.finale > p') : article.querySelector('p');
    get('explanation-title').textContent = title;
    get('explanation-preview-title').textContent = title;
    get('explanation-preview-copy').textContent = source?.textContent || '';
    const copy = source?.cloneNode(true);
    // Glossary listeners belong to the lesson. Preserve inline emphasis/code,
    // without copying buttons whose definitions would not open in this panel.
    copy?.querySelectorAll('.gloss').forEach(button => button.replaceWith(button.textContent));
    get('explanation-copy').replaceChildren(...(copy ? [...copy.childNodes] : []));
    const detailHost = get('explanation-detail');
    if (detailHost) {
      const focusWasInDetail = detailHost.contains(document.activeElement);
      detailHost.replaceChildren();
      for (const paragraph of state.opening || state.overview ? [] : article.querySelectorAll(':scope > .plain, :scope > .why')) {
        detailHost.append(paragraph.cloneNode(true));
      }
      const effortBox = !state.opening && !state.overview && article.querySelector('fieldset.effort');
      if (effortBox) {
        const clone = effortBox.cloneNode(true);
        clone.querySelectorAll('input[type=radio]').forEach(r => { r.name = r.name + '_present'; });
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        detailHost.append(clone);
      }
      const tech = !state.opening && !state.overview && article.querySelector('.technical-detail');
      if (tech) {
        const techClone = tech.cloneNode(true);
        techClone.querySelectorAll('.eq-gloss').forEach(el => { el.textContent = ''; delete el.dataset.role; });
        detailHost.append(techClone);
      }
      if (focusWasInDetail) get('explanation-content').focus({preventScroll: true});
    }
    get('explanation-content').scrollTop = 0;
    get('explanation-preview').scrollTop = 0;
    const inspect = dock.querySelector('button[data-inspect]');
    inspect.hidden = state.opening || state.overview || !stop.conceptSlug;
    inspect.dataset.inspect = stop.conceptSlug || '';
    const concept = stop.conceptSlug && window.SuiteLinks.resolve(stop.conceptSlug);
    inspect.textContent = concept ? 'Try it → ' + concept.button : 'Try it';
  }
  const EXPLANATION_EXIT_MS = 160;
  let leaving = 0;
  // The explanation lives in its own bay beside or below the figure, so opening it never
  // moves or covers the model. It leaves with a short fade; Present/Read switches skip it.
  function setExplanation(show, {focus = true, instant = false} = {}) {
    const panel = get('explanation');
    clearTimeout(leaving);
    panel.removeAttribute('data-leaving');
    if (show) {
      if (panel.hidden) explanationOrigin = document.activeElement;
      // Narration keeps playing, but its floating controls must not obscure
      // the step the learner has just chosen to read.
      if (get('audio-panel').matches(':popover-open')) get('audio-panel').hidePopover();
      hideAuxPopovers();
      panel.hidden = false;
    } else if (!panel.hidden && !instant && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.dataset.leaving = '';
      leaving = setTimeout(() => { panel.hidden = true; panel.removeAttribute('data-leaving'); }, EXPLANATION_EXIT_MS);
    } else panel.hidden = true;
    get('explanation-preview').hidden = show;
    get('explain').setAttribute('aria-expanded', show);
    get('open-explanation').setAttribute('aria-expanded', show);
    if (!focus) return;
    if (show) get('close-explanation').focus({preventScroll: true});
    else (explanationOrigin === get('open-explanation') ? explanationOrigin : get('explain')).focus({preventScroll: true});
  }
  const playback = window.ReaderPlayback.create({
    tracks, stops, stages, asset, getPosition: () => ({id: stops[state.index].id, opening: state.opening, localT: state.localT}), onStart() { stopRun(); },
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
      hideAuxPopovers();
      if (target.dataset.stepJump) goToStep(target.dataset.stepJump, {hash: false});
      inspector.open(target.dataset.inspect, target.closest('#views-panel') ? (articles[state.index]?.querySelector('[data-inspect]') || get('views-btn')) : target);
    } else if (target.dataset.stepJump) {
      event.preventDefault();
      hideAuxPopovers();
      goToStep(target.dataset.stepJump);
    } else if (target.dataset.view) {
      state.view = target.dataset.view;
      draw();
    }
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
  get('explain').onclick = () => setExplanation(get('explanation').hidden || 'leaving' in get('explanation').dataset);
  get('open-explanation').onclick = () => setExplanation(true);
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
    cache: {hit: $('[data-out="cache"]').textContent, miss: 'Eligible prefix miss: prefill and write the 5-minute cache at $10 / MTok; uncached suffix input costs $8 / MTok.'}
  };
  function applySettingChange(input) {
    if (!input.matches('input[type=radio]')) return;
    const key = input.dataset.sync || 'effort';
    settings[key] = input.value;
    if (key === 'effort') {
      const effort = {low: 6, medium: 11, high: 16, xhigh: 21, max: 28};
      const text = effort[input.value] + ' thinking tokens in the drawing (illustrative; actual use varies by request)';
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
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || inspector.isOpen || get('audio-panel').matches(':popover-open') || get('views-panel')?.matches(':popover-open') || get('steps-panel')?.matches(':popover-open') || document.getElementById('gloss-pop')?.matches(':popover-open')) return;
    if (event.key === 'Escape') {
      if (!get('explanation').hidden && !('leaving' in get('explanation').dataset)) setExplanation(false);
      else if (state.present) togglePresent();
      else pause();
      return;
    }
    // Fields keep their own arrow keys. Buttons and links have none, so stepping still works while
    // one holds focus, as Present's Play does on entry; Space stays theirs to activate.
    if (event.target.closest('input, select, textarea, [contenteditable]')) return;
    if (event.key === ' ' && event.target.closest('button, a, summary')) return;
    const presenterKey = state.present && (event.key === 'PageDown' || event.key === 'PageUp');
    switch (presenterKey ? (event.key === 'PageDown' ? 'ArrowRight' : 'ArrowLeft') : event.key) {
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
  // A wheel or touch scroll holds narration while the page moves; the moment scrolling
  // settles it resumes from the step at the reading line. Taps that don't scroll leave it alone.
  function noteGesture(event) {
    if (event.target.closest?.('[popover], #inspector, #explanation')) return false;
    if (timer) { pause(); return false; }
    gesture = true;
    return true;
  }
  function settleSoon() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settleScroll, SCROLL_SETTLE_MS);
  }
  function settleScroll() {
    settleTimer = 0;
    if (touching) return;
    gesture = false;
    if (!resumeAfterScroll) return;
    resumeAfterScroll = false;
    if (state.present || state.recap || inspector.isOpen || document.hidden) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    syncScroll();
    if (!state.overview) playback.resume();
  }
  window.addEventListener('scroll', () => {
    if (gesture) {
      if (playback.playing) { resumeAfterScroll = true; playback.pause(); }
      if (!touching) settleSoon();
    }
    scheduleScroll();
  }, {passive: true});
  window.addEventListener('resize', scheduleScroll);
  window.addEventListener('wheel', event => { if (noteGesture(event)) settleSoon(); }, {passive: true});
  window.addEventListener('touchstart', event => { if (noteGesture(event)) touching = true; }, {passive: true});
  for (const type of ['touchend', 'touchcancel']) {
    window.addEventListener(type, () => { if (touching) { touching = false; settleSoon(); } }, {passive: true});
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
  const forceSpatial = new URLSearchParams(location.search).get('spatial') === 'force';
  let fellBack = false, insisted = false;
  function fallBackToDiagram(reason) {
    if (forceSpatial || insisted || fellBack || state.view !== 'spatial') return;
    fellBack = true;
    state.view = 'diagram';
    draw();
    get('announce').textContent = 'The 3D view ' + reason + ', so the diagram is showing. Choose Spatial to try again.';
    for (const button of document.querySelectorAll('[data-view=spatial]')) button.title = '3D model (' + reason + '; the diagram is showing)';
  }
  // Choosing Spatial again after a fallback is an explicit choice and stays.
  document.addEventListener('click', event => {
    if (fellBack && event.target.closest('[data-view=spatial]')) insisted = true;
  }, true);
  window.addEventListener('reader-spatial-slow', () => fallBackToDiagram('was running slowly on this device'));
  window.ReaderScene.create().then(result => {
    host = result;
    if (suspended) host.suspend();
    draw();
  });
})();
