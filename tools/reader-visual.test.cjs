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

// The neutral ramp, light to dark. Light limestone housings are a design choice (DESIGN.md), so
// they separate from the floor by clear value steps and dark frames, not by 3:1 contrast each.
const RAMP = ['hardwarePale', 'hardwareDeck', 'hardwarePlinth', 'hardwareBody', 'hardwareFrame', 'hardwareSlate', 'hardwareGraphite'];
const MIN_FLOOR_STEP = 1.25;      // every neutral part reads as distinct from the floor
const MIN_NEIGHBOR_STEP = 1.2;    // adjacent ramp values differ by a visible step
const MIN_STRUCTURE_CONTRAST = 3; // frames and darker structure outline the light housings

test('Spatial neutral hardware ramp stays light-to-dark ordered with crisp frame contrast', () => {
  const {colors} = spatial();
  const values = RAMP.map(key => colors[key]);
  assert.equal(new Set(values).size, values.length);
  const lum = [colors.ground, ...values].map(luminance);
  for (let i = 1; i < lum.length; i++) {
    assert.ok(lum[i - 1] > lum[i], `ramp step ${i} must darken strictly`);
  }
  assert.ok(luminance(colors.hardwarePale) >= 0.6, 'limestone housings remain genuinely light');
  RAMP.forEach((key, index) => {
    const floor = contrast(colors.ground, colors[key]);
    assert.ok(floor >= MIN_FLOOR_STEP, `${key} has only ${floor.toFixed(2)}:1 against the floor`);
    if (index >= RAMP.indexOf('hardwareFrame')) {
      assert.ok(floor >= MIN_STRUCTURE_CONTRAST, `${key} has ${floor.toFixed(2)}:1 floor contrast`);
    }
    if (index) {
      const step = contrast(colors[RAMP[index - 1]], colors[key]);
      assert.ok(step >= MIN_NEIGHBOR_STEP, `${RAMP[index - 1]} -> ${key} step is only ${step.toFixed(2)}:1`);
    }
  });
});

test('Every Spatial material and instance color comes from the theme contract', () => {
  const {api, colors} = spatial();
  const palette = new Set(Object.values(colors));
  // Tower plates blend between contract colors (untrained -> trained, scan sweep, gradient flash).
  const blended = new Set(['61-chamfered-layers']);
  const strays = new Map();
  const note = (hex, where) => { if (!palette.has(hex)) strays.set(hex.toString(16).padStart(6, '0'), where); };
  for (const stop of stops) {
    api.update(position(stop.id), 1440 / 900, 1440);
    api.scene.traverse(object => {
      for (const material of [].concat(object.material || [])) {
        if (material.color) note(material.color.getHex(), object.name || material.type);
        if (material.emissive && material.emissive.getHex()) note(material.emissive.getHex(), (object.name || material.type) + ' emissive');
      }
      if (object.instanceColor && !blended.has(object.name)) {
        const value = new THREE.Color();
        for (let i = 0; i < object.count; i++) {
          object.getColorAt(i, value); // r160 fills `value` in place
          note(value.getHex(), (object.name || 'instanced') + ' @ ' + stop.id);
        }
      }
    });
  }
  assert.deepEqual([...strays], [], 'off-contract colors (hex -> first object)');
});

test('Semantic colors stay on token, attention, cache, tools and training/fault assemblies', () => {
  const {api, colors} = spatial();
  api.update(position('7.3'), 1440 / 900, 1440);
  const colorOf = name => api.scene.getObjectByName(name)?.material?.color?.getHex();
  assert.equal(colorOf('token-core'), colors.token);
  assert.notEqual(api.scene.getObjectByName('token-core').material,
    api.scene.getObjectByName('chosen-token').material, 'hero depth state must not leak into other token-colored parts');
  assert.equal(api.scene.getObjectByName('chosen-token').material.depthTest, true);
  assert.equal(colorOf('brass-drawers'), colors.cache);
  assert.equal(colorOf('tool-housing'), colors.tool);
  assert.equal(colorOf('attention-dense-0'), colors.attention);
  assert.equal(colorOf('selected-row'), colors.attention);
  assert.equal(colorOf('backprop-gradient-0'), colors.fault);
  assert.equal(colorOf('request-intake'), colors.cache, 'intake carries serving Brass');
  assert.equal(colorOf('router-wheel'), colors.cache, 'router carries serving Brass');
  assert.equal(colorOf('causal-mask'), colors.fault, 'causal mask carries Terracotta matching Diagram and narration');
  assert.equal(colorOf('blade'), colors.hardwareFrame, 'cutting blade remains machined pewter');
});

test('MTP draft labels point at the tower top wherever the tower stands', () => {
  const {api} = spatial();
  const towerX = () => api.scene.getObjectByName('61-chamfered-layers').parent.position.x;
  for (const [id, localT, label] of [['3.2', .9, 'MTP draft head'], ['10.3', .5, 'draft → target verification']]) {
    const pin = api.update(position(id, localT), 1440 / 900, 1440);
    assert.equal(pin.label, label, id);
    const offset = pin.anchor.x - towerX(); // the MTP bar fan spans -0.8..0.82 around the tower axis
    assert.ok(offset >= -.8 && offset <= .82, `${id} anchor x ${pin.anchor.x} vs tower ${towerX()}`);
  }
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

test('Low tier preserves sampler pivots and animated/dashed draw ranges', () => {
  const {api} = spatial();
  const pointer = api.scene.getObjectByName('sampler-pointer');
  api.setQuality('high'); pointer.geometry.computeBoundingBox();
  const highCenter = pointer.geometry.boundingBox.getCenter(new THREE.Vector3()).y;
  api.setQuality('low'); pointer.geometry.computeBoundingBox();
  const lowCenter = pointer.geometry.boundingBox.getCenter(new THREE.Vector3()).y;
  assert.ok(Math.abs(highCenter - lowCenter) < 1e-6,
    `pointer pivot survives simplification: high=${highCenter}, low=${lowCenter}`);
  api.update(position('4.2', .63), 1.6, 1440);
  api.scene.traverseVisible(object => {
    if (!object.isMesh || !object.geometry.index || !Number.isFinite(object.geometry.drawRange.count)) return;
    assert.ok(object.geometry.drawRange.count <= object.geometry.index.count,
      `${object.name || object.geometry.type}: draw range ${object.geometry.drawRange.count} exceeds index ${object.geometry.index.count}`);
  });
});
