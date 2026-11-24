const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const THREE = require('../shared/vendor/three-r160.min.js');
const {stops} = require('../one-token/stops-manifest.js');

function representation(view = 'spatial', width = 390) {
  const drawing = new Proxy({}, {get: (_, key) => key === 'measureText'
    ? text => ({width: text.length * 8})
    : /Gradient$/.test(key) ? () => ({addColorStop() {}}) : () => {}});
  const window = {innerWidth: width};
  const document = {documentElement: {style: {setProperty() {}}},
    createElement: () => ({width: 1, height: 1, getContext: () => drawing})};
  const context = vm.createContext({window, document, console, innerWidth: width});
  for (const file of ['shared/theme-tokens.js', 'one-token/scene-' + view + '.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return window[view === 'spatial' ? 'ReaderSpatial' : 'ReaderDiagram'].create(THREE, window.ReaderTheme);
}
const spatial = width => representation('spatial', width);

function position(id, extra = {}) {
  const stop = stops.find(stop => stop.id === id);
  const state = {...stop, stepId: id, localT: 0, camera: 'director', settings: {}, ...extra};
  state.diagramPose = stop.diagramPose[0] + (stop.diagramPose[1] - stop.diagramPose[0]) * state.localT;
  return state;
}

test('Spatial opening fitting is stable across repeated draws and restores the lesson camera', () => {
  const api = spatial();
  const opening = position('1.1', {opening: true});
  const draws = Array.from({length: 4}, () => {
    api.update(opening, 390 / 210, 390);
    return {zoom: api.camera.zoom, projection: api.camera.projectionMatrix.elements.slice()};
  });
  for (const draw of draws.slice(1)) {
    assert.ok(Math.abs(draw.zoom - draws[0].zoom) < 1e-9, 'unchanged opening must retain its zoom');
    draw.projection.forEach((value, index) => assert.ok(Math.abs(value - draws[0].projection[index]) < 1e-9));
  }
  api.update(position('7.2', {present: true}), 390 / 638, 390);
  assert.equal(api.camera.zoom, 1, 'opening zoom must not leak into a lesson stop');
});

test('Spatial portrait presentation keeps the complete tracked token inside the plate', () => {
  const api = spatial();
  let token;
  api.scene.traverse(object => { if (object.userData.trackedToken) token = object; });
  for (const {id} of stops) {
    for (const localT of [0, .5, .95]) {
      api.update(position(id, {present: true, localT}), 390 / 638, 390);
      if (!token.visible) continue;
      api.scene.updateMatrixWorld(true);
      api.camera.updateMatrixWorld();
      const core = token.children[0];
      const bounds = new THREE.Box3().setFromObject(core);
      for (let corner = 0; corner < 8; corner++) {
        const p = new THREE.Vector3(corner & 1 ? bounds.max.x : bounds.min.x,
          corner & 2 ? bounds.max.y : bounds.min.y, corner & 4 ? bounds.max.z : bounds.min.z).project(api.camera);
        assert.ok(Math.abs(p.x) <= .92 && Math.abs(p.y) <= .92 && p.z >= -1 && p.z <= 1,
          id + ' at ' + localT + ': tracked token outside safe frame ' + p.toArray());
      }
    }
  }
});

function renderedPose(api) {
  api.scene.updateMatrixWorld(true);
  api.camera.updateMatrixWorld();
  const hash = createHash('sha256');
  const values = array => Array.from(array, value => Math.round(value * 1e6) / 1e6);
  api.scene.traverseVisible(object => {
    if (!object.geometry || object.count === 0) return;
    hash.update(JSON.stringify({
      matrix: values(object.matrixWorld.elements),
      instances: object.instanceMatrix && values(object.instanceMatrix.array.subarray(0, object.count * 16)),
      colors: object.instanceColor && values(object.instanceColor.array.subarray(0, object.count * 3)),
      range: object.geometry.drawRange,
      material: [object.material.color?.getHex(), object.material.opacity],
      // Reconstructed line endpoints matter as well as instance transforms.
      line: object.isLine && values(object.geometry.attributes.position.array)
    }));
  });
  hash.update(JSON.stringify([values(api.camera.matrixWorld.elements), values(api.camera.projectionMatrix.elements)]));
  return hash.digest('hex');
}

for (const view of ['diagram', 'spatial']) {
  test(view + ' reconstructs every canonical stop on repeat and reverse navigation', () => {
    const api = representation(view);
    for (const {id} of stops) {
      for (const localT of [0, .5, .95]) {
        const state = position(id, {present: true, localT});
        api.update(state, 390 / 638, 390);
        const expected = renderedPose(api);
        api.update(state, 390 / 638, 390);
        assert.equal(renderedPose(api), expected, id + ': unchanged progress must not drift');
        api.update(position('12.4', {present: true, localT: .95}), 390 / 638, 390);
        api.update(state, 390 / 638, 390);
        assert.equal(renderedPose(api), expected, id + ' at ' + localT + ': reverse seek must reconstruct the same pose');
      }
    }
  });

  test(view + ' reduced motion retains connection direction without travelling signals', () => {
    const api = representation(view);
    const signalMatrices = localT => {
      api.update(position('7.2', {localT, reducedMotion: true}), 1.2, 900);
      const signals = [];
      api.scene.traverseVisible(object => {
        if (object.userData.connectionSignal && object.count) {
          signals.push(Array.from(object.instanceMatrix.array.subarray(0, object.count * 16)));
        }
      });
      return signals;
    };
    // Both points are after the diagram's links finish revealing and before the
    // spatial sparse-attention beat changes to its causal-mask cutaway.
    const before = signalMatrices(view === 'diagram' ? .99 : .50);
    assert.ok(before.length, 'active attention connections retain directional markers');
    assert.deepEqual(signalMatrices(view === 'diagram' ? 1 : .54), before);
  });
}
