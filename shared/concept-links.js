/* Unified concept-hash registry and stage-synced navigation for all four explainers.
   Classic script so it works identically over HTTP, offline file://, and node --test. */
(function () {
  'use strict';

  // Lesson step, Observatory codes, panel labels: shared/concept-map.js is the only copy.
  const map = (typeof window !== 'undefined' && window.ConceptMap) || require('./concept-map.js');

  const PAGES = {
    reader:   { dir: '',                    name: 'One Token',   file: '../index.html' },
    swiss:    { dir: 'end-to-end-swiss',    name: 'Swiss',       file: '../end-to-end-swiss/index.html' },
    beamline: { dir: 'end-to-end-beamline', name: 'Beamline',    file: '../end-to-end-beamline/index.html' },
    story:    { dir: 'journey-story',       name: 'Story',       file: '../journey-story/index.html' },
    tour:     { dir: 'journey-tour',        name: 'Guided Tour', file: '../journey-tour/index.html' },
    obs:      { dir: 'shared',              name: 'Observatory', file: '../shared/obs-core.html' }
  };

  // Canonical 7 cross-explainer concepts mapped to native targets in each format.
  // Note: prefill-decode and mcp-loop link Swiss/Beamline lifecycle sections into
  // DeepSeek-V4 Story/Tour's PD-disaggregation and MCP component cutaways.
  const CONCEPTS = {
    'tokenization': {
      swiss:    { hash: '#s-2',  g: 2.0,  stage: 2 },
      beamline: { beat: '1c',    study: true },
      story:    { stop: 3,       ch: 1,   stepId: 'step-3' },
      tour:     { stop: 3,       hash: '#stop-3' },
      lab:      'bpe'
    },
    'mhc-residual': {
      swiss:    { hash: '#s-7',  g: 7.4,  stage: 7 },
      beamline: { beat: '5b',    study: true },
      story:    { stop: 16,      ch: 4,   stepId: 'step-16' },
      tour:     { stop: 16,      hash: '#stop-16' },
      lab:      'mix'
    },
    'csa-hca-kv': {
      swiss:    { hash: '#s-7',  g: 7.2,  stage: 7 },
      beamline: { beat: '5d',    study: true },
      story:    { stop: 15,      ch: 4,   stepId: 'step-15' },
      tour:     { stop: 15,      hash: '#stop-15' },
      lab:      'kv'
    },
    'moe-router': {
      swiss:    { hash: '#s-7',  g: 7.3,  stage: 7 },
      beamline: { beat: '5e',    study: true },
      story:    { stop: 17,      ch: 4,   stepId: 'step-17' },
      tour:     { stop: 17,      hash: '#stop-17' },
      lab:      'moe'
    },
    'prefill-decode': {
      swiss:    { hash: '#s-8',  g: 8.0,  stage: 8 },
      beamline: { beat: '6a',    study: true },
      story:    { stop: 23,      ch: 5,   stepId: 'step-23' },
      tour:     { stop: 23,      hash: '#stop-23' },
      lab:      'pd'
    },
    'utf8-sse': {
      swiss:    { hash: '#s-11', g: 11.1, stage: 11 },
      beamline: { beat: '6e',    study: true },
      story:    { stop: 26,      ch: 5,   stepId: 'step-26' },
      tour:     { stop: 26,      hash: '#stop-26' },
      lab:      'stream'
    },
    'mcp-loop': {
      swiss:    { hash: '#s-12', g: 12.2, stage: 12 },
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

  // Lossless 12-stage (Swiss g) <-> 11-station (Beamline beat) sync table.
  const SWISS_TO_BEAM = [
    'hero', '1a', '1c', '2a', '3a', '3e', '4a', '5a', '6a', '6b', '6c', '6e', '7a'
  ];
  const BEAM_PREFIX_TO_G = {
    hero: 0, p1: 1, '1a': 1, '1b': 1.5, '1c': 2, '1d': 2.5,
    p2: 3, '2a': 3, '2b': 3.3, '2c': 3.6, '2d': 3.9,
    p3: 4, '3a': 4, '3b': 4.3, '3c': 4.6, '3d': 4.8, '3e': 5, '3f': 5.4,
    p4: 6, '4a': 6, '4b': 6.3, '4c': 6.6, '4d': 6.9,
    p5: 7, '5a': 7, '5b': 7.4, '5c': 7.2, '5d': 7.2, '5e': 7.3, '5f': 7.4, '5g': 7.6,
    p6: 8, '6a': 8, '6b': 9, '6c': 10, '6d': 10.4, '6e': 11,
    p7: 12, '7a': 12, '7b': 12.1, '7c': 12.2, '7d': 12.3, '7e': 12.4,
    f1: 12, ledger: 12
  };

  function resolve(slug) {
    if (!slug) return null;
    const key = String(slug).trim().toLowerCase();
    const canonical = Object.hasOwn(CONCEPTS, key) ? key : ALIASES[key];
    return canonical ? { slug: canonical, ...CONCEPTS[canonical] } : null;
  }

  function swissToBeamlineBeat(g) {
    const n = Number(g);
    if (!Number.isFinite(n)) return 'hero';
    if (n >= 7.15 && n < 7.28) return '5d';
    if (n >= 7.28 && n < 7.38) return '5e';
    if (n >= 7.38 && n < 7.55) return '5b';
    const idx = Math.max(0, Math.min(SWISS_TO_BEAM.length - 1, Math.round(n)));
    return SWISS_TO_BEAM[idx];
  }

  function beamlineBeatToSwissG(beat) {
    if (!beat) return 0;
    return Object.hasOwn(BEAM_PREFIX_TO_G, beat) ? BEAM_PREFIX_TO_G[beat] : 0;
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
    return page.file + (qs ? '?' + qs : '') + '#concept=' + entry.slug;
  }

  function parseConceptHash(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const m = raw.match(/^concept=([a-z0-9-]+)$/i);
    return m ? resolve(m[1]) : null;
  }

  function returnHref(from, pos, rm) {
    const page = PAGES[from];
    if (!page) return null;
    const p = new URLSearchParams();
    if (rm) p.set('rm', '1');
    let hash = '';
    if (from === 'reader') {
      if (pos && /^\d+\.\d+$/.test(String(pos))) hash = '#step-' + pos;
      else if (pos && /^s-\d+$/.test(String(pos))) hash = '#' + pos;
      else if (pos && Object.hasOwn(CONCEPTS, String(pos))) hash = '#concept=' + pos;
    } else if (from === 'swiss') {
      const g = parseFloat(pos);
      if (Number.isFinite(g) && g > 0) p.set('g', g.toFixed(1));
      else if (/^s-\d+$/.test(String(pos || ''))) hash = '#' + pos;
    } else if (from === 'beamline') {
      if (pos && /^[a-z0-9]+$/i.test(String(pos))) p.set('beat', String(pos));
    } else if (from === 'tour') {
      const n = parseInt(pos, 10);
      if (n >= 1 && n <= 30) hash = '#stop-' + n;
    } else if (from === 'story') {
      if (pos && /^(ch[1-6]|step-\d+)$/.test(String(pos))) hash = '#' + pos;
    }
    const qs = p.toString();
    return page.file + (qs ? '?' + qs : '') + hash;
  }

  function mountReturnChip(container, currentPage) {
    if (typeof document === 'undefined' || !container) return null;
    const qs = new URLSearchParams(location.search);
    const from = qs.get('from');
    if (!from || from === currentPage || !Object.hasOwn(PAGES, from)) return null;
    const pos = qs.get('pos') || '';
    const rm = qs.get('rm') === '1';
    const href = returnHref(from, pos, rm);
    if (!href) return null;
    const customLabel = qs.get('fromLabel');
    const stageText = customLabel ? ' · ' + customLabel :
      (from === 'reader' && pos ? ' · ' + (map.backLabel(pos) || 'Step ' + pos) :
      from === 'swiss' && pos ? ' · Stage ' + Math.max(1, Math.min(12, Math.round(parseFloat(pos)) || 1)) :
      from === 'beamline' && pos ? ' · Beat ' + pos :
      from === 'tour' && pos ? ' · Stop ' + pos : '');
    const link = document.createElement('a');
    link.className = 'suite-return';
    link.href = href;
    link.textContent = '← Back to ' + PAGES[from].name + stageText;
    container.prepend(link);
    return link;
  }

  function pulseTarget(el) {
    if (!el || typeof document === 'undefined') return;
    if (document.documentElement.classList.contains('rm')) return;
    el.classList.remove('suite-arrived');
    void el.offsetWidth;
    el.classList.add('suite-arrived');
  }

  const api = Object.freeze({
    PAGES, CONCEPTS, ALIASES, map, resolve, urlFor, parseConceptHash,
    swissToBeamlineBeat, beamlineBeatToSwissG, returnHref, mountReturnChip, pulseTarget
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SuiteLinks = api;
})();
