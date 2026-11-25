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
      if (renderer) texture.anisotropy = renderer.userData?.software ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
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
      g.strokeStyle = theme.css.line; g.globalAlpha = .42; g.lineWidth = 1.5;
      g.strokeRect(.75, .75, size - 1.5, size - 1.5);
      g.globalAlpha = .16;
      for (let i = 0; i < 420; i++) {
        const x = (i * 197) % size, y = (i * 313) % size, r = 1 + (i % 2.5);
        g.fillStyle = i % 3 ? theme.css['hardware-deck'] : theme.css['hardware-plinth'];
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }, true);
    floorMap.repeat.set(96, 48);

    const standard = (color, options = {}) => {
      const material = new THREE.MeshStandardMaterial({color, roughness: .54, metalness: 0, ...options});
      material.userData.baseEnv = options.envMapIntensity ?? .7;
      return material;
    };
    const physical = (color, options = {}) => {
      const material = new THREE.MeshPhysicalMaterial({color, roughness: .34, metalness: 0, ...options});
      material.userData.baseEnv = options.envMapIntensity ?? .8;
      material.userData.baseClearcoat = options.clearcoat ?? 0;
      return material;
    };

    const materials = {
      limestone: standard(theme.colors.hardwarePale, {roughness: .74, roughnessMap: mineral, envMapIntensity: .48}),
      pewter: standard(theme.colors.hardwareDeck, {roughness: .38, metalness: .34, roughnessMap: brushed, envMapIntensity: .82}),
      darkPewter: standard(theme.colors.hardwareFrame, {roughness: .35, metalness: .42, roughnessMap: brushed, envMapIntensity: .88}),
      graphite: standard(theme.colors.hardwareGraphite, {roughness: .42, metalness: .28, envMapIntensity: .62}),
      terracotta: physical(theme.colors.fault, {roughness: .34, metalness: .18, clearcoat: .2, clearcoatRoughness: .42, envMapIntensity: .75}),
      attention: physical(theme.colors.attention, {roughness: .3, metalness: .16, clearcoat: .24, clearcoatRoughness: .38, envMapIntensity: .8}),
      brass: physical(theme.colors.cache, {roughness: .28, metalness: .56, clearcoat: .22, clearcoatRoughness: .36, envMapIntensity: .95}),
      pine: physical(theme.colors.tool, {roughness: .36, metalness: .2, clearcoat: .24, clearcoatRoughness: .44, envMapIntensity: .68}),
      token: physical(theme.colors.token, {roughness: .2, metalness: .12, emissive: theme.colors.token,
        emissiveIntensity: .26, clearcoat: .85, clearcoatRoughness: .16, envMapIntensity: 1.05}),
      tokenInk: theme.colors.mark,
      floor: standard(0xFFFFFF, {map: floorMap, roughness: .82, metalness: .02, envMapIntensity: .28}),
    };

    function studioEnvironment() {
      if (!renderer) return null;
      if (environments.has(renderer)) return environments.get(renderer);
      const room = new THREE.Scene(); room.background = new THREE.Color(theme.colors.ground);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(50, 30, 50),
        new THREE.MeshBasicMaterial({color: theme.colors.ground, side: THREE.BackSide}));
      room.add(shell);
      const strips = [];
      const strip = (width, height, x, y, z, rx, ry, colorHex, intensity) => {
        const material = new THREE.MeshBasicMaterial({color: colorHex});
        material.color.multiplyScalar(intensity);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
        panel.position.set(x, y, z); panel.rotation.set(rx, ry, 0); room.add(panel); strips.push(panel);
      };
      strip(18, 5, -12, 10, 5, 0, Math.PI / 3, 0xFFFBF4, 4.8);
      strip(12, 3, 12, 6, 2, 0, -Math.PI / 3, 0xEEF4FF, 3.6);
      strip(20, 2, 0, 12, -12, Math.PI / 5, 0, 0xFFFFFF, 5.2);
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
        if ('clearcoat' in material && material.userData.baseClearcoat) {
          const nextCoat = tier === 'low' ? 0 : material.userData.baseClearcoat;
          if ((material.clearcoat > 0) !== (nextCoat > 0)) material.needsUpdate = true;
          material.clearcoat = nextCoat;
        }
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
      const key = new THREE.DirectionalLight(0xFFFDF8, 2.65); key.position.set(-28, 46, 32); rig.add(key);
      const fill = new THREE.DirectionalLight(0xF5F7FC, 1.45); fill.position.set(32, 22, 22); rig.add(fill);
      const rim = new THREE.DirectionalLight(0xFFFFFF, 2.0); rim.position.set(12, 28, -38); rig.add(rim);
      const active = new THREE.SpotLight(theme.colors.plate, 110, 32, .48, 1, 2);
      const target = new THREE.Object3D(); rig.add(active, target); active.target = target;
      const edge = new THREE.PointLight(theme.colors.plate, 32, 16, 2); rig.add(edge);
      return {rig, key, fill, rim, active, activeTarget: target, edge};
    }

    return {materials, setQuality, addLightRig, invalidate};
  }

  window.ReaderSpatialMaterials = Object.freeze({create});
})();
