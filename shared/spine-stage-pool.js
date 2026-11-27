/* Shared render-on-demand WebGL viewport pool for Braided Journey stage slots.
   Mounts ReaderDiagram (Swiss wireframe) and ReaderSpatial (Beamline 3D hall)
   into .spine-stage-slot elements through a single WebGLRenderer overlay with
   0 idle RAF frames, chapter skin adaptation, and static SVG poster twins. */
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PIN_STAY = 12;
  const PIN_STAY_FLIGHT = 90;
  const PIN_GLIDE_MS = 260;
  const PIN_FADE_MS = 160;

  // Fallback pose/beat table derived from one-token/stops-manifest.js so data-step
  // works even on pages that do not load stops-manifest.js.
  const STAGE_COUNTS = [3, 3, 4, 4, 3, 4, 5, 3, 3, 4, 3, 4];
  const STEP_BEATS = {
    '1.1': '1a', '1.2': '1b', '1.3': '1b',
    '2.1': '1c', '2.2': '1c', '2.3': '1d',
    '3.1': '2a', '3.2': '2a', '3.3': '2b', '3.4': '2d',
    '4.1': '3a', '4.2': '3b', '4.3': '3c', '4.4': '3c',
    '5.1': '3e', '5.2': '3e', '5.3': '3f',
    '6.1': '4a', '6.2': '4b', '6.3': '4b', '6.4': '4c',
    '7.1': '5a', '7.2': '5c', '7.3': '5e', '7.4': '5b', '7.5': '5g',
    '8.1': '6a', '8.2': '6a', '8.3': '4d',
    '9.1': '6b', '9.2': '6b', '9.3': '6b',
    '10.1': '6c', '10.2': '6d', '10.3': '6c', '10.4': '6d',
    '11.1': '6e', '11.2': '6e', '11.3': '6e',
    '12.1': '7a', '12.2': '7b', '12.3': '7d', '12.4': '7e'
  };

  function resolveStepMeta(stepId) {
    const id = String(stepId || '').trim();
    if (!id) return null;
    const manifestStops = typeof window !== 'undefined' && window.ReaderManifest?.stops;
    if (Array.isArray(manifestStops)) {
      const hit = manifestStops.find(s => s.id === id);
      if (hit) return { pose: hit.diagramPose, beat: hit.spatialBeat };
    }
    const [stageStr, stepStr] = id.split('.');
    const stage = parseInt(stageStr, 10);
    const step = parseInt(stepStr, 10);
    if (!(stage >= 1 && stage <= 12) || !(step >= 1)) return null;
    const count = STAGE_COUNTS[stage - 1];
    const clampedStep = Math.min(count, step);
    const segment = 0.94 / count;
    const start = stage - 1 + 0.06 + (clampedStep - 1) * segment;
    const end = clampedStep === count ? stage : start + segment;
    return { pose: [start, end], beat: STEP_BEATS[id] || 'hero' };
  }

  const SKINS = Object.freeze({
    light: {
      bgHex: 0xf6f5ef,
      pinBg: '#fbfaf7',
      pinInk: '#1e2530',
      pinBorder: '#987237',
      diagramEdge: 0x16181a,
      diagramPaper: 0xffffff,
      diagramPale: 0xefece6,
      diagramGrid: 0xb8b4aa,
      diagramAttention: 0x265ce0,
      diagramMark: 0xb8320d,
      spatialFloorTint: 0xffffff,
      spatialGridTint: 0xffffff,
      hemiSky: 0xfffdf9,
      hemiGround: 0xd4cfc4,
      hemiIntensity: 1.85
    },
    key: {
      bgHex: 0x141d28,
      pinBg: '#1b2432',
      pinInk: '#f3f5fa',
      pinBorder: '#d4ab62',
      diagramEdge: 0xe2e8f0,
      diagramPaper: 0x1b2636,
      diagramPale: 0x243144,
      diagramGrid: 0x475569,
      diagramAttention: 0x7aa2ff,
      diagramMark: 0xff784f,
      spatialFloorTint: 0x243042,
      spatialGridTint: 0x64748b,
      hemiSky: 0xe8eef8,
      hemiGround: 0x222d3d,
      hemiIntensity: 1.65
    },
    bp: {
      bgHex: 0x0f3358,
      pinBg: '#123a63',
      pinInk: '#ffffff',
      pinBorder: '#e6bf80',
      diagramEdge: 0xdbeafe,
      diagramPaper: 0x133e6b,
      diagramPale: 0x184b80,
      diagramGrid: 0x4b79a8,
      diagramAttention: 0x93c5fd,
      diagramMark: 0xff8559,
      spatialFloorTint: 0x1a4b7c,
      spatialGridTint: 0x60a5fa,
      hemiSky: 0xeaf4ff,
      hemiGround: 0x174473,
      hemiIntensity: 1.65
    }
  });

  function normalizeSkin(raw) {
    return Object.hasOwn(SKINS, raw) ? raw : 'light';
  }

  function inferSlotSkin(slot) {
    const raw = slot?.dataset?.skin;
    if (raw && Object.hasOwn(SKINS, raw)) return raw;
    if (slot?.closest?.('.skin-bp')) return 'bp';
    if (slot?.closest?.('.skin-key')) return 'key';
    return 'light';
  }

  function normalizeCalloutLabel(raw) {
    if (!raw) return '';
    return String(raw)
      .replace(/“\s+Paris”/g, '“ sat”')
      .replace(/“Paris”/g, '“sat”')
      .replace(/\bParis\b/g, 'sat');
  }

  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  }

  function buildPosterSvg(engine) {
    const svg = svgEl('svg', {
      class: 'spine-slot-poster',
      viewBox: '0 0 320 180',
      preserveAspectRatio: 'xMidYMid meet',
      'aria-hidden': 'true'
    });
    const grid = svgEl('g', {
      stroke: 'var(--sv-faint, rgba(120,132,150,0.22))',
      'stroke-width': '0.8'
    });
    for (let x = 24; x < 320; x += 28) grid.appendChild(svgEl('line', { x1: x, y1: 12, x2: x, y2: 168 }));
    for (let y = 24; y < 180; y += 28) grid.appendChild(svgEl('line', { x1: 16, y1: y, x2: 304, y2: y }));
    svg.appendChild(grid);

    if (engine === 'spatial') {
      // Perspective beamline rail, 61-layer tower silhouette, and token bead.
      svg.appendChild(svgEl('path', {
        d: 'M28 134 L126 112 L212 112 L294 128',
        fill: 'none',
        stroke: 'var(--sv-line, rgba(140,152,172,0.55))',
        'stroke-width': '1.6',
        'stroke-dasharray': '4 3'
      }));
      svg.appendChild(svgEl('path', {
        d: 'M28 134 L160 112',
        fill: 'none',
        stroke: 'var(--sv-strong, #7c8cff)',
        'stroke-width': '2.2',
        'stroke-linecap': 'round'
      }));
      const tower = svgEl('g', {
        stroke: 'var(--sv-ink, currentColor)',
        fill: 'var(--sv-chip, rgba(128,140,160,0.12))',
        'stroke-width': '1.1'
      });
      tower.appendChild(svgEl('rect', { x: 146, y: 108, width: 42, height: 14, rx: 2 }));
      for (let i = 0; i < 6; i++) {
        tower.appendChild(svgEl('rect', { x: 152, y: 46 + i * 10, width: 30, height: 6, rx: 1 }));
      }
      svg.appendChild(tower);
      svg.appendChild(svgEl('circle', { cx: 102, cy: 118, r: 6.5, fill: '#FF4A1C', stroke: 'var(--sv-ink, #141824)', 'stroke-width': '1.2' }));
      svg.appendChild(svgEl('rect', { x: 236, y: 66, width: 44, height: 34, rx: 3, fill: 'var(--sv-chip, rgba(128,140,160,0.12))', stroke: 'var(--sv-line, rgba(140,152,172,0.6))', 'stroke-width': '1.1' }));
    } else {
      // Isometric wireframe station boxes, flow arc, and tracked token cube.
      const wire = svgEl('g', {
        fill: 'var(--sv-chip, rgba(128,140,160,0.12))',
        stroke: 'var(--sv-ink, currentColor)',
        'stroke-width': '1.15',
        'stroke-linejoin': 'round'
      });
      wire.appendChild(svgEl('polygon', { points: '52,114 92,94 132,114 92,134' }));
      wire.appendChild(svgEl('polygon', { points: '124,96 164,76 204,96 164,116' }));
      wire.appendChild(svgEl('polygon', { points: '124,72 164,52 204,72 164,92' }));
      wire.appendChild(svgEl('polygon', { points: '208,110 248,90 288,110 248,130' }));
      svg.appendChild(wire);
      svg.appendChild(svgEl('path', {
        d: 'M92 108 Q164 42 248 104',
        fill: 'none',
        stroke: 'var(--sv-strong, #7c8cff)',
        'stroke-width': '1.5',
        'stroke-dasharray': '3 3'
      }));
      svg.appendChild(svgEl('polygon', {
        points: '154,68 164,63 174,68 164,73',
        fill: '#FF4A1C',
        stroke: '#B8320D',
        'stroke-width': '1'
      }));
    }
    return svg;
  }

  function create(options = {}) {
    const reduced = typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false, addEventListener() {}, removeEventListener() {} };

    const hostParent = options.parent || document.body;
    const hostEl = document.createElement('div');
    hostEl.className = 'spine-pool-host';
    hostEl.setAttribute('aria-hidden', 'true');

    const canvas = document.createElement('canvas');
    canvas.className = 'spine-pool-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    const leadersSvg = svgEl('svg', { class: 'spine-pool-leaders', 'aria-hidden': 'true' });
    const leaderLine = svgEl('line', { class: 'spine-pool-leader' });
    const leaderDot = svgEl('circle', { class: 'spine-pool-leader-dot', r: '2.75' });
    leadersSvg.append(leaderLine, leaderDot);

    const pinEl = document.createElement('span');
    pinEl.className = 'spine-pool-pin';
    pinEl.setAttribute('aria-hidden', 'true');
    pinEl.hidden = true;
    const pinTextEl = document.createElement('span');
    pinTextEl.dataset.pinText = '';
    pinEl.appendChild(pinTextEl);

    hostEl.append(canvas, leadersSvg, pinEl);
    hostParent.appendChild(hostEl);

    const scenes = {};
    const origColors = new WeakMap();
    const spatialFrameCosts = [];

    let THREE = null;
    let renderer = null;
    let software = false;
    let cpuDriver = false;
    let revision = null;
    let appliedSpatialQuality = null;

    const qualityParam = typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('quality')
      : null;
    const lowPower = Boolean(
      typeof navigator !== 'undefined' &&
      (navigator.connection?.saveData || navigator.deviceMemory <= 2 || navigator.hardwareConcurrency <= 2)
    );
    let quality = 1;
    let qualityTier = options.quality || (qualityParam === 'high' ? 'high' : (qualityParam === 'low' || lowPower) ? 'low' : 'high');

    let settings = {
      cache: options.settings?.cache === 'miss' ? 'miss' : 'hit',
      kv: options.settings?.kv === 'dense' ? 'dense' : 'sparse',
      effort: options.settings?.effort || 'high'
    };

    let slots = [];
    let activeSlot = null;
    let externalState = {};
    let raf = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 0;
    let moving = false;
    let snapNext = false;
    let suspended = false;
    let lost = false;
    let failed = false;
    let destroyed = false;

    let frames = 0;
    let calls = 0;
    let lastFrame = null;
    let renderedEngine = null;
    let renderedSkin = null;
    let renderedSlot = null;
    let renderedStep = null;
    let lastSignature = '';

    // Pin placement & glide state
    let pinSide = -1;
    let pinShown = null;
    let pinFrom = null;
    let pinStart = 0;
    let pinLabel = '';

    function forgetPin() {
      pinSide = -1;
      pinShown = null;
      pinFrom = null;
    }

    function hidePin() {
      forgetPin();
      pinLabel = '';
      pinEl.hidden = true;
      leaderLine.style.visibility = 'hidden';
      leaderDot.style.visibility = 'hidden';
    }

    function clearLiveSlots() {
      for (const s of slots) { s.classList.remove('is-live'); delete s.dataset.tok; }
    }

    /* Hosts can dock their own token marker onto the drawing: the slot carries the token's projected
       position as --tok-x / --tok-y (px from its top-left) and data-tok="1" while that point is on screen. */
    function publishToken(slot, token, camera, w, h) {
      if (!token || !camera) { delete slot.dataset.tok; return; }
      const point = token.clone().project(camera);
      const x = (point.x + 1) * w / 2, y = (1 - point.y) * h / 2;
      const inside = point.z >= -1 && point.z <= 1 && x >= 0 && x <= w && y >= 0 && y <= h;
      if (!inside) { delete slot.dataset.tok; return; }
      slot.style.setProperty('--tok-x', x.toFixed(1) + 'px');
      slot.style.setProperty('--tok-y', y.toFixed(1) + 'px');
      slot.dataset.tok = '1';
    }

    function hideOverlay() {
      hostEl.classList.remove('is-visible');
      hidePin();
      clearLiveSlots();
    }

    function cancel() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function schedule() {
      if (!raf && !destroyed && renderer && !suspended && !document.hidden && !lost && !failed) {
        raf = requestAnimationFrame(draw);
      }
    }

    function applySkin(engine, currentSceneObj, skinName) {
      const skin = normalizeSkin(skinName);
      const spec = SKINS[skin];
      const scene = currentSceneObj?.scene;

      hostEl.style.setProperty('--pin-bg', spec.pinBg);
      hostEl.style.setProperty('--pin-ink', spec.pinInk);
      hostEl.style.setProperty('--pin-border', spec.pinBorder);

      if (!scene || !THREE) return skin;

      if (scene.background?.isColor) scene.background.setHex(spec.bgHex);
      else scene.background = new THREE.Color(spec.bgHex);

      if (scene.fog?.color) scene.fog.color.setHex(spec.bgHex);

      if (engine === 'diagram') {
        scene.traverse(obj => {
          if (obj.isHemisphereLight) {
            obj.color.setHex(spec.hemiSky);
            obj.groundColor.setHex(spec.hemiGround);
            obj.intensity = spec.hemiIntensity;
            return;
          }
          const mat = obj.material;
          if (!mat || !mat.color) return;
          if (!origColors.has(mat)) origColors.set(mat, mat.color.getHex());
          const orig = origColors.get(mat);
          if (obj.isLineSegments || obj.isLine) {
            if (orig === 0x16181a) mat.color.setHex(spec.diagramEdge);
            else if (orig === 0xb8b4aa) mat.color.setHex(spec.diagramGrid);
            else if (orig === 0x265ce0) mat.color.setHex(spec.diagramAttention);
            else if (orig === 0xb8320d) mat.color.setHex(spec.diagramMark);
          } else if (obj.isMesh) {
            if (orig === 0xffffff) mat.color.setHex(spec.diagramPaper);
            else if (orig === 0xefece6) mat.color.setHex(spec.diagramPale);
          }
        });
      } else if (engine === 'spatial') {
        scene.traverse(obj => {
          if (obj.name === 'lit-terrazzo-floor' && obj.material?.color) {
            obj.material.color.setHex(spec.spatialFloorTint);
          } else if (obj.type === 'GridHelper' && obj.material?.color) {
            obj.material.color.setHex(spec.spatialGridTint);
          }
        });
      }
      return skin;
    }

    function placePin(pinState, camera, w, h) {
      const label = normalizeCalloutLabel(pinState?.label);
      const anchor = pinState?.anchor;
      if (!anchor || !label || !camera) {
        hidePin();
        return false;
      }

      const point = anchor.clone().project(camera);
      const x = (point.x + 1) * w / 2;
      const y = (1 - point.y) * h / 2;
      if (point.z < -1 || point.z > 1 || x < 1 || x > w - 1 || y < 1 || y > h - 1) {
        forgetPin();
        pinEl.hidden = true;
        leaderLine.style.visibility = 'hidden';
        leaderDot.style.visibility = 'hidden';
        return false;
      }

      let tokenRect = null;
      const tokenAnchor = pinState.tokenAnchor;
      const tokenRadius = pinState.tokenRadius || 0;
      if (tokenAnchor && label !== '“ sat”' && label !== '“sat”' && camera.fov) {
        const projected = tokenAnchor.clone().project(camera);
        const distance = Math.max(0.1, camera.position.distanceTo(tokenAnchor));
        const radius = Math.min(140, Math.max(26, tokenRadius * h /
          (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)))) + 10;
        const tx = (projected.x + 1) * w / 2;
        const ty = (1 - projected.y) * h / 2;
        tokenRect = { left: tx - radius, right: tx + radius, top: ty - radius, bottom: ty + radius };
      }

      pinEl.hidden = false;
      if (pinTextEl.textContent !== label) pinTextEl.textContent = label;

      const stay = pinState.moving && pinLabel === label ? PIN_STAY_FLIGHT : PIN_STAY;
      if (pinLabel !== label) {
        if (pinLabel && !reduced.matches && pinEl.animate) {
          pinEl.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: PIN_FADE_MS,
            easing: 'cubic-bezier(.16, 1, .3, 1)'
          });
        }
        forgetPin();
        pinLabel = label;
      }

      pinEl.style.maxWidth = Math.max(24, Math.min(240, w - 24)) + 'px';
      const pw = pinEl.offsetWidth;
      const ph = pinEl.offsetHeight;
      if (!pw || !ph) {
        leaderLine.style.visibility = 'hidden';
        leaderDot.style.visibility = 'hidden';
        return false;
      }

      const gap = 24;
      const pad = 12;
      const candidates = [
        [x - pw / 2, y - ph - gap],
        [x + gap, y - ph - gap],
        [x - gap - pw, y - ph - gap],
        [x + gap, y - ph / 2],
        [x - gap - pw, y - ph / 2],
        [x + gap, y + gap],
        [x - gap - pw, y + gap],
        [x - pw / 2, y + gap]
      ];
      if (tokenRect) {
        candidates.push(
          [x - pw / 2, tokenRect.top - ph - pad],
          [tokenRect.right + pad, y - ph / 2],
          [tokenRect.left - pw - pad, y - ph / 2],
          [x - pw / 2, tokenRect.bottom + pad]
        );
      }

      const overlapsToken = (l, t) => Boolean(
        tokenRect && l < tokenRect.right && l + pw > tokenRect.left && t < tokenRect.bottom && t + ph > tokenRect.top
      );

      let best = candidates[0];
      let bestScore = -1e9;
      let bestIndex = 0;

      for (const [index, [rawL, rawT]] of candidates.entries()) {
        const cl = Math.max(pad, Math.min(w - pw - pad, rawL));
        const ct = Math.max(pad, Math.min(h - ph - pad, rawT));
        const clampPenalty = Math.abs(cl - rawL) + Math.abs(ct - rawT);
        const endX = Math.max(cl, Math.min(cl + pw, x));
        const endY = Math.max(ct, Math.min(ct + ph, y));
        const length = Math.hypot(endX - x, endY - y);
        const overlapsAnchor = (x >= cl - 8 && x <= cl + pw + 8 && y >= ct - 8 && y <= ct + ph + 8) ? 500 : 0;
        const topBias = ct + ph <= y ? 10 : 0;
        let crossesToken = false;
        if (tokenRect && !(x >= tokenRect.left && x <= tokenRect.right && y >= tokenRect.top && y <= tokenRect.bottom)) {
          let enter = 0;
          let exit = 1;
          for (const [start, delta, min, max] of [
            [x, endX - x, tokenRect.left, tokenRect.right],
            [y, endY - y, tokenRect.top, tokenRect.bottom]
          ]) {
            if (Math.abs(delta) < 0.001) {
              if (start < min || start > max) { exit = -1; break; }
            } else {
              const a = (min - start) / delta;
              const b = (max - start) / delta;
              enter = Math.max(enter, Math.min(a, b));
              exit = Math.min(exit, Math.max(a, b));
            }
          }
          crossesToken = enter <= exit;
        }
        const score = topBias - length - clampPenalty * 2 - overlapsAnchor -
          (overlapsToken(cl, ct) ? 10000 : 0) - (crossesToken ? 250 : 0) + (index === pinSide ? stay : 0);
        if (score > bestScore) {
          bestScore = score;
          best = [cl, ct];
          bestIndex = index;
        }
      }

      const now = performance.now();
      if (pinShown && bestIndex !== pinSide && !reduced.matches) {
        pinFrom = pinShown;
        pinStart = now;
      }
      pinSide = bestIndex;

      let [left, top] = best;
      let gliding = false;
      if (pinFrom) {
        const k = Math.min(1, (now - pinStart) / PIN_GLIDE_MS);
        const e = k * k * (3 - 2 * k);
        left = pinFrom[0] + (left - pinFrom[0]) * e;
        top = pinFrom[1] + (top - pinFrom[1]) * e;
        if (k >= 1) pinFrom = null;
        else gliding = true;
      }

      left = Math.max(pad, Math.min(w - pw - pad, left));
      top = Math.max(pad, Math.min(h - ph - pad, top));

      if (overlapsToken(left, top) && !overlapsToken(best[0], best[1])) {
        if (gliding) {
          const pushes = [
            [left, tokenRect.top - ph],
            [left, tokenRect.bottom],
            [tokenRect.left - pw, top],
            [tokenRect.right, top]
          ]
            .map(([nx, ny]) => [Math.max(pad, Math.min(w - pw - pad, nx)), Math.max(pad, Math.min(h - ph - pad, ny))])
            .filter(([nx, ny]) => !overlapsToken(nx, ny));
          if (pushes.length) {
            pushes.sort((a, b) => Math.hypot(a[0] - left, a[1] - top) - Math.hypot(b[0] - left, b[1] - top));
            [left, top] = pushes[0];
          } else {
            [left, top] = best;
            pinFrom = null;
            gliding = false;
          }
        } else {
          [left, top] = best;
          pinFrom = null;
        }
      }

      pinShown = [left, top];
      pinEl.style.left = Math.round(left) + 'px';
      pinEl.style.top = Math.round(top) + 'px';
      leaderLine.style.visibility = 'visible';
      leaderLine.setAttribute('x1', x.toFixed(1));
      leaderLine.setAttribute('y1', y.toFixed(1));
      leaderLine.setAttribute('x2', Math.max(left, Math.min(left + pw, x)).toFixed(1));
      leaderLine.setAttribute('y2', Math.max(top, Math.min(top + ph, y)).toFixed(1));
      leaderDot.style.visibility = 'visible';
      leaderDot.setAttribute('cx', x.toFixed(1));
      leaderDot.setAttribute('cy', y.toFixed(1));
      return gliding;
    }

    function isSlotVisible(rect) {
      if (!rect || rect.width < 16 || rect.height < 16) return false;
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
    }

    function pickBestVisibleSlot() {
      if (!slots.length) return null;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      const targetY = vh * 0.48;
      let best = null;
      let bestScore = -Infinity;
      for (const slot of slots) {
        if (!slot.isConnected) continue;
        const r = slot.getBoundingClientRect();
        if (!isSlotVisible(r)) continue;
        const visH = Math.min(vh, r.bottom) - Math.max(0, r.top);
        const visRatio = visH / Math.max(1, r.height);
        const centerDist = Math.abs((r.top + r.bottom) * 0.5 - targetY) / Math.max(1, vh);
        const score = visRatio * 2 - centerDist;
        if (score > bestScore) {
          bestScore = score;
          best = slot;
        }
      }
      return best;
    }

    function resolveSlotState(slot) {
      const ds = slot.dataset || {};
      const engine = (externalState.engine || ds.engine) === 'spatial' ? 'spatial' : 'diagram';
      const skin = normalizeSkin(externalState.skin || inferSlotSkin(slot));
      const stepId = externalState.stepId ?? ds.step ?? '';
      const meta = resolveStepMeta(stepId);
      const localT = externalState.localT != null
        ? Number(externalState.localT)
        : (ds.localT != null ? Number(ds.localT) : 0);
      const clampedT = Number.isFinite(localT) ? Math.max(0, Math.min(1, localT)) : 0;

      let diagramPose = externalState.diagramPose != null
        ? Number(externalState.diagramPose)
        : (ds.diagramPose != null ? Number(ds.diagramPose) : null);
      if (diagramPose == null || !Number.isFinite(diagramPose)) {
        diagramPose = meta ? meta.pose[0] + (meta.pose[1] - meta.pose[0]) * clampedT : 0;
      }

      const spatialBeat = externalState.spatialBeat || ds.spatialBeat || meta?.beat || 'hero';
      const overview = Boolean(externalState.overview ?? (ds.overview === '1' || ds.overview === 'true'));
      const opening = Boolean(externalState.opening ?? (ds.opening === '1' || ds.opening === 'true'));
      const recap = Boolean(externalState.recap ?? (ds.recap === '1' || ds.recap === 'true'));
      const present = Boolean(externalState.present);
      const narrated = Boolean(externalState.narrated);
      const camera = externalState.camera || ds.camera || 'director';

      return {
        engine,
        skin,
        sceneState: {
          stepId,
          diagramPose,
          spatialBeat,
          localT: clampedT,
          overallT: externalState.overallT ?? clampedT,
          overview,
          opening,
          recap,
          present,
          narrated,
          camera,
          settings: { ...settings }
        }
      };
    }

    function stateSignature(slot, engine, skin, s, rect) {
      return [
        slot?.dataset?.slotId || slots.indexOf(slot),
        engine,
        skin,
        s.stepId,
        Number(s.diagramPose).toFixed(4),
        s.spatialBeat,
        Number(s.localT).toFixed(4),
        s.overview ? 1 : 0,
        s.opening ? 1 : 0,
        s.recap ? 1 : 0,
        s.present ? 1 : 0,
        s.camera,
        s.settings.cache,
        s.settings.kv,
        s.settings.effort,
        qualityTier,
        Math.round(rect.width),
        Math.round(rect.height)
      ].join('|');
    }

    function draw() {
      raf = 0;
      if (destroyed || suspended || document.hidden || lost || failed || !renderer) return;

      const slot = activeSlot && activeSlot.isConnected ? activeSlot : pickBestVisibleSlot();
      if (!slot) {
        hideOverlay();
        return;
      }
      const rect = slot.getBoundingClientRect();
      if (!isSlotVisible(rect)) {
        hideOverlay();
        return;
      }

      const { engine, skin, sceneState } = resolveSlotState(slot);
      const api = engine === 'spatial' ? window.ReaderSpatial : window.ReaderDiagram;
      if (!api || !window.ReaderTheme) {
        hideOverlay();
        return;
      }

      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));

      // Align fixed overlay to the active slot without triggering layout reads after writes.
      const radius = getComputedStyle(slot).borderRadius;
      hostEl.style.left = Math.round(rect.left) + 'px';
      hostEl.style.top = Math.round(rect.top) + 'px';
      hostEl.style.width = w + 'px';
      hostEl.style.height = h + 'px';
      hostEl.style.borderRadius = radius || '0px';
      hostEl.classList.add('is-visible');

      const cap = (lowPower || cpuDriver) ? 1 : (software ? 1.25 : 2);
      const budget = (lowPower || cpuDriver) ? 900000 : (software ? 1200000 : 2600000);
      const scale = Math.max(0.6, Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(budget / (w * h))) * quality);
      const resized = w !== width || h !== height || scale !== pixelRatio;
      if (resized) {
        width = w;
        height = h;
        pixelRatio = scale;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      }

      const slotChanged = renderedSlot !== slot;
      const engineChanged = Boolean(renderedEngine && renderedEngine !== engine);
      if (slotChanged || engineChanged) {
        forgetPin();
        snapNext = true;
      }

      try {
        const current = scenes[engine] ?? (scenes[engine] = api.create(THREE, window.ReaderTheme, renderer));
        if (engine === 'spatial' && appliedSpatialQuality !== qualityTier) {
          current.setQuality?.(qualityTier);
          appliedSpatialQuality = qualityTier;
        }

        applySkin(engine, current, skin);

        const started = performance.now();
        const snapCamera = slotChanged || engineChanged || resized || snapNext;
        const pinState = current.update(
          { ...sceneState, reducedMotion: reduced.matches, snapCamera },
          width / height,
          width
        );
        snapNext = false;
        moving = Boolean(pinState?.moving);

        renderer.toneMapping = engine === 'spatial' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        renderer.toneMappingExposure = engine === 'spatial' ? (current.exposure ?? 1) : 1;
        renderer.render(current.scene, current.camera);

        if (engine === 'spatial') {
          const ms = performance.now() - started;
          spatialFrameCosts.push(ms);
          if (spatialFrameCosts.length > 240) spatialFrameCosts.shift();
        }

        frames += 1;
        calls = renderer.info.render.calls;
        lastFrame = pinState?.frame || null;
        renderedEngine = engine;
        renderedSkin = skin;
        renderedSlot = slot;
        renderedStep = sceneState.stepId || sceneState.spatialBeat;
        lastSignature = stateSignature(slot, engine, skin, sceneState, rect);

        for (const s of slots) s.classList.toggle('is-live', s === slot);

        publishToken(slot, pinState?.token, current.camera, width, height);
        const gliding = placePin(pinState, current.camera, width, height);
        if ((moving || gliding) && !reduced.matches) schedule();
      } catch (err) {
        failed = true;
        cancel();
        hideOverlay();
        console.warn('SpineStagePool fallback to static posters:', err);
      }
    }

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        if (!suspended && !document.hidden && !lost && !failed && activeSlot) schedule();
      })
      : null;

    function mountSlots(root = document) {
      const container = root || document;
      const found = Array.from(container.querySelectorAll('.spine-stage-slot'));
      for (const slot of found) {
        if (!slot.querySelector('.spine-slot-poster')) {
          const engine = slot.dataset.engine === 'spatial' ? 'spatial' : 'diagram';
          slot.prepend(buildPosterSvg(engine));
        }
        resizeObserver?.observe(slot);
      }
      slots = Array.from(document.querySelectorAll('.spine-stage-slot'));
      return slots;
    }

    function sync(scrollState = {}) {
      if (destroyed) return;
      if (scrollState && typeof scrollState === 'object') {
        const nextExt = { ...scrollState };
        delete nextExt.slot;
        externalState = nextExt;
        if (scrollState.settings) {
          settings = {
            cache: scrollState.settings.cache === 'miss' ? 'miss' : 'hit',
            kv: scrollState.settings.kv === 'dense' ? 'dense' : 'sparse',
            effort: scrollState.settings.effort || 'high'
          };
        }
      }

      let candidate = null;
      if (scrollState?.slot) {
        candidate = typeof scrollState.slot === 'string'
          ? document.querySelector(scrollState.slot)
          : scrollState.slot;
      } else {
        candidate = pickBestVisibleSlot();
      }

      if (!candidate || !candidate.isConnected) {
        activeSlot = null;
        lastSignature = '';
        hideOverlay();
        return;
      }

      const rect = candidate.getBoundingClientRect();
      if (!isSlotVisible(rect)) {
        activeSlot = null;
        lastSignature = '';
        hideOverlay();
        return;
      }

      activeSlot = candidate;
      const { engine, skin, sceneState } = resolveSlotState(candidate);
      const sig = stateSignature(candidate, engine, skin, sceneState, rect);
      if (sig === lastSignature && !moving && renderedSlot === candidate && hostEl.classList.contains('is-visible')) {
        // Keep exact overlay coordinates synced with scroll without re-rendering WebGL.
        hostEl.style.left = Math.round(rect.left) + 'px';
        hostEl.style.top = Math.round(rect.top) + 'px';
        return;
      }
      schedule();
    }

    function initRenderer(threeRef) {
      if (destroyed) return;
      THREE = threeRef;
      revision = THREE.REVISION;
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext?.('webgl2') || probe.getContext?.('webgl');
        if (gl) {
          const info = gl.getExtension('WEBGL_debug_renderer_info');
          const label = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
          software = /swiftshader|basic render|warp|llvmpipe|softpipe|software/i.test(label);
          cpuDriver = /basic render|warp|llvmpipe|softpipe/i.test(label);
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
      } catch {}
      if (cpuDriver && qualityParam !== 'high') qualityTier = 'low';

      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: !software && !lowPower,
        stencil: false,
        powerPreference: 'high-performance'
      });
      renderer.userData = { software, cpuDriver };
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
    }

    function onContextLost(event) {
      event.preventDefault();
      lost = true;
      cancel();
      hideOverlay();
    }

    function onContextRestored() {
      lost = false;
      snapNext = true;
      width = 0;
      height = 0;
      pixelRatio = 0;
      scenes.spatial?.contextRestored?.();
      appliedSpatialQuality = null;
      lastSignature = '';
      if (activeSlot) schedule();
    }

    function onVisibilityChange() {
      if (document.hidden) {
        cancel();
      } else if (!suspended && !lost && !failed && activeSlot) {
        snapNext = true;
        schedule();
      }
    }

    function onResize() {
      if (!suspended && !document.hidden && !lost && !failed && activeSlot) {
        lastSignature = '';
        schedule();
      }
    }

    function onReducedChange() {
      if (!suspended && !document.hidden && !lost && !failed && activeSlot) schedule();
    }

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', onResize, { passive: true });
    reduced.addEventListener('change', onReducedChange);
    document.fonts?.ready.then(() => {
      if (!suspended && !document.hidden && activeSlot) schedule();
    });

    try {
      if (window.THREE) {
        initRenderer(window.THREE);
      } else if (typeof window.ensureJourneyThree === 'function') {
        window.ensureJourneyThree('160').then(threeRef => {
          initRenderer(threeRef);
          if (activeSlot) schedule();
        }).catch(err => {
          failed = true;
          hideOverlay();
          console.warn('SpineStagePool Three.js load failed:', err);
        });
      } else {
        throw new Error('Three.js r160 is unavailable.');
      }
    } catch (err) {
      failed = true;
      hideOverlay();
      console.warn('SpineStagePool WebGL unavailable:', err);
    }

    mountSlots(options.root || document);

    return {
      mountSlots,
      sync,
      suspend() {
        suspended = true;
        cancel();
      },
      resume() {
        suspended = false;
        snapNext = true;
        if (activeSlot) schedule();
      },
      setQuality(tier) {
        if (!['high', 'medium', 'low'].includes(tier)) return;
        qualityTier = tier;
        quality = tier === 'low' ? 0.85 : 1;
        appliedSpatialQuality = null;
        lastSignature = '';
        if (activeSlot) schedule();
      },
      setSettings(partial = {}) {
        if (!partial || typeof partial !== 'object') return;
        settings = {
          cache: partial.cache === 'miss' ? 'miss' : (partial.cache === 'hit' ? 'hit' : settings.cache),
          kv: partial.kv === 'dense' ? 'dense' : (partial.kv === 'sparse' ? 'sparse' : settings.kv),
          effort: partial.effort || settings.effort
        };
        lastSignature = '';
        if (activeSlot) schedule();
      },
      stats() {
        const sorted = spatialFrameCosts.slice().sort((a, b) => a - b);
        const p95FrameMs = sorted.length ? sorted[Math.ceil(0.95 * sorted.length) - 1] : 0;
        return {
          frames,
          calls,
          revision,
          lost,
          suspended,
          failed,
          moving,
          engine: renderedEngine,
          skin: renderedSkin,
          step: renderedStep,
          view: renderedEngine,
          frame: lastFrame,
          qualityTier,
          pixelRatio,
          p95FrameMs,
          triangles: renderer?.info?.render?.triangles ?? 0,
          buffer: renderer ? [canvas.width, canvas.height] : [0, 0],
          slotCount: slots.length,
          rafActive: Boolean(raf)
        };
      },
      destroy() {
        destroyed = true;
        cancel();
        hideOverlay();
        resizeObserver?.disconnect();
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('resize', onResize);
        reduced.removeEventListener('change', onReducedChange);
        renderer?.dispose?.();
        hostEl.remove();
      }
    };
  }

  window.SpineStagePool = Object.freeze({ create, SKINS, normalizeCalloutLabel });
})();
