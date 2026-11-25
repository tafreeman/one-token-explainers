/* Semantic colors shared by the reader UI and both Three.js plates. */
(() => {
  'use strict';

  const css = Object.freeze({
    ground: '#F6F5F2', plate: '#FFFFFF', inset: '#ECEAE3',
    line: '#D6D3CB', grid: '#B8B4AA', ink: '#16181A', muted: '#52575D',
    mark: '#B8320D', token: '#FF4A1C', attention: '#1E4EC8',
    cache: '#855D14', tool: '#1C6B4C', fault: '#9E3E22', silhouette: '#5E6268',
    'hardware-pale': '#EFECE6', 'hardware-deck': '#E4E0D6',
    'hardware-plinth': '#D4CFC4', 'hardware-body': '#B4AFA4', 'hardware-frame': '#8C877E'
  });
  const color = hex => Number.parseInt(hex.slice(1), 16);
  // 3D Lambert/Basic materials share the canonical tokens; Lit surfaces use calibrated high-legibility albedos.
  const colors = Object.freeze({
    ground: color(css.ground), plate: color(css.plate), inset: color(css.inset),
    line: color(css.line), grid: color(css.grid), ink: color(css.ink), muted: color(css.muted),
    mark: color(css.mark), token: color(css.token), attention: 0x265CE0,
    cache: 0xCFA03E, tool: 0x22946E, fault: 0xCA4E2E, silhouette: color(css.silhouette),
    // Spatial PBR uses a light warm limestone-to-pewter ramp with crisp gunmetal/slate frames.
    hardwarePale: 0xDDD8CE, hardwareDeck: 0xC6C0B4, hardwarePlinth: 0xB2ACA0,
    hardwareBody: 0x969186, hardwareFrame: 0x686C72, hardwareGraphite: 0x3D434C
  });
  // Diagram wireframe plates use the pale architectural paper/stone ramp so floors and edges stay crisp.
  const diagramColors = Object.freeze({
    ...colors,
    hardwarePale: color(css['hardware-pale']), hardwareDeck: color(css['hardware-deck']),
    hardwarePlinth: color(css['hardware-plinth']), hardwareBody: color(css['hardware-body']),
    hardwareFrame: color(css['hardware-frame']), hardwareGraphite: 0x282C34
  });

  for (const [name, value] of Object.entries(css)) {
    document.documentElement.style.setProperty('--' + name, value);
  }

  function makeScene(THREE, variant) {
    const diagram = variant === 'diagram';
    const palette = diagram ? diagramColors : colors;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.ground);
    scene.add(new THREE.HemisphereLight(0xFFFDF9, palette.hardwarePlinth, diagram ? 1.85 : 1.18));
    const sun = new THREE.DirectionalLight(0xFFFFFF, diagram ? 1.35 : .95);
    sun.position.set(-30, 70, 45);
    scene.add(sun);
    return { colors: palette, scene };
  }

  function projectedExtent(THREE, group, camera) {
    group.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    const point = new THREE.Vector3();
    const extent = new THREE.Box2();
    group.traverseVisible(object => {
      if (!object.geometry) return;
      const source = object.isInstancedMesh ? object : object.geometry;
      if (!source.boundingBox) source.computeBoundingBox();
      const { min, max } = source.boundingBox;
      for (let i = 0; i < 8; i++) {
        point.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
        point.applyMatrix4(object.matrixWorld).project(camera);
        extent.min.x = Math.min(extent.min.x, point.x);
        extent.max.x = Math.max(extent.max.x, point.x);
        extent.min.y = Math.min(extent.min.y, point.y);
        extent.max.y = Math.max(extent.max.y, point.y);
      }
    });
    return extent;
  }

  window.ReaderTheme = Object.freeze({ css, colors, makeScene, projectedExtent });
})();
