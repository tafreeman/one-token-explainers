/* Authored procedural assemblies for the Spatial reader. No assets or network dependencies. */
(() => {
  'use strict';

  function create(THREE) {
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const dummy = new THREE.Object3D();

    function roundedRect(width, height, radius) {
      const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2);
      const shape = new THREE.Shape();
      shape.moveTo(x + r, y);
      shape.lineTo(x + width - r, y); shape.quadraticCurveTo(x + width, y, x + width, y + r);
      shape.lineTo(x + width, y + height - r); shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      shape.lineTo(x + r, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - r);
      shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
      return shape;
    }

    // Extrusion bevels every exposed edge; unlike scaled boxes, silhouettes survive at grazing angles.
    function chamferedBox(width = 1, height = 1, depth = 1, radius = .06, quality = 'high') {
      const r = Math.min(radius, width / 3, height / 3, depth / 3);
      const geometry = new THREE.ExtrudeGeometry(roundedRect(width - 2 * r, height - 2 * r, r), {
        depth: depth - 2 * r, steps: 1, bevelEnabled: true, bevelThickness: r,
        bevelSize: r, bevelSegments: quality === 'low' ? 0 : 1,
        curveSegments: quality === 'high' ? 3 : quality === 'medium' ? 2 : 1,
      });
      geometry.center();
      geometry.computeVertexNormals();
      return geometry;
    }

    function mesh(geometry, material, name, x = 0, y = 0, z = 0) {
      const object = new THREE.Mesh(geometry, material);
      object.name = name;
      object.position.set(x, y, z);
      return object;
    }

    function box(width, height, depth, material, name, x = 0, y = 0, z = 0, radius = .04) {
      return mesh(chamferedBox(width, height, depth, radius), material, name, x, y, z);
    }

    function torus(radius, tube, material, name, x = 0, y = 0, z = 0) {
      return mesh(new THREE.TorusGeometry(radius, tube, 10, 48), material, name, x, y, z);
    }

    function makeTokenizer(m) {
      const g = new THREE.Group(); g.name = 'tokenizer-gate';
      for (const z of [-.72, .72]) {
        g.add(box(.3, 2.05, .3, m.limestone, 'gate-post', 0, 1.03, z));
        g.add(box(.46, .12, .46, m.pewter, 'gate-foot', 0, .06, z));
      }
      g.add(box(.46, .3, 1.76, m.limestone, 'gate-crown', 0, 2.03, 0));
      for (const y of [.38, .64]) {
        const roller = mesh(new THREE.CylinderGeometry(.14, .14, 1.4, 24), m.pewter, 'feed-roller', 0, y, 0);
        roller.rotation.x = Math.PI / 2; g.add(roller);
      }
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-.09, .31); bladeShape.lineTo(.09, .31); bladeShape.lineTo(.09, -.08);
      bladeShape.lineTo(0, -.32); bladeShape.lineTo(-.09, -.08); bladeShape.closePath();
      const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {depth: 1.12, bevelEnabled: true,
        bevelSegments: 1, bevelSize: .018, bevelThickness: .018, steps: 1});
      bladeGeo.center();
      const blade = mesh(bladeGeo, m.darkPewter, 'blade', 0, 1.28, 0); g.add(blade);
      const guide = box(.09, .9, .12, m.pewter, 'blade-guide', 0, 1.65, 0); g.add(guide);
      return {g, blade};
    }

    function makeEmbedding(m) {
      const g = new THREE.Group(); g.name = 'embedding-library';
      g.add(box(4.35, 1.08, .24, m.limestone, 'library-back', 0, .62, -.22));
      for (const x of [-2.15, 2.15]) g.add(box(.14, 1.3, .62, m.pewter, 'library-upright', x, .65, 0));
      const rows = new THREE.InstancedMesh(chamferedBox(3.94, .055, .34, .015), m.pewter, 12);
      rows.name = 'vector-rows';
      for (let i = 0; i < 12; i++) {
        dummy.position.set(0, .18 + i * .08, .03); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); rows.setMatrixAt(i, dummy.matrix);
      }
      g.add(rows);
      const selectedRow = box(4.02, .09, .3, m.darkPewter, 'selected-row', 0, .5, .3, .018);
      g.add(selectedRow);
      const vector = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.027, .12, 3, 6), m.token, 16);
      vector.name = 'vector-values'; vector.position.set(0, .5, .5); g.add(vector);
      for (let i = 0; i < 16; i++) {
        dummy.position.set(-1.75 + i * .235, 0, 0); dummy.rotation.set(0, 0, Math.PI / 2);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix(); vector.setMatrixAt(i, dummy.matrix);
      }
      return {g, selectedRow, vector};
    }

    function makeExpert(m, shared = false) {
      const g = new THREE.Group(); g.name = shared ? 'shared-expert' : 'routed-expert';
      const size = shared ? .72 : .3;
      g.add(box(size, size, shared ? .18 : .16, m.limestone, 'expert-housing', 0, 0, 0, .025));
      g.add(box(size * .68, size * .68, .05, m.pewter, 'expert-inset', 0, 0, .1, .015));
      const core = torus(size * .23, size * .055, m.token, 'expert-core', 0, 0, .15); g.add(core);
      for (const x of [-1, 1]) g.add(box(size * .1, size * .8, .12, m.darkPewter, 'expert-fin', x * size * .43, 0, .03, .012));
      return {g, core};
    }

    function makeRouter(m) {
      const g = new THREE.Group(); g.name = 'moe-router';
      const profile = [new THREE.Vector2(.12, -.1), new THREE.Vector2(.36, -.1),
        new THREE.Vector2(.43, -.04), new THREE.Vector2(.43, .04), new THREE.Vector2(.36, .1), new THREE.Vector2(.12, .1)];
      const wheel = mesh(new THREE.LatheGeometry(profile, 48), m.darkPewter, 'router-wheel');
      wheel.rotation.x = Math.PI / 2; g.add(wheel);
      const rim = torus(.36, .025, m.token, 'router-active-rim', 0, 0, .12); g.add(rim);
      const pointer = box(.045, .3, .045, m.token, 'router-pointer', 0, .15, .15, .012); g.add(pointer);
      return {g, pointer, rim};
    }

    function makeKVCache(m) {
      const g = new THREE.Group(); g.name = 'kv-cache-drawers';
      const count = 30, columns = 10;
      g.add(box(3.65, 1.76, .18, m.limestone, 'cache-back', 1.44, .88, -.24));
      for (const x of [-.37, 3.25]) g.add(box(.14, 1.88, .64, m.darkPewter, 'cache-upright', x, .94, 0));
      for (const y of [.06, .62, 1.18, 1.74]) g.add(box(3.68, .09, .64, m.pewter, 'cache-shelf', 1.44, y, 0));
      const slots = new THREE.InstancedMesh(chamferedBox(.28, .4, .1, .025), m.darkPewter, count);
      const drawers = new THREE.InstancedMesh(chamferedBox(.27, .38, .36, .025), m.brass, count);
      const handles = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.018, .09, 2, 6), m.darkPewter, count);
      slots.name = 'empty-slots'; drawers.name = 'brass-drawers'; handles.name = 'drawer-handles';
      drawers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); handles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) {
        const x = (i % columns) * .32, y = .34 + Math.floor(i / columns) * .56;
        dummy.position.set(x, y, -.12); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); slots.setMatrixAt(i, dummy.matrix);
      }
      g.add(slots, drawers, handles);
      function setFill(value) {
        for (let i = 0; i < count; i++) {
          const fill = Math.max(0, Math.min(1, value - i));
          const x = (i % columns) * .32, y = .34 + Math.floor(i / columns) * .56;
          dummy.position.set(x, y, .01 + fill * .24); dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, Math.max(.001, fill)); dummy.updateMatrix(); drawers.setMatrixAt(i, dummy.matrix);
          dummy.position.z = .22 + fill * .34; dummy.rotation.z = Math.PI / 2;
          dummy.scale.setScalar(Math.max(.001, fill)); dummy.updateMatrix(); handles.setMatrixAt(i, dummy.matrix);
        }
        drawers.instanceMatrix.needsUpdate = true; handles.instanceMatrix.needsUpdate = true;
      }
      setFill(0);
      return {g, setFill, drawers, handles};
    }

    function makeSampler(m) {
      const g = new THREE.Group(); g.name = 'probability-sampler';
      g.add(box(1.8, .16, 1.2, m.limestone, 'sampler-base', 0, .08, 0));
      g.add(box(.16, .82, .18, m.pewter, 'sampler-stem', 0, .52, 0));
      const dial = mesh(new THREE.CylinderGeometry(.78, .78, .16, 48), m.limestone, 'sampler-dial', 0, 1.38, 0);
      dial.rotation.x = Math.PI / 2; g.add(dial);
      g.add(torus(.69, .035, m.darkPewter, 'dial-rim', 0, 1.38, .1));
      const ticks = new THREE.InstancedMesh(chamferedBox(.025, .13, .025, .006), m.pewter, 25);
      ticks.name = 'probability-ticks';
      for (let i = 0; i < 25; i++) {
        const a = -2.25 + i / 24 * 4.5;
        dummy.position.set(Math.sin(a) * .56, 1.38 + Math.cos(a) * .56, .13);
        dummy.rotation.set(0, 0, -a); dummy.scale.set(1, i % 6 === 0 ? 1.5 : .75, 1);
        dummy.updateMatrix(); ticks.setMatrixAt(i, dummy.matrix);
      }
      g.add(ticks);
      const pointerGeo = chamferedBox(.045, .58, .04, .01); pointerGeo.translate(0, .25, 0);
      const pointer = mesh(pointerGeo, m.darkPewter, 'sampler-pointer', 0, 1.38, .18); g.add(pointer);
      const winner = mesh(new THREE.SphereGeometry(.09, 20, 12), m.token, 'chosen-token', .48, 1.78, .18); g.add(winner);
      return {g, pointer, winner};
    }

    function makeScreen(m, screenMaterial) {
      const g = new THREE.Group(); g.name = 'stream-screen';
      g.add(box(5.58, 3.78, .28, m.graphite, 'screen-housing', 0, 2.25, 0, .12));
      const surface = mesh(new THREE.PlaneGeometry(5.12, 3.3), screenMaterial, 'emissive-display', 0, 2.25, .155);
      g.add(surface);
      for (const x of [-2.65, 2.65]) g.add(box(.1, 3.52, .12, m.darkPewter, 'screen-bezel', x, 2.25, .18));
      for (const y of [.53, 3.97]) g.add(box(5.38, .1, .12, m.darkPewter, 'screen-bezel', 0, y, .18));
      const neck = mesh(new THREE.CylinderGeometry(.18, .25, .6, 24), m.pewter, 'screen-neck', 0, .32, 0); g.add(neck);
      g.add(box(1.7, .12, .9, m.limestone, 'screen-foot', 0, .06, 0, .05));
      return {g, surface};
    }

    function makeToolBench(m) {
      const g = new THREE.Group(); g.name = 'tool-bench';
      g.add(box(2.7, 1.1, 1.8, m.pine, 'tool-housing', 0, .62, 0, .1));
      g.add(box(2.92, .16, 2.02, m.darkPewter, 'tool-worktop', 0, 1.23, 0, .05));
      const ports = [];
      for (const [name, x, z] of [['input-port', -.72, 1.03], ['output-port', .72, 1.03]]) {
        const port = torus(.24, .06, m.pine, name, x, .72, z); g.add(port); ports.push(port);
        const throat = mesh(new THREE.CylinderGeometry(.17, .17, .28, 24), m.darkPewter, name + '-throat', x, .72, z - .1);
        throat.rotation.x = Math.PI / 2; g.add(throat);
      }
      return {g, inputPort: ports[0], outputPort: ports[1]};
    }

    function makeDetokenizer(m) {
      const g = new THREE.Group(); g.name = 'detokenizer';
      g.add(box(1.5, .14, 1.1, m.limestone, 'detok-base', 0, .07, 0));
      for (const x of [-.55, .55]) g.add(box(.14, 1.25, .2, m.pewter, 'detok-post', x, .68, 0));
      g.add(box(1.24, .16, .24, m.pewter, 'detok-crown', 0, 1.3, 0));
      const bytes = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.07, .18, 3, 8), m.darkPewter, 4);
      bytes.name = 'utf8-bytes';
      for (let i = 0; i < 4; i++) {
        dummy.position.set(-.36 + i * .24, .76, 0); dummy.rotation.set(0, 0, Math.PI / 2);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bytes.setMatrixAt(i, dummy.matrix);
      }
      g.add(bytes);
      const text = box(.82, .08, .14, m.token, 'decoded-text', 0, .38, .3, .02); g.add(text);
      return {g, bytes, text};
    }

    function makeToken(m) {
      const g = new THREE.Group(); g.name = 'hero-token';
      const geometry = chamferedBox(.66, .34, .34, .055, 'high');
      const core = mesh(geometry, m.token, 'token-core'); core.renderOrder = 20; g.add(core);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24),
        new THREE.LineBasicMaterial({color: m.tokenInk, transparent: true, opacity: .9}));
      edge.name = 'token-emissive-edge'; edge.renderOrder = 21; g.add(edge);
      return {g, core, edge};
    }

    return {chamferedBox, makeTokenizer, makeEmbedding, makeExpert, makeRouter,
      makeKVCache, makeSampler, makeScreen, makeToolBench, makeDetokenizer, makeToken};
  }

  window.ReaderSpatialModels = Object.freeze({create});
})();
