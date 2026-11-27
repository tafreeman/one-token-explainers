'use strict';
// shared/concept-map.js is the single lesson <-> Observatory <-> Inspect mapping.
// These checks keep the lesson, the Observatory labels and the Inspect panels in step with it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const map = require('../shared/concept-map.js');
const links = require('../shared/concept-links.js');
const {stops} = require('../one-token/stops-manifest.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const core = read('shared/obs-core.html');
const components = [...core.matchAll(/id: '((?:TR|MD|IN)-[0-9a-z]+)',[^]*?shortLabel: ["']([^"']+)["']/g)]
  .map(([, id, label]) => ({id, label}));

test('every Observatory component has exactly one map entry and a matching plain name', () => {
  assert.equal(components.length, 31);
  assert.deepEqual(components.map(c => c.id).sort(), Object.keys(map.COMPONENTS).sort());
  for (const {id, label} of components) assert.equal(label, map.COMPONENTS[id].name, id);
});

test('Observatory labels carry no phase-style 1.x / 2.x numbers', () => {
  for (const {id, label} of components) assert.doesNotMatch(label, /^\d+(\.\d+)?\s|^Core\s\d/, id);
  assert.doesNotMatch(core, /shortLabel: ['"](?:\d+\.\d+|Core \d)/);
});

test('components without a lesson stage are exactly TR-4, TR-7 and IN-12', () => {
  const untagged = Object.keys(map.COMPONENTS).filter(id => !map.lessonTag(id));
  assert.deepEqual(untagged.sort(), ['IN-12', 'TR-4', 'TR-7']);
  assert.equal(map.componentLabel('TR-2'), 'TR-2 · Tokenizer · Lesson 02');
  assert.equal(map.componentLabel('IN-9'), 'IN-9 · Detokenize · Lesson 11.1');
  assert.equal(map.componentLabel('TR-7'), 'TR-7 · GPU Cluster');
});

test('every lesson tag points at a real lesson step or stage', () => {
  const steps = new Set(stops.map(s => s.id)), stages = new Set(stops.map(s => String(s.stage)));
  for (const [id, {lesson}] of Object.entries(map.COMPONENTS)) {
    if (lesson) assert.ok(steps.has(lesson) || stages.has(lesson), id + ' → ' + lesson);
  }
});

test('Inspect panels, lesson buttons and concept links agree with the map', () => {
  const html = read('one-token/index.html');
  for (const [slug, concept] of Object.entries(map.CONCEPTS)) {
    const stop = stops.find(s => s.conceptSlug === slug);
    assert.equal(stop.id, concept.step, slug + ' lives on its mapped step');
    assert.deepEqual(stop.obsFocus, concept.obs);
    assert.ok(concept.obs.includes(concept.primary), slug + ' primary is one of its components');
    for (const code of concept.obs) assert.ok(map.COMPONENTS[code], code);
    assert.equal(links.CONCEPTS[slug].label, concept.label);
    assert.ok(html.includes('data-inspect="' + slug + '"'), slug + ' has a button');
    assert.ok(html.includes('>Try it → ' + concept.button + '</a>'), slug + ' button text');
  }
  assert.doesNotMatch(html, />Inspect component</);
});

test('the concept map loads before concept-links on every page that uses it', () => {
  for (const file of ['index.html', 'one-token/index.html', 'end-to-end-swiss/index.html', 'end-to-end-beamline/index.html', 'journey-tour/index.html', 'shared/obs-core.html']) {
    const html = read(file);
    assert.ok(html.indexOf('concept-map.js') > 0 && html.indexOf('concept-map.js') < html.indexOf('concept-links.js'), file);
  }
});
