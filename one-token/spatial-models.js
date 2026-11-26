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
        bevelSize: r, bevelSegments: quality === 'low' ? 0 : (quality === 'high' ? 2 : 1),
        curveSegments: quality === 'high' ? 5 : quality === 'medium' ? 2 : 1,
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

    // Merge only static siblings with one material; animated and addressed parts stay independent.
    function mergeStatic(group, exclude = []) {
      const skipped = new Set(exclude), buckets = new Map();
      for (const object of group.children) {
        if (!object.isMesh || object.isInstancedMesh || skipped.has(object) || object.userData.curve ||
          object.material.transparent || object.renderOrder) continue;
        const list = buckets.get(object.material) || []; list.push(object); buckets.set(object.material, list);
      }
      for (const [material, objects] of buckets) {
        if (objects.length < 2) continue;
        const parts = objects.map(object => {
          object.updateMatrix();
          const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
          geometry.applyMatrix4(object.matrix);
          if (!geometry.attributes.normal) geometry.computeVertexNormals();
          return geometry;
        });
        const attributes = {};
        for (const name of ['position', 'normal', 'uv']) {
          const source = parts[0].attributes[name];
          if (!source) continue;
          const array = new Float32Array(parts.reduce((sum, g) => sum +
            (g.attributes[name]?.array.length ?? g.attributes.position.count * source.itemSize), 0));
          let offset = 0;
          for (const geometry of parts) {
            if (!geometry.attributes[name]) { offset += geometry.attributes.position.count * source.itemSize; continue; }
            array.set(geometry.attributes[name].array, offset); offset += geometry.attributes[name].array.length;
          }
          attributes[name] = new THREE.BufferAttribute(array, source.itemSize);
        }
        const geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
        geometry.computeBoundingSphere();
        const merged = new THREE.Mesh(geometry, material); merged.name = 'merged-static-' + group.name;
        for (const object of objects) group.remove(object);
        group.add(merged);
        for (const part of parts) part.dispose();
      }
    }

    function torus(radius, tube, material, name, x = 0, y = 0, z = 0) {
      return mesh(new THREE.TorusGeometry(radius, tube, 14, 64), material, name, x, y, z);
    }

    function makeTokenizer(m, crownMat = m.terracotta) {
      const g = new THREE.Group(); g.name = 'tokenizer-gate';
      for (const z of [-.74, .74]) {
        g.add(box(.3, 2.05, .3, m.limestone, 'gate-post', 0, 1.03, z));
        g.add(box(.1, 1.72, .08, m.darkPewter, 'shear-track', 0, 1.06, z > 0 ? z - .16 : z + .16));
        g.add(box(.48, .12, .48, m.pewter, 'gate-foot', 0, .06, z));
      }
      g.add(box(.5, .32, 1.84, crownMat || m.limestone, 'gate-crown', 0, 2.04, 0));
      // Graduated BPE merge-rule Vernier ticks across the tokenizer crown
      for (let i = -2; i <= 2; i++) {
        g.add(box(.04, i === 0 ? .16 : .1, .04, m.darkPewter, 'bpe-vernier-tick', .26, 2.04, i * .28, .008));
      }
      // Slotted feed bed and twin precision feed rollers
      g.add(box(1.16, .08, 1.36, m.limestone, 'feed-bed', 0, .2, 0, .02));
      for (const z of [-.52, .52]) g.add(box(1.12, .06, .08, m.darkPewter, 'feed-rail', 0, .27, z, .012));
      for (const y of [.38, .66]) {
        const roller = mesh(new THREE.CylinderGeometry(.13, .13, 1.36, 24), m.pewter, 'feed-roller', 0, y, 0);
        roller.rotation.x = Math.PI / 2; g.add(roller);
      }
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-.1, .34); bladeShape.lineTo(.1, .34); bladeShape.lineTo(.1, -.06);
      bladeShape.lineTo(0, -.34); bladeShape.lineTo(-.1, -.06); bladeShape.closePath();
      const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {depth: 1.16, bevelEnabled: true,
        bevelSegments: 1, bevelSize: .018, bevelThickness: .018, steps: 1});
      bladeGeo.center();
      const blade = mesh(bladeGeo, m.darkPewter, 'blade', 0, 1.28, 0); g.add(blade);
      const guide = box(.11, .92, .14, m.pewter, 'blade-guide', 0, 1.66, 0); g.add(guide);
      return {g, blade};
    }

    function makeEmbedding(m) {
      const g = new THREE.Group(); g.name = 'embedding-library';
      g.add(box(4.42, 1.18, .22, m.limestone, 'library-back', 0, .64, -.24));
      g.add(box(4.52, .1, .56, m.darkPewter, 'library-cap', 0, 1.24, -.04));
      g.add(box(4.52, .1, .62, m.pewter, 'library-sill', 0, .05, -.02));
      for (const x of [-2.18, 2.18]) g.add(box(.14, 1.26, .62, m.darkPewter, 'library-upright', x, .64, -.02));
      // 2D matrix visual cues: 12 vocabulary ID rows crossed by subtle channel-dimension dividers
      const rows = new THREE.InstancedMesh(chamferedBox(3.96, .05, .34, .012), m.pewter, 12);
      rows.name = 'vector-rows';
      for (let i = 0; i < 12; i++) {
        dummy.position.set(.08, .17 + i * .085, -.02); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); rows.setMatrixAt(i, dummy.matrix);
      }
      g.add(rows);
      // Left-hand Token ID index column ticks
      const idTicks = new THREE.InstancedMesh(chamferedBox(.14, .038, .38, .008), m.darkPewter, 12);
      idTicks.name = 'id-index-ticks';
      for (let i = 0; i < 12; i++) {
        dummy.position.set(-2.0, .17 + i * .085, .02); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); idTicks.setMatrixAt(i, dummy.matrix);
      }
      g.add(idTicks);
      // Vertical hidden-dimension grid ribs (7,168 channels)
      const cols = new THREE.InstancedMesh(chamferedBox(.024, 1.02, .36, .006), m.limestone, 15);
      cols.name = 'channel-ribs';
      for (let i = 0; i < 15; i++) {
        dummy.position.set(-1.72 + i * .255, .64, -.01); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); cols.setMatrixAt(i, dummy.matrix);
      }
      g.add(cols);
      const selectedRow = box(4.04, .095, .32, m.attention || m.darkPewter, 'selected-row', 0, .51, .28, .018);
      g.add(selectedRow);
      // Alammar-style 24-cell segmented activation vector with varying channel magnitudes
      const vector = new THREE.InstancedMesh(chamferedBox(.115, .22, .16, .016), m.token, 24);
      vector.name = 'vector-values'; vector.position.set(0, .64, .34); g.add(vector);
      for (let i = 0; i < 24; i++) {
        const amp = .38 + .62 * Math.abs(Math.sin(i * 1.37 + .45) * .72 + Math.cos(i * .63) * .28);
        dummy.position.set(-1.84 + i * .16, (amp - .5) * .06, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, amp, 1);
        dummy.updateMatrix(); vector.setMatrixAt(i, dummy.matrix);
      }
      return {g, selectedRow, vector};
    }

    function makeExpert(m, shared = false) {
      const g = new THREE.Group(); g.name = shared ? 'shared-expert' : 'routed-expert';
      const size = shared ? .74 : .32;
      // SwiGLU FFN hourglass profile: narrow input/output necks, expanded intermediate hidden chamber
      const hw = size * .5, neck = size * .33, hh = size * .5, waistY = size * .18;
      const ffnShape = new THREE.Shape();
      ffnShape.moveTo(-neck, -hh); ffnShape.lineTo(neck, -hh);
      ffnShape.lineTo(hw, -waistY); ffnShape.lineTo(hw, waistY);
      ffnShape.lineTo(neck, hh); ffnShape.lineTo(-neck, hh);
      ffnShape.lineTo(-hw, waistY); ffnShape.lineTo(-hw, -waistY);
      ffnShape.closePath();
      const ffnGeo = new THREE.ExtrudeGeometry(ffnShape, {
        depth: shared ? .18 : .15, steps: 1, bevelEnabled: true,
        bevelThickness: .018, bevelSize: .018, bevelSegments: 1
      });
      ffnGeo.center(); ffnGeo.computeVertexNormals();
      g.add(mesh(ffnGeo, m.limestone, 'expert-housing', 0, 0, 0));
      const core = torus(size * .22, size * .052, shared ? (m.brass || m.token) : m.token, 'expert-core', 0, 0, .14); g.add(core);
      for (const x of [-1, 1]) g.add(box(size * .09, size * .48, .14, m.darkPewter, 'expert-fin', x * size * .48, 0, .02, .01));
      mergeStatic(g, [core]);
      return {g, core};
    }

    function makeRouter(m) {
      const g = new THREE.Group(); g.name = 'moe-router';
      g.add(box(.98, .98, .1, m.limestone, 'router-plinth', 0, 0, -.12, .04));
      const profile = [new THREE.Vector2(.1, -.1), new THREE.Vector2(.38, -.1),
        new THREE.Vector2(.45, -.04), new THREE.Vector2(.45, .04), new THREE.Vector2(.38, .1), new THREE.Vector2(.1, .1)];
      const wheel = mesh(new THREE.LatheGeometry(profile, 48), m.brass, 'router-wheel');
      wheel.rotation.x = Math.PI / 2; g.add(wheel);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const tick = box(.024, .08, .03, m.darkPewter, 'router-score-tick', Math.cos(a) * .44, Math.sin(a) * .44, .08, .005);
        tick.rotation.z = a - Math.PI / 2; g.add(tick);
      }
      const rim = torus(.36, .026, m.token, 'router-active-rim', 0, 0, .12); g.add(rim);
      const pointer = box(.048, .32, .048, m.token, 'router-pointer', 0, .15, .16, .012); g.add(pointer);
      return {g, pointer, rim};
    }

    function makeKVCache(m) {
      const g = new THREE.Group(); g.name = 'kv-cache-drawers';
      const count = 30, columns = 10;
      // Server-grade Paged HBM KV Memory Bank: 3 layer-group tiers × 2 paged blocks (5 KV blades each)
      g.add(box(3.74, 1.82, .16, m.limestone, 'cache-back', 1.48, .91, -.26));
      g.add(box(3.84, .11, .68, m.darkPewter, 'cache-bus-header', 1.48, 1.84, 0));
      g.add(box(3.62, .045, .12, m.attention || m.darkPewter, 'cache-read-rail', 1.48, 1.91, .18, .01));
      for (const x of [-.38, 1.48, 3.34]) {
        g.add(box(x === 1.48 ? .08 : .14, 1.88, .66, m.darkPewter, 'cache-upright', x, .94, 0));
      }
      for (const y of [.06, .63, 1.20, 1.77]) g.add(box(3.76, .075, .66, m.pewter, 'cache-shelf', 1.48, y, 0));
      const colX = col => col * .31 + (col >= 5 ? .16 : 0);
      const slots = new THREE.InstancedMesh(chamferedBox(.24, .44, .12, .02), m.darkPewter, count);
      const drawers = new THREE.InstancedMesh(chamferedBox(.22, .42, .42, .02), m.brass, count);
      const handles = new THREE.InstancedMesh(chamferedBox(.055, .22, .05, .01), m.darkPewter, count);
      slots.name = 'empty-slots'; drawers.name = 'brass-drawers'; handles.name = 'drawer-handles';
      drawers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); handles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) {
        const col = i % columns, x = colX(col), y = .34 + Math.floor(i / columns) * .57;
        dummy.position.set(x, y, -.14); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); slots.setMatrixAt(i, dummy.matrix);
      }
      g.add(slots, drawers, handles);
      function setFill(value) {
        for (let i = 0; i < count; i++) {
          const fill = Math.max(0, Math.min(1, value - i));
          const col = i % columns, x = colX(col), y = .34 + Math.floor(i / columns) * .57;
          dummy.position.set(x, y, -.02 + fill * .24); dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, Math.max(.001, fill)); dummy.updateMatrix(); drawers.setMatrixAt(i, dummy.matrix);
          dummy.position.set(x, y + .05, .2 + fill * .26); dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(Math.max(.001, fill)); dummy.updateMatrix(); handles.setMatrixAt(i, dummy.matrix);
        }
        drawers.instanceMatrix.needsUpdate = true; handles.instanceMatrix.needsUpdate = true;
      }
      setFill(0);
      return {g, setFill, drawers, handles};
    }

    function makeSampler(m) {
      const g = new THREE.Group(); g.name = 'probability-sampler';
      g.add(box(1.86, .16, 1.24, m.limestone, 'sampler-base', 0, .08, 0));
      g.add(box(.64, .08, .54, m.pewter, 'sampler-plinth-step', 0, .2, 0));
      g.add(box(.18, .78, .2, m.darkPewter, 'sampler-stem', 0, .54, 0));
      const dial = mesh(new THREE.CylinderGeometry(.82, .84, .16, 48), m.limestone, 'sampler-dial', 0, 1.38, 0);
      dial.rotation.x = Math.PI / 2; g.add(dial);
      g.add(torus(.78, .03, m.darkPewter, 'dial-bezel', 0, 1.38, .09));
      g.add(torus(.42, .016, m.pewter, 'dial-inner-ring', 0, 1.38, .095));
      // Top-p nucleus sector arc highlighting the high-probability candidate cluster
      const nucleusArc = mesh(new THREE.TorusGeometry(.71, .038, 10, 32, 1.45), m.brass, 'nucleus-arc', 0, 1.38, .11);
      nucleusArc.rotation.z = -.08; g.add(nucleusArc);
      // Radial Softmax probability histogram: skewed candidate distribution instead of uniform clock ticks
      const probs = [.06, .05, .07, .05, .08, .06, .09, .07, .11, .08, .14, .19, .34, .26, .48, .66, .96, .74, .44, .28, .16, .1, .08, .06, .05];
      const ticks = new THREE.InstancedMesh(chamferedBox(.038, .12, .03, .007), m.attention || m.darkPewter, 25);
      ticks.name = 'probability-ticks';
      for (let i = 0; i < 25; i++) {
        const a = -2.25 + i / 24 * 4.5;
        const p = probs[i], scaleY = .38 + p * 2.35, len = .12 * scaleY, r = .44 + len * .5;
        dummy.position.set(Math.sin(a) * r, 1.38 + Math.cos(a) * r, .125);
        dummy.rotation.set(0, 0, -a); dummy.scale.set(p > .4 ? 1.25 : .92, scaleY, 1);
        dummy.updateMatrix(); ticks.setMatrixAt(i, dummy.matrix);
      }
      g.add(ticks);
      const hub = mesh(new THREE.CylinderGeometry(.09, .09, .08, 20), m.brass, 'sampler-hub', 0, 1.38, .16);
      hub.rotation.x = Math.PI / 2; g.add(hub);
      const pointerGeo = chamferedBox(.045, .58, .04, .01); pointerGeo.translate(0, .25, 0);
      const pointer = mesh(pointerGeo, m.darkPewter, 'sampler-pointer', 0, 1.38, .18); g.add(pointer);
      const winner = mesh(new THREE.SphereGeometry(.095, 20, 12), m.token, 'chosen-token', .48, 1.78, .18); g.add(winner);
      return {g, pointer, winner};
    }

    function makeScreen(m, screenMaterial) {
      const g = new THREE.Group(); g.name = 'stream-screen';
      g.add(box(5.62, 3.82, .28, m.graphite, 'screen-housing', 0, 2.25, 0, .12));
      const surface = mesh(new THREE.PlaneGeometry(5.14, 3.32), screenMaterial, 'emissive-display', 0, 2.25, .155);
      g.add(surface);
      for (const x of [-2.66, 2.66]) g.add(box(.1, 3.54, .12, m.darkPewter, 'screen-bezel', x, 2.25, .18));
      for (const y of [.52, 3.98]) g.add(box(5.4, .1, .12, m.darkPewter, 'screen-bezel', 0, y, .18));
      g.add(box(.44, .035, .04, m.pine, 'screen-status-bar', 0, .52, .24, .01));
      const neck = mesh(new THREE.CylinderGeometry(.18, .26, .62, 24), m.pewter, 'screen-neck', 0, .32, 0); g.add(neck);
      g.add(box(1.76, .12, .94, m.limestone, 'screen-foot', 0, .06, 0, .05));
      return {g, surface};
    }

    function makeToolBench(m) {
      const g = new THREE.Group(); g.name = 'tool-bench';
      g.add(box(2.76, 1.08, 1.84, m.pine, 'tool-housing', 0, .6, 0, .1));
      g.add(box(2.96, .15, 2.04, m.darkPewter, 'tool-worktop', 0, 1.21, 0, .05));
      // Sandbox execution console & active bridge connecting tool_use input to tool_result output
      g.add(box(1.56, .46, .76, m.limestone, 'sandbox-console', 0, 1.5, -.24, .04));
      g.add(box(1.32, .28, .08, m.graphite, 'sandbox-readout', 0, 1.52, .14, .02));
      g.add(box(1.44, .07, .14, m.brass, 'sandbox-exec-bus', 0, 1.31, .48, .02));
      const ports = [];
      for (const [name, x, z] of [['input-port', -.74, 1.04], ['output-port', .74, 1.04]]) {
        const port = torus(.24, .06, m.pine, name, x, .72, z); g.add(port); ports.push(port);
        const throat = mesh(new THREE.CylinderGeometry(.17, .17, .28, 24), m.darkPewter, name + '-throat', x, .72, z - .1);
        throat.rotation.x = Math.PI / 2; g.add(throat);
      }
      return {g, inputPort: ports[0], outputPort: ports[1]};
    }

    function makeDetokenizer(m) {
      const g = new THREE.Group(); g.name = 'detokenizer';
      g.add(box(1.62, .14, 1.16, m.limestone, 'detok-base', 0, .07, 0));
      for (const x of [-.62, .62]) g.add(box(.14, 1.28, .24, m.darkPewter, 'detok-post', x, .69, 0));
      g.add(box(1.38, .16, .3, m.pewter, 'detok-crown', 0, 1.32, 0));
      // Framed 4-slot UTF-8 multi-byte assembly carriage
      g.add(box(1.12, .36, .22, m.limestone, 'utf8-frame-back', 0, .82, -.12, .02));
      for (const y of [.64, 1.0]) g.add(box(1.14, .045, .28, m.pewter, 'utf8-rail', 0, y, 0, .01));
      const bytes = new THREE.InstancedMesh(chamferedBox(.18, .22, .16, .02), m.attention || m.darkPewter, 4);
      bytes.name = 'utf8-bytes';
      for (let i = 0; i < 4; i++) {
        dummy.position.set(-.36 + i * .24, .82, .02); dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bytes.setMatrixAt(i, dummy.matrix);
      }
      g.add(bytes);
      g.add(box(.88, .08, .22, m.darkPewter, 'utf8-merge-throat', 0, .5, .12, .016));
      const text = box(.92, .09, .18, m.token, 'decoded-text', 0, .34, .32, .02); g.add(text);
      return {g, bytes, text};
    }

    function makeToken(m) {
      const g = new THREE.Group(); g.name = 'hero-token';
      const geometry = chamferedBox(.66, .34, .34, .055, 'high');
      const core = mesh(geometry, m.token.clone(), 'token-core'); core.renderOrder = 20; g.add(core);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24),
        new THREE.LineBasicMaterial({color: m.tokenInk, transparent: true, opacity: .9}));
      edge.name = 'token-emissive-edge'; edge.renderOrder = 21; g.add(edge);
      return {g, core, edge};
    }

    return {chamferedBox, mergeStatic, makeTokenizer, makeEmbedding, makeExpert, makeRouter,
      makeKVCache, makeSampler, makeScreen, makeToolBench, makeDetokenizer, makeToken};
  }

  window.ReaderSpatialModels = Object.freeze({create});
})();
