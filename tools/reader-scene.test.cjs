const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../shared/vendor/three-r160.min.js');
const {stops} = require('../one-token/stops-manifest.js');

function spatial(width = 390) {
  const drawing = new Proxy({}, {get: (_, key) => key === 'measureText'
    ? text => ({width: text.length * 8})
    : /Gradient$/.test(key) ? () => ({addColorStop() {}}) : () => {}});
  const window = {innerWidth: width};
  const document = {documentElement: {style: {setProperty() {}}},
    createElement: () => ({width: 1, height: 1, getContext: () => drawing})};
  const context = vm.createContext({window, document, console});
  for (const file of ['shared/theme-tokens.js', 'one-token/scene-spatial.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return window.ReaderSpatial.create(THREE, window.ReaderTheme);
}

function position(id, extra = {}) {
  const stop = stops.find(stop => stop.id === id);
  return {...stop, stepId: id, localT: 0, camera: 'director', settings: {}, ...extra};
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
  api.scene.traverse(object => { if (object.userData.halo) token = object; });
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
