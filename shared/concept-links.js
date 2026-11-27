/* Unified concept-hash registry and stage-synced navigation for all four explainers.
   Classic script so it works identically over HTTP, offline file://, and node --test. */
(function () {
  'use strict';

  // Lesson step, Observatory codes, panel labels: shared/concept-map.js is the only copy.
  const map = (typeof window !== 'undefined' && window.ConceptMap) || require('./concept-map.js');

  const PAGES = {
    story:    { dir: '',                    name: 'Journey',         sub: 'Central hub · 2D + 3D + labs', file: '../index.html',                     rootFile: './index.html' },
    reader:   { dir: 'one-token',           name: '12-Stage Reader', sub: '12 stages · Diagram + 3D',       file: '../one-token/index.html',           rootFile: './one-token/index.html' },
    swiss:    { dir: 'end-to-end-swiss',    name: 'Swiss',           sub: 'Editorial poster + scrub',       file: '../end-to-end-swiss/index.html',    rootFile: './end-to-end-swiss/index.html' },
    beamline: { dir: 'end-to-end-beamline', name: 'Beamline',        sub: '3D rail · Watch & Study',        file: '../end-to-end-beamline/index.html', rootFile: './end-to-end-beamline/index.html' },
    tour:     { dir: 'journey-tour',        name: 'Guided Tour',     sub: '30-stop 3D walk',                file: '../journey-tour/index.html',        rootFile: './journey-tour/index.html' },
    obs:      { dir: 'shared',              name: 'Observatory',     sub: '31-part 3D studio',              file: '../shared/obs-core.html',           rootFile: './shared/obs-core.html' }
  };

  const EDITION_ORDER = ['story', 'reader', 'swiss', 'beamline', 'tour', 'obs'];

  // Swiss lays out 12 stations at zero-based indices 0..11 with lead A0=0.06 and equal step widths.
  const SWISS_A0 = 0.06;
  const SWISS_STAGE_COUNTS = [3, 3, 4, 4, 3, 4, 5, 3, 3, 4, 3, 4];

  function stepToSwissG(stepId) {
    const parts = String(stepId || '').trim().split('.');
    const stage = parseInt(parts[0], 10);
    if (!(stage >= 1 && stage <= 12)) return 0;
    const count = SWISS_STAGE_COUNTS[stage - 1];
    const step = Math.max(1, Math.min(count, parseInt(parts[1] || '1', 10) || 1));
    const w = (1 - SWISS_A0) / count;
    return +((stage - 1) + SWISS_A0 + w * (step - 1)).toFixed(3);
  }

  function swissGToStep(g) {
    const n = Number(g);
    if (!Number.isFinite(n) || n <= 0.004) return '';
    if (n >= 11.996) return '12.4';
    const idx = Math.max(0, Math.min(11, Math.floor(n)));
    const count = SWISS_STAGE_COUNTS[idx];
    const w = (1 - SWISS_A0) / count;
    const k = Math.max(0, Math.min(count - 1, Math.floor((n - idx - SWISS_A0 + 1e-6) / w)));
    return (idx + 1) + '.' + (k + 1);
  }

  // Canonical step -> Beamline beat and Beamline beat -> canonical step tables.
  const STEP_TO_BEAM = {
    '1.1': '1a', '1.2': '1b', '1.3': '1b',
    '2.1': '1c', '2.2': '1c', '2.3': '1d',
    '3.1': '2a', '3.2': '2a', '3.3': '2b', '3.4': '2d',
    '4.1': '3a', '4.2': '3b', '4.3': '3c', '4.4': '3c',
    '5.1': '3e', '5.2': '3e', '5.3': '3f',
    '6.1': '4a', '6.2': '4b', '6.3': '4b', '6.4': '4c',
    '7.1': '5a', '7.2': '5d', '7.3': '5e', '7.4': '5b', '7.5': '5g',
    '8.1': '6a', '8.2': '6a', '8.3': '4d',
    '9.1': '6b', '9.2': '6b', '9.3': '6b',
    '10.1': '6c', '10.2': '6d', '10.3': '6c', '10.4': '6d',
    '11.1': '6e', '11.2': '6e', '11.3': '6e',
    '12.1': '7a', '12.2': '7c', '12.3': '7d', '12.4': '7e'
  };

  const BEAM_TO_STEP = {
    hero: '',
    p1: '1.1', '1a': '1.1', '1b': '1.2', '1c': '2.1', '1d': '2.3',
    p2: '3.1', '2a': '3.1', '2b': '3.3', '2c': '3.3', '2d': '3.4',
    p3: '4.1', '3a': '4.1', '3b': '4.2', '3c': '4.3', '3d': '4.2', '3e': '5.1', '3f': '5.3',
    p4: '6.1', '4a': '6.1', '4b': '6.2', '4c': '6.4', '4d': '8.3',
    p5: '7.1', '5a': '7.1', '5b': '7.4', '5c': '7.2', '5d': '7.2', '5e': '7.3', '5f': '7.4', '5g': '7.5',
    p6: '8.1', '6a': '8.1', '6b': '9.1', '6c': '10.1', '6d': '10.2', '6e': '11.1',
    p7: '12.1', '7a': '12.1', '7b': '12.2', '7c': '12.2', '7d': '12.3', '7e': '12.4',
    f1: '12.4', ledger: '12.4'
  };

  function beamlineBeatToStep(beat) {
    if (!beat) return '';
    return Object.hasOwn(BEAM_TO_STEP, beat) ? BEAM_TO_STEP[beat] : '';
  }

  // Complete 12-stage + sub-step bridge across all six surfaces (Swiss uses zero-based g).
  const STAGE_TARGETS = {
    '1':    { reader: '1.1',  swiss: stepToSwissG('1.1'),  beam: '1a', story: 'ch1',     tour: 1,  obsRealm: 'TRAINING',  obsFocus: 'TR-1' },
    '2':    { reader: '2.1',  swiss: stepToSwissG('2.1'),  beam: '1c', story: 'step-3',  tour: 3,  obsRealm: 'TRAINING',  obsFocus: 'TR-2' },
    '3':    { reader: '3.1',  swiss: stepToSwissG('3.1'),  beam: '2a', story: 'ch2',     tour: 5,  obsRealm: 'TRAINING',  obsFocus: 'TR-3' },
    '4':    { reader: '4.1',  swiss: stepToSwissG('4.1'),  beam: '3a', story: 'ch3',     tour: 9,  obsRealm: 'TRAINING',  obsFocus: 'TR-5' },
    '5':    { reader: '5.1',  swiss: stepToSwissG('5.1'),  beam: '3e', story: 'step-12', tour: 12, obsRealm: 'TRAINING',  obsFocus: 'TR-6' },
    '6':    { reader: '6.1',  swiss: stepToSwissG('6.1'),  beam: '4a', story: 'ch5',     tour: 22, obsRealm: 'INFERENCE', obsFocus: 'IN-1,IN-2' },
    '7':    { reader: '7.1',  swiss: stepToSwissG('7.1'),  beam: '5a', story: 'step-13', tour: 13, obsRealm: 'MODEL',     obsFocus: 'MD-1' },
    '7.1':  { reader: '7.1',  swiss: stepToSwissG('7.1'),  beam: '5a', story: 'step-13', tour: 13, obsRealm: 'MODEL',     obsFocus: 'MD-1' },
    '7.2':  { reader: '7.2',  swiss: stepToSwissG('7.2'),  beam: '5d', story: 'step-15', tour: 15, obsRealm: 'MODEL',     obsFocus: 'MD-2b,MD-2c,MD-2d' },
    '7.3':  { reader: '7.3',  swiss: stepToSwissG('7.3'),  beam: '5e', story: 'step-17', tour: 17, obsRealm: 'MODEL',     obsFocus: 'MD-2g,MD-2h' },
    '7.4':  { reader: '7.4',  swiss: stepToSwissG('7.4'),  beam: '5b', story: 'step-16', tour: 16, obsRealm: 'MODEL',     obsFocus: 'MD-2e,MD-2f,MD-2i' },
    '7.5':  { reader: '7.5',  swiss: stepToSwissG('7.5'),  beam: '5g', story: 'step-19', tour: 19, obsRealm: 'MODEL',     obsFocus: 'MD-3,MD-4' },
    '8':    { reader: '8.1',  swiss: stepToSwissG('8.1'),  beam: '6a', story: 'step-24', tour: 24, obsRealm: 'INFERENCE', obsFocus: 'IN-6' },
    '9':    { reader: '9.1',  swiss: stepToSwissG('9.1'),  beam: '6b', story: 'step-25', tour: 25, obsRealm: 'INFERENCE', obsFocus: 'IN-7' },
    '10':   { reader: '10.2', swiss: stepToSwissG('10.2'), beam: '6c', story: 'step-25', tour: 25, obsRealm: 'INFERENCE', obsFocus: 'IN-8' },
    '11':   { reader: '11.1', swiss: stepToSwissG('11.1'), beam: '6e', story: 'step-26', tour: 26, obsRealm: 'INFERENCE', obsFocus: 'IN-9,IN-10' },
    '12':   { reader: '12.1', swiss: stepToSwissG('12.1'), beam: '7a', story: 'ch6',     tour: 27, obsRealm: 'INFERENCE', obsFocus: 'IN-11' },
    '12.2': { reader: '12.2', swiss: stepToSwissG('12.2'), beam: '7c', story: 'step-30', tour: 30, obsRealm: 'INFERENCE', obsFocus: 'IN-11,IN-12' }
  };

  function stageFromStop(stopNum) {
    const n = Number(stopNum);
    if (!Number.isFinite(n) || n < 1) return '';
    if (n <= 2) return '1';
    if (n <= 4) return '2';
    if (n <= 8) return '3';
    if (n <= 11) return '4';
    if (n === 12) return '5';
    if (n === 13) return '7.1';
    if (n <= 15) return '7.2';
    if (n === 16) return '7.4';
    if (n === 17) return '7.3';
    if (n === 18) return '7.4';
    if (n <= 21) return '7.5';
    if (n <= 23) return '6';
    if (n === 24) return '8';
    if (n === 25) return '10';
    if (n === 26) return '11';
    if (n <= 29) return '12';
    return '12.2';
  }

  // Canonical 7 cross-explainer concepts mapped to native targets in each format.
  // Note: prefill-decode and mcp-loop link Swiss/Beamline lifecycle sections into
  // DeepSeek-V4 Story/Tour's PD-disaggregation and MCP component cutaways.
  const CONCEPTS = {
    'tokenization': {
      swiss:    { hash: '#s-2',  g: stepToSwissG('2.1'),  stage: 2 },
      beamline: { beat: '1c',    study: true },
      story:    { stop: 3,       ch: 1,   stepId: 'step-3' },
      tour:     { stop: 3,       hash: '#stop-3' },
      lab:      'bpe'
    },
    'mhc-residual': {
      swiss:    { hash: '#s-7',  g: stepToSwissG('7.4'),  stage: 7 },
      beamline: { beat: '5b',    study: true },
      story:    { stop: 16,      ch: 4,   stepId: 'step-16' },
      tour:     { stop: 16,      hash: '#stop-16' },
      lab:      'mix'
    },
    'csa-hca-kv': {
      swiss:    { hash: '#s-7',  g: stepToSwissG('7.2'),  stage: 7 },
      beamline: { beat: '5d',    study: true },
      story:    { stop: 15,      ch: 4,   stepId: 'step-15' },
      tour:     { stop: 15,      hash: '#stop-15' },
      lab:      'kv'
    },
    'moe-router': {
      swiss:    { hash: '#s-7',  g: stepToSwissG('7.3'),  stage: 7 },
      beamline: { beat: '5e',    study: true },
      story:    { stop: 17,      ch: 4,   stepId: 'step-17' },
      tour:     { stop: 17,      hash: '#stop-17' },
      lab:      'moe'
    },
    'prefill-decode': {
      swiss:    { hash: '#s-8',  g: stepToSwissG('8.1'),  stage: 8 },
      beamline: { beat: '6a',    study: true },
      story:    { stop: 23,      ch: 5,   stepId: 'step-23' },
      tour:     { stop: 23,      hash: '#stop-23' },
      lab:      'pd'
    },
    'utf8-sse': {
      swiss:    { hash: '#s-11', g: stepToSwissG('11.1'), stage: 11 },
      beamline: { beat: '6e',    study: true },
      story:    { stop: 26,      ch: 5,   stepId: 'step-26' },
      tour:     { stop: 26,      hash: '#stop-26' },
      lab:      'stream'
    },
    'mcp-loop': {
      swiss:    { hash: '#s-12', g: stepToSwissG('12.2'), stage: 12 },
      beamline: { beat: '7c',    study: true },
      story:    { stop: 30,      ch: 6,   stepId: 'step-30' },
      tour:     { stop: 30,      hash: '#stop-30' },
      lab:      'cache'
    }
  };

  for (const slug of Object.keys(CONCEPTS)) {
    const { label, obs, step, button, primary } = map.CONCEPTS[slug];
    Object.assign(CONCEPTS[slug], { label, obs: obs.slice(), step, button, primary });
  }

  const ALIASES = {
    'kv-cache': 'csa-hca-kv',
    'kv': 'csa-hca-kv',
    'attention': 'csa-hca-kv',
    'bpe': 'tokenization',
    'moe': 'moe-router',
    'router': 'moe-router',
    'mhc': 'mhc-residual',
    'pd': 'prefill-decode',
    'roofline': 'prefill-decode',
    'stream': 'utf8-sse',
    'sse': 'utf8-sse',
    'tools': 'mcp-loop',
    'prefix-cache': 'mcp-loop'
  };

  function resolve(slug) {
    if (!slug) return null;
    const key = String(slug).trim().toLowerCase();
    const canonical = Object.hasOwn(CONCEPTS, key) ? key : ALIASES[key];
    return canonical ? { slug: canonical, ...CONCEPTS[canonical] } : null;
  }

  // Zero-based Swiss g (0..12) <-> 11-station Beamline beat sync helpers.
  function swissToBeamlineBeat(g) {
    const step = swissGToStep(g);
    if (!step) return 'hero';
    return STEP_TO_BEAM[step] || 'hero';
  }

  function beamlineBeatToSwissG(beat) {
    const step = beamlineBeatToStep(beat);
    return step ? stepToSwissG(step) : 0;
  }

  function isRootStoryContext(currentPage) {
    if (currentPage !== 'story') return false;
    if (typeof location === 'undefined' || !location.pathname) return true;
    return !location.pathname.includes('/journey-story/');
  }

  function fileFrom(currentPage, targetPage) {
    const page = PAGES[targetPage];
    if (!page) return null;
    return isRootStoryContext(currentPage) ? page.rootFile : page.file;
  }

  function urlFor(targetPage, slug, opts = {}) {
    const page = PAGES[targetPage];
    const entry = resolve(slug);
    if (!page || !entry) return null;
    const params = new URLSearchParams();
    if (opts.rm) params.set('rm', '1');
    if (opts.from && Object.hasOwn(PAGES, opts.from)) params.set('from', opts.from);
    if (opts.pos != null && opts.pos !== '') params.set('pos', String(opts.pos));
    if (opts.label) params.set('fromLabel', String(opts.label));
    if (targetPage === 'beamline' && entry.beamline.study) params.set('study', '1');
    if (opts.openLab && entry.lab && targetPage !== 'swiss') params.set('lab', entry.lab);
    const qs = params.toString();
    const base = opts.from ? fileFrom(opts.from, targetPage) : page.file;
    return base + (qs ? '?' + qs : '') + '#concept=' + entry.slug;
  }

  function parseConceptHash(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const m = raw.match(/^concept=([a-z0-9-]+)$/i);
    return m ? resolve(m[1]) : null;
  }

  function resolveStageTarget(state = {}) {
    const step = String(state.step || '').trim();
    if (step && Object.hasOwn(STAGE_TARGETS, step)) return STAGE_TARGETS[step];
    const stageKey = String(state.stage || (step ? step.split('.')[0] : '') || '').trim();
    const base = Object.hasOwn(STAGE_TARGETS, stageKey) ? STAGE_TARGETS[stageKey] : null;
    if (base && step && Object.hasOwn(STEP_TO_BEAM, step)) {
      return { ...base, reader: step, swiss: stepToSwissG(step), beam: STEP_TO_BEAM[step] };
    }
    return base;
  }

  function editionHref(fromPage, targetPage, state = {}) {
    const base = fileFrom(fromPage, targetPage);
    if (!base) return null;
    const p = new URLSearchParams();
    if (state.rm) p.set('rm', '1');
    const target = resolveStageTarget(state);
    if (fromPage && fromPage !== targetPage && Object.hasOwn(PAGES, fromPage) && target) {
      p.set('from', fromPage);
      if (state.pos != null && state.pos !== '') p.set('pos', String(state.pos));
      if (state.label) p.set('fromLabel', String(state.label));
    }
    let hash = '';
    if (targetPage === 'reader') {
      if (target) hash = '#step-' + target.reader;
    } else if (targetPage === 'swiss') {
      if (target) p.set('g', String(+Number(target.swiss).toFixed(3)));
    } else if (targetPage === 'beamline') {
      if (target) p.set('beat', target.beam);
    } else if (targetPage === 'story') {
      if (target) hash = '#' + target.story;
    } else if (targetPage === 'tour') {
      if (target) hash = '#stop-' + target.tour;
    } else if (targetPage === 'obs') {
      p.set('realm', target ? target.obsRealm : 'MODEL');
      if (target && target.obsFocus) p.set('focus', target.obsFocus);
    }
    const qs = p.toString();
    return base + (qs ? '?' + qs : '') + hash;
  }

  function returnHref(from, pos, rm, currentPage) {
    const page = PAGES[from];
    if (!page) return null;
    const base = fileFrom(currentPage, from);
    const p = new URLSearchParams();
    if (rm) p.set('rm', '1');
    let hash = '';
    if (from === 'reader') {
      if (pos && /^\d+\.\d+$/.test(String(pos))) hash = '#step-' + pos;
      else if (pos && /^s-\d+$/.test(String(pos))) hash = '#' + pos;
      else if (pos && Object.hasOwn(CONCEPTS, String(pos))) hash = '#concept=' + pos;
    } else if (from === 'swiss') {
      const g = parseFloat(pos);
      if (Number.isFinite(g) && g > 0) p.set('g', String(+g.toFixed(3)));
      else if (/^s-\d+$/.test(String(pos || ''))) hash = '#' + pos;
    } else if (from === 'beamline') {
      if (pos && /^[a-z0-9]+$/i.test(String(pos))) p.set('beat', String(pos));
    } else if (from === 'tour') {
      const n = parseInt(pos, 10);
      if (n >= 1 && n <= 30) hash = '#stop-' + n;
    } else if (from === 'story') {
      if (pos && /^(ch[1-6]|step-\d+)$/.test(String(pos))) hash = '#' + pos;
    } else if (from === 'obs') {
      if (pos && /^(TR|MD|IN)-[0-9a-z]+$/i.test(String(pos))) p.set('focus', String(pos));
      else p.set('realm', (pos && /^(ALL|TRAINING|MODEL|INFERENCE)$/.test(String(pos))) ? String(pos) : 'MODEL');
    }
    const qs = p.toString();
    return base + (qs ? '?' + qs : '') + hash;
  }

  function mountReturnChip(container, currentPage) {
    if (typeof document === 'undefined' || !container) return null;
    const existing = container.querySelector('.suite-return');
    if (existing) return existing;
    const qs = new URLSearchParams(location.search);
    const from = qs.get('from');
    if (!from || from === currentPage || !Object.hasOwn(PAGES, from)) return null;
    const pos = qs.get('pos') || '';
    const rm = qs.get('rm') === '1';
    const href = returnHref(from, pos, rm, currentPage);
    if (!href) return null;
    const customLabel = qs.get('fromLabel');
    const stageText = customLabel ? ' · ' + customLabel :
      (from === 'reader' && pos ? ' · ' + (map.backLabel(pos) || 'Step ' + pos) :
      from === 'swiss' && pos ? ' · Stage ' + Math.max(1, Math.min(12, (Math.floor(parseFloat(pos)) + 1) || 1)) :
      from === 'beamline' && pos ? ' · Beat ' + pos :
      from === 'tour' && pos ? ' · Stop ' + pos : '');
    const link = document.createElement('a');
    link.className = 'suite-return';
    link.href = href;
    link.textContent = '← Back to ' + PAGES[from].name + stageText;
    container.prepend(link);
    return link;
  }

  function mountSuiteMenu(anchorEl, opts = {}) {
    if (typeof document === 'undefined' || !anchorEl || !anchorEl.parentNode) return null;
    const currentPage = opts.currentPage || '';
    const getState = typeof opts.getState === 'function' ? opts.getState : () => ({});
    const details = document.createElement('details');
    details.className = 'suite-menu';
    const summary = document.createElement('summary');
    summary.className = 'suite-menu-btn';
    summary.title = 'Switch between all 6 views & 7 labs at this stage';
    const lbl = document.createElement('span');
    lbl.className = 'suite-menu-lbl';
    lbl.textContent = 'Views';
    const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chev.setAttribute('viewBox', '0 0 12 12');
    chev.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm2.5 4.5 3.5 3.5 3.5-3.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    chev.appendChild(path);
    summary.append(lbl, chev);

    const panel = document.createElement('div');
    panel.className = 'suite-menu-panel';
    const syncNote = document.createElement('p');
    syncNote.className = 'suite-menu-sync';
    syncNote.textContent = 'Switch edition at this point';
    const list = document.createElement('div');
    list.className = 'suite-menu-list';
    const links = new Map();

    for (const key of EDITION_ORDER) {
      const ed = PAGES[key];
      const isCurrent = key === currentPage;
      const item = document.createElement(isCurrent ? 'span' : 'a');
      item.className = 'suite-menu-item';
      if (isCurrent) item.setAttribute('aria-current', 'page');
      else item.href = editionHref(currentPage, key, {});
      const top = document.createElement('span');
      top.className = 'suite-menu-top';
      const title = document.createElement('strong');
      title.textContent = ed.name;
      top.appendChild(title);
      if (isCurrent) {
        const badge = document.createElement('em');
        badge.className = 'suite-menu-now';
        badge.textContent = 'Current';
        top.appendChild(badge);
      }
      const sub = document.createElement('span');
      sub.className = 'suite-menu-sub';
      sub.textContent = ed.sub;
      item.append(top, sub);
      list.appendChild(item);
      if (!isCurrent) links.set(key, item);
    }
    const labsWrap = document.createElement('div');
    labsWrap.className = 'suite-menu-labs';
    const labsHd = document.createElement('p');
    labsHd.className = 'suite-menu-labs-hd';
    labsHd.textContent = 'Hands-on labs';
    const labsList = document.createElement('div');
    labsList.className = 'suite-menu-lab-list';
    const labTarget = opts.labTarget || (currentPage === 'story' ? 'story' : 'reader');
    const onLabSelect = typeof opts.onLabSelect === 'function' ? opts.onLabSelect : null;
    const labLinks = new Map();
    for (const slug of Object.keys(CONCEPTS)) {
      const entry = CONCEPTS[slug];
      const a = document.createElement('a');
      a.className = 'suite-menu-lab';
      a.textContent = entry.button || entry.label;
      a.href = urlFor(labTarget, slug, { from: currentPage, openLab: labTarget === 'story' });
      if (onLabSelect) {
        a.addEventListener('click', e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          details.open = false;
          onLabSelect(slug, entry, a);
        });
      }
      labsList.appendChild(a);
      labLinks.set(slug, a);
    }
    labsWrap.append(labsHd, labsList);
    panel.append(syncNote, list, labsWrap);
    details.append(summary, panel);
    anchorEl.after(details);

    function refresh() {
      const rm = new URLSearchParams(location.search).get('rm') === '1';
      const st = { rm, ...(getState() || {}) };
      syncNote.textContent = st.label ? 'Synced · ' + st.label : 'Switch view (keeps place)';
      for (const [key, a] of links) {
        a.href = editionHref(currentPage, key, st);
      }
      for (const [slug, a] of labLinks) {
        a.href = urlFor(labTarget, slug, {
          rm,
          from: currentPage,
          pos: st.pos,
          label: st.label,
          openLab: labTarget === 'story'
        });
      }
      const rect = summary.getBoundingClientRect();
      panel.classList.toggle('align-right', rect.left > window.innerWidth * 0.55);
    }
    details.addEventListener('toggle', () => { if (details.open) refresh(); });
    summary.addEventListener('pointerdown', refresh);
    summary.addEventListener('focus', refresh);
    document.addEventListener('pointerdown', e => {
      if (details.open && !details.contains(e.target)) details.open = false;
    });
    details.addEventListener('keydown', e => {
      if (e.key === 'Escape' && details.open) {
        e.preventDefault();
        e.stopPropagation();
        details.open = false;
        summary.focus({ preventScroll: true });
      }
    });
    return { element: details, refresh };
  }

  function pulseTarget(el) {
    if (!el || typeof document === 'undefined') return;
    if (document.documentElement.classList.contains('rm')) return;
    el.classList.remove('suite-arrived');
    void el.offsetWidth;
    el.classList.add('suite-arrived');
  }

  const api = Object.freeze({
    PAGES, EDITION_ORDER, STAGE_TARGETS, CONCEPTS, ALIASES, map, resolve, urlFor, parseConceptHash,
    stepToSwissG, swissGToStep, beamlineBeatToStep, swissToBeamlineBeat, beamlineBeatToSwissG,
    stageFromStop, editionHref, returnHref, mountReturnChip, mountSuiteMenu, pulseTarget
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SuiteLinks = api;
})();
