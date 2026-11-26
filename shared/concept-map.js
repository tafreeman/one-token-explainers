/* Single source of truth: lesson step <-> Observatory component code <-> Inspect concept.
   Classic script so it works over HTTP, file://, and node --test.
   Observatory labels, lesson-stage tags, deep links, the Inspect panels and the
   "Back to One Token" chip all read this table. Do not repeat these numbers elsewhere. */
(function () {
  'use strict';

  // Observatory components. `lesson` is a stage ("2" -> "Lesson 02") or a step ("11.1"
  // -> "Lesson 11.1"). null means the component has no lesson stage and gets no tag.
  const COMPONENTS = {
    'TR-1':  { name: 'Data Pipeline',          lesson: '1' },
    'TR-2':  { name: 'Tokenizer',              lesson: '2' },
    'TR-3':  { name: 'Pretraining',            lesson: '3' },
    'TR-4':  { name: 'Mid-Training',           lesson: null },
    'TR-5':  { name: 'Post-Training',          lesson: '4' },
    'TR-6':  { name: 'Eval & Release Gate',    lesson: '5' },
    'TR-7':  { name: 'GPU Cluster',            lesson: null },
    'MD-1':  { name: 'Embedding',              lesson: '7.1' },
    'MD-2a': { name: 'Normalize 1',            lesson: '7.2' },
    'MD-2b': { name: 'Q/K/V Split',            lesson: '7.2' },
    'MD-2c': { name: 'RoPE Order',             lesson: '7.2' },
    'MD-2d': { name: 'Attention + Cache',      lesson: '7.2' },
    'MD-2e': { name: 'Merge Bus 1',            lesson: '7.4' },
    'MD-2f': { name: 'Normalize 2',            lesson: '7.4' },
    'MD-2g': { name: 'MoE Router',             lesson: '7.3' },
    'MD-2h': { name: 'Experts (FFN)',          lesson: '7.3' },
    'MD-2i': { name: 'Stack ×61',              lesson: '7.4' },
    'MD-3':  { name: 'Final Norm',             lesson: '7.5' },
    'MD-4':  { name: 'Output Scores',          lesson: '7.5' },
    'IN-1':  { name: 'Client Request',         lesson: '6.1' },
    'IN-2':  { name: 'Gateway',                lesson: '6.1' },
    'IN-3':  { name: 'Prompt Assembly',        lesson: '6.2' },
    'IN-4':  { name: 'Tokenizer',              lesson: '6.3' },
    'IN-5':  { name: 'Scheduler',              lesson: '8.3' },
    'IN-6':  { name: 'Prefill',                lesson: '8.1' },
    'IN-7':  { name: 'Decode Loop',            lesson: '10.1' },
    'IN-8':  { name: 'Sampler',                lesson: '10.2' },
    'IN-9':  { name: 'Detokenize',             lesson: '11.1' },
    'IN-10': { name: 'Output Filters',         lesson: '11.2' },
    'IN-11': { name: 'Tool Loop',              lesson: '12.1' },
    'IN-12': { name: 'Serving Optimizations',  lesson: null }
  };

  // Inspect-component panels. `step` is the lesson step that hosts the button, `obs` the
  // components its cutaway frames (first entry of `primary` is the deep-link target),
  // `button` the short label after "Try it →".
  const CONCEPTS = {
    'tokenization':   { label: 'Tokenization (BPE)',        button: 'Tokenizer',        step: '2.1',  primary: 'TR-2',  obs: ['TR-2'] },
    'mhc-residual':   { label: 'mHC 4-Stream Residual',     button: '4-stream residual', step: '7.4',  primary: 'MD-2e', obs: ['MD-2e', 'MD-2f', 'MD-2i'] },
    'csa-hca-kv':     { label: 'CSA + HCA Attention & KV',  button: 'Attention & KV',   step: '7.2',  primary: 'MD-2d', obs: ['MD-2b', 'MD-2c', 'MD-2d'] },
    'moe-router':     { label: 'MoE Router (6 of 384)',     button: 'MoE router',       step: '7.3',  primary: 'MD-2g', obs: ['MD-2g', 'MD-2h'] },
    'prefill-decode': { label: 'Prefill & Decode Serving',  button: 'Prefill vs decode', step: '8.1', primary: 'IN-6',  obs: ['IN-5', 'IN-6', 'IN-7', 'IN-12'] },
    'utf8-sse':       { label: 'UTF-8 Buffer & SSE Stream', button: 'UTF-8 buffer',     step: '11.1', primary: 'IN-9',  obs: ['IN-9', 'IN-10'] },
    'mcp-loop':       { label: 'Tool Loop & Prefix Cache',  button: 'Tool loop',        step: '12.2', primary: 'IN-11', obs: ['IN-11', 'IN-12'] }
  };

  const stageOf = lesson => String(lesson).split('.')[0];
  const pad = n => String(n).padStart(2, '0');

  function lessonTag(code) {
    const entry = COMPONENTS[code];
    if (!entry || !entry.lesson) return '';
    return 'Lesson ' + (entry.lesson.includes('.') ? entry.lesson : pad(entry.lesson));
  }

  function componentLabel(code, options = {}) {
    const entry = COMPONENTS[code];
    if (!entry) return String(code || '');
    const tag = options.tag === false ? '' : lessonTag(code);
    return [code, entry.name, tag].filter(Boolean).join(' · ');
  }

  function componentsForStep(step) {
    const key = String(step);
    return Object.keys(COMPONENTS).filter(code => {
      const lesson = COMPONENTS[code].lesson;
      return lesson && (lesson === key || (!lesson.includes('.') && lesson === stageOf(key)));
    });
  }

  function conceptForComponent(code) {
    return Object.keys(CONCEPTS).find(slug => CONCEPTS[slug].obs.includes(code)) || null;
  }

  function backLabel(pos) {
    return /^\d+\.\d+$/.test(String(pos || '')) ? 'Step ' + pos : '';
  }

  const api = Object.freeze({ COMPONENTS, CONCEPTS, lessonTag, componentLabel, componentsForStep, conceptForComponent, backLabel });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ConceptMap = api;
})();
