const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../shared/vendor/three-r160.min.js');
const {stops} = require('../one-token/stops-manifest.js');

function spatial() {
  const drawing = new Proxy({}, {get: (_, key) => key === 'measureText'
    ? text => ({width: text.length * 8})
    : /Gradient$/.test(key) ? () => ({addColorStop() {}}) : () => {}});
  const window = {innerWidth: 1440};
  const document = {documentElement: {style: {setProperty() {}}},
    createElement: () => ({width: 1, height: 1, getContext: () => drawing})};
  const context = vm.createContext({window, document, console});
  for (const file of ['shared/theme-tokens.js', 'one-token/spatial-models.js',
    'one-token/spatial-materials.js', 'one-token/scene-spatial.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return {api: window.ReaderSpatial.create(THREE, window.ReaderTheme), colors: window.ReaderTheme.colors};
}

function position(id, localT = .5) {
  const stop = stops.find(stop => stop.id === id);
  return {...stop, stepId: id, localT, camera: 'director', present: true, settings: {},
    diagramPose: stop.diagramPose[0] + (stop.diagramPose[1] - stop.diagramPose[0]) * localT};
}

function luminance(hex) {
  const channels = [16, 8, 0].map(shift => ((hex >> shift) & 255) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

function renderedTriangles(api) {
  let triangles = 0;
  api.scene.traverseVisible(object => {
    if (!object.isMesh || object.count === 0) return;
    const geometry = object.geometry;
    const available = geometry.index?.count ?? geometry.attributes.position.count;
    const count = Number.isFinite(geometry.drawRange.count) ? Math.min(available, geometry.drawRange.count) : available;
    triangles += count / 3 * (object.isInstancedMesh ? object.count : 1);
  });
  return triangles;
}

test('Spatial neutral hardware tokens clear 3:1 floor contrast and never duplicate', () => {
  const {colors} = spatial();
  const keys = ['hardwarePale', 'hardwareDeck', 'hardwarePlinth', 'hardwareBody', 'hardwareFrame', 'hardwareGraphite'];
  const values = keys.map(key => colors[key]);
  assert.equal(new Set(values).size, values.length);
  for (const key of keys) assert.ok(contrast(colors.ground, colors[key]) >= 3,
    `${key} has ${contrast(colors.ground, colors[key]).toFixed(2)}:1 floor contrast`);
  assert.ok(contrast(colors.hardwarePale, colors.hardwareDeck) >= 1.35);
  assert.ok(contrast(colors.hardwareDeck, colors.hardwarePlinth) >= 1.2);
});

test('Semantic colors stay on token, attention, cache, tools and fault assemblies', () => {
  const {api, colors} = spatial();
  api.update(position('7.3'), 1440 / 900, 1440);
  const colorOf = name => api.scene.getObjectByName(name)?.material?.color?.getHex();
  assert.equal(colorOf('token-core'), colors.token);
  assert.equal(colorOf('brass-drawers'), colors.cache);
  assert.equal(colorOf('tool-housing'), colors.tool);
  assert.equal(colorOf('attention-dense-0'), colors.attention);
  assert.equal(colorOf('backprop-gradient-0'), colors.fault);
  assert.equal(colorOf('request-intake'), colors.hardwareDeck, 'intake is neutral, not Brass');
  assert.equal(colorOf('router-wheel'), colors.hardwareFrame, 'router is neutral, not Brass');
  assert.equal(colorOf('causal-mask'), colors.hardwareDeck, 'causal mask is neutral, not a fault');
});

test('Authored assemblies expose named geometry and stay inside the triangle budget', () => {
  const {api} = spatial();
  const token = api.scene.getObjectByName('token-core');
  assert.equal(token.geometry.type, 'ExtrudeGeometry');
  assert.equal(api.scene.getObjectByName('61-chamfered-layers').count, 61 * 3);
  assert.equal(api.scene.getObjectByName('384-expert-bank').count, 384);
  assert.equal(api.scene.getObjectByName('brass-drawers').count, 30);
  assert.equal(api.scene.getObjectByName('lit-terrazzo-floor').material.isMeshStandardMaterial, true);
  assert.ok(api.scene.getObjectByName('selected-row'));
  assert.ok(api.scene.getObjectByName('sampler-pointer'));
  assert.ok(api.scene.getObjectByName('input-port'));
  assert.ok(api.scene.getObjectByName('output-port'));
  let maximum = 0;
  for (const id of ['2.1', '7.2', '7.3', '8.2', '10.2', '12.1']) {
    api.update(position(id), 1440 / 900, 1440);
    maximum = Math.max(maximum, renderedTriangles(api));
  }
  assert.ok(maximum <= 120000, `triangle high-water mark ${maximum}`);
  api.setQuality('low'); api.update(position('7.3'), 1440 / 900, 1440);
  const low = renderedTriangles(api);
  if (process.env.VISUAL_DEBUG) {
    const parts = [];
    api.scene.traverseVisible(object => {
      if (!object.isMesh || object.count === 0) return;
      const g = object.geometry, available = g.index?.count ?? g.attributes.position.count;
      parts.push([object.name || g.type, available / 3 * (object.isInstancedMesh ? object.count : 1)]);
    });
    console.log(parts.sort((a, b) => b[1] - a[1]).slice(0, 20));
  }
  assert.ok(low <= 45000, `low-tier triangle high-water mark ${low}`);
});

test('Quality tiers remain explicit and reversible without changing scene identity', () => {
  const {api} = spatial();
  const scene = api.scene;
  for (const tier of ['medium', 'low', 'high']) {
    api.setQuality(tier);
    assert.equal(api.qualityTier, tier);
    assert.equal(api.scene, scene);
  }
  const before = api.update(position('10.2', .2), 1.6, 1440);
  api.update(position('12.1', .8), 1.6, 1440);
  const after = api.update(position('10.2', .2), 1.6, 1440);
  assert.equal(before.label, after.label);
  assert.ok(before.anchor.distanceTo(after.anchor) < 1e-9);
});
