/* Physical materials, generated textures and one cached studio environment per renderer. */
(() => {
  'use strict';

  const environments = new WeakMap();

  function create(THREE, theme, renderer) {
    function canvasTexture(size, draw, color = false) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d'); draw(context, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      if (renderer) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return texture;
    }

    const brushed = canvasTexture(128, (g, size) => {
      g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        const value = 128 + ((y * 73) % 47);
        g.fillStyle = `rgb(${value},${value},${value})`; g.globalAlpha = .24;
        g.fillRect(0, y, size, 1);
      }
      g.globalAlpha = 1;
    });
    brushed.repeat.set(1, 8);

    const mineral = canvasTexture(128, (g, size) => {
      g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i++) {
        const x = (i * 47) % size, y = (i * 83) % size, v = 112 + (i * 29) % 80;
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1);
      }
    });
    mineral.repeat.set(3, 3);

    const floorMap = canvasTexture(512, (g, size) => {
      g.fillStyle = theme.css.ground; g.fillRect(0, 0, size, size);
      g.strokeStyle = theme.css.line; g.globalAlpha = .34; g.lineWidth = 1;
      g.strokeRect(.5, .5, size - 1, size - 1);
      g.globalAlpha = .12;
      for (let i = 0; i < 520; i++) {
        const x = (i * 197) % size, y = (i * 313) % size, r = 1 + (i % 3);
        g.fillStyle = i % 3 ? theme.css['hardware-plinth'] : theme.css.grid;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }, true);
    floorMap.repeat.set(96, 48);

    const standard = (color, options = {}) => {
      const material = new THREE.MeshStandardMaterial({color, roughness: .6, metalness: 0, ...options});
      material.userData.baseEnv = options.envMapIntensity ?? .7;
      return material;
    };
    const physical = (color, options = {}) => {
      const material = new THREE.MeshPhysicalMaterial({color, roughness: .35, metalness: 0, ...options});
      material.userData.baseEnv = options.envMapIntensity ?? .8;
      return material;
    };

    const materials = {
      limestone: standard(theme.colors.hardwarePale, {roughness: .82, roughnessMap: mineral, envMapIntensity: .45}),
      pewter: standard(theme.colors.hardwareDeck, {roughness: .42, metalness: .68, roughnessMap: brushed, envMapIntensity: .85}),
      darkPewter: standard(theme.colors.hardwareFrame, {roughness: .36, metalness: .76, roughnessMap: brushed, envMapIntensity: .9}),
      graphite: standard(theme.colors.hardwareGraphite, {roughness: .48, metalness: .45, envMapIntensity: .55}),
      brass: physical(theme.colors.cache, {roughness: .3, metalness: .78, clearcoat: .18, clearcoatRoughness: .4, envMapIntensity: .9}),
      pine: physical(theme.colors.tool, {roughness: .42, metalness: .25, clearcoat: .22, clearcoatRoughness: .5, envMapIntensity: .6}),
      token: physical(theme.colors.token, {roughness: .2, metalness: .12, emissive: theme.colors.token,
        emissiveIntensity: .24, clearcoat: .85, clearcoatRoughness: .16, envMapIntensity: 1.05}),
      tokenInk: theme.colors.mark,
      floor: standard(theme.colors.ground, {map: floorMap, roughness: .72, metalness: .08, envMapIntensity: .25}),
    };

    function studioEnvironment() {
      if (!renderer) return null;
      if (environments.has(renderer)) return environments.get(renderer);
      const room = new THREE.Scene(); room.background = new THREE.Color(theme.colors.ground);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(50, 30, 50),
        new THREE.MeshBasicMaterial({color: theme.colors.inset, side: THREE.BackSide}));
      room.add(shell);
      const strips = [];
      const strip = (width, height, x, y, z, rx, ry, intensity) => {
        const material = new THREE.MeshBasicMaterial({color: theme.colors.plate});
        material.color.multiplyScalar(intensity);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
        panel.position.set(x, y, z); panel.rotation.set(rx, ry, 0); room.add(panel); strips.push(panel);
      };
      strip(18, 5, -12, 10, 5, 0, Math.PI / 3, 4.5);
      strip(12, 3, 12, 6, 2, 0, -Math.PI / 3, 3.2);
      strip(20, 2, 0, 12, -12, Math.PI / 5, 0, 5);
      const generator = new THREE.PMREMGenerator(renderer);
      const target = generator.fromScene(room, .045, .1, 100);
      generator.dispose();
      room.traverse(object => { if (object.geometry) object.geometry.dispose(); if (object.material) object.material.dispose(); });
      const entry = {target, texture: target.texture}; environments.set(renderer, entry);
      return entry;
    }

    function setQuality(scene, tier) {
      const environment = tier === 'low' ? null : studioEnvironment();
      scene.environment = environment?.texture || null;
      for (const material of Object.values(materials)) {
        if (!material?.isMaterial) continue;
        material.envMapIntensity = environment ? material.userData.baseEnv * (tier === 'high' ? 1 : .65) : 0;
      }
      return environment;
    }

    function invalidate() {
      const entry = environments.get(renderer);
      if (entry) entry.target.dispose();
      environments.delete(renderer);
    }

    function addLightRig(scene) {
      const rig = new THREE.Group(); rig.name = 'studio-light-rig'; scene.add(rig);
      const key = new THREE.DirectionalLight(theme.colors.plate, 2.6); key.position.set(-28, 46, 32); rig.add(key);
      const fill = new THREE.DirectionalLight(theme.colors.ground, 1.05); fill.position.set(32, 18, 20); rig.add(fill);
      const rim = new THREE.DirectionalLight(theme.colors.plate, 2.1); rim.position.set(12, 28, -38); rig.add(rim);
      const active = new THREE.SpotLight(theme.colors.plate, 110, 32, .48, 1, 2);
      const target = new THREE.Object3D(); rig.add(active, target); active.target = target;
      const edge = new THREE.PointLight(theme.colors.plate, 32, 16, 2); rig.add(edge);
      return {rig, key, fill, rim, active, activeTarget: target, edge};
    }

    return {materials, setQuality, addLightRig, invalidate};
  }

  window.ReaderSpatialMaterials = Object.freeze({create});
})();
