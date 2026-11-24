/* A single render-on-demand WebGL context for the diagram and spatial plates. */
(() => {
  'use strict';

  let instance;

  function create() {
    instance ??= initialize();
    return instance;
  }

  async function initialize() {
    const viewport = document.getElementById('viewport');
    const canvas = document.getElementById('scene');
    const pin = document.getElementById('pin');
    const mobilePin = document.getElementById('mobile-pin');
    const leader = document.getElementById('leader');
    const fallbackStatus = document.getElementById('fallback-status');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const scenes = {};
    let renderer, THREE, state, animation, fadeCanvas, fadeCtx, settleUntil = 0;
    const SETTLE_MS = 900;
    let quality = 1, qualityTier = 'high', appliedSpatialQuality = null;
    let frames = 0, calls = 0, raf = 0, width = 0, height = 0, pixelRatio = 0;
    const spatialFrameCosts = [];
    let revision = null, signature, renderedView, renderedStep;
    let lastFrame = null, lastCameraPose = null;
    let lost = false, suspended = false, failed = false;

    const PIN_STAY = 22, PIN_GLIDE_MS = 260, PIN_FADE_MS = 160;
    let pinSide = -1, pinShown = null, pinFrom = null, pinStart = 0, pinLabel = '';

    function forgetPin() { pinSide = -1; pinShown = null; pinFrom = null; }

    function hidePin() {
      forgetPin();
      if (pin) pin.hidden = true;
      if (mobilePin) mobilePin.textContent = '';
      if (leader) leader.style.visibility = 'hidden';
    }

    function placePin({ anchor, label, tokenAnchor, tokenRadius = 0 }, camera, w, h) {
      if (mobilePin) {
        mobilePin.textContent = label && label !== '“ Paris”' ? '· ' + label : '';
      }
      if (!pin || !leader || !label) {
        forgetPin();
        if (pin) pin.hidden = true;
        if (leader) leader.style.visibility = 'hidden';
        return;
      }
      const point = anchor.clone().project(camera);
      const x = (point.x + 1) * w / 2;
      const y = (1 - point.y) * h / 2;
      let tokenRect = null;
      if (tokenAnchor && label !== '“ Paris”') {
        const projected = tokenAnchor.clone().project(camera);
        const distance = Math.max(.1, camera.position.distanceTo(tokenAnchor));
        const radius = Math.min(140, Math.max(26, tokenRadius * h /
          (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)))) + 10;
        const tx = (projected.x + 1) * w / 2, ty = (1 - projected.y) * h / 2;
        tokenRect = {left: tx - radius, right: tx + radius, top: ty - radius, bottom: ty + radius};
      }
      if (point.z < -1 || point.z > 1 || x < 1 || x > w - 1 || y < 1 || y > h - 1) {
        forgetPin();
        pin.hidden = true;
        leader.style.visibility = 'hidden';
        return;
      }
      pin.hidden = false;
      const text = pin.querySelector('[data-pin-text]') || pin;
      if (text.textContent !== label) text.textContent = label;
      if (pinLabel !== label) {
        // New label: a short fade says "this is a different callout" without moving anything.
        if (pinLabel && !reduced.matches && pin.animate) pin.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PIN_FADE_MS, easing: 'cubic-bezier(.16, 1, .3, 1)' });
        pinLabel = label;
      }
      pin.style.maxWidth = Math.max(24, Math.min(240, w - 24)) + 'px';
      const pw = pin.offsetWidth;
      const ph = pin.offsetHeight;
      if (!pw || !ph) {
        leader.style.visibility = 'hidden';
        return;
      }
      const gap = 22;
      const pad = 12;
      // 4-quadrant obstacle-aware solver: push the pin outward away from the
      // viewport's central 3D mass while keeping it inside the frame.
      const cx = w * 0.5, cy = h * 0.54;
      const candidates = [
        [x + gap, y - ph - gap],
        [x - gap - pw, y - ph - gap],
        [x + gap, y + gap],
        [x - gap - pw, y + gap],
        [pad, pad], [w - pw - pad, pad],
        [pad, h - ph - pad], [w - pw - pad, h - ph - pad]
      ];
      let best = candidates[0], bestScore = -1e9, bestIndex = 0;
      for (const [index, [rawL, rawT]] of candidates.entries()) {
        const cl = Math.max(pad, Math.min(w - pw - pad, rawL));
        const ct = Math.max(pad, Math.min(h - ph - pad, rawT));
        const clampPenalty = Math.abs(cl - rawL) + Math.abs(ct - rawT);
        const bx = cl + pw / 2, by = ct + ph / 2;
        const distFromCenter = Math.hypot((bx - cx) / Math.max(1, w), (by - cy) / Math.max(1, h)) * 120;
        const overlapsAnchor = (x >= cl - 8 && x <= cl + pw + 8 && y >= ct - 8 && y <= ct + ph + 8) ? 500 : 0;
        const topBias = rawT < y ? 14 : 0;
        const tokenOverlap = tokenRect ? Math.max(0, Math.min(cl + pw, tokenRect.right) - Math.max(cl, tokenRect.left)) *
          Math.max(0, Math.min(ct + ph, tokenRect.bottom) - Math.max(ct, tokenRect.top)) : 0;
        // Hysteresis: the current side wins near-ties, so the label stops hopping across the anchor.
        const score = distFromCenter + topBias - clampPenalty * 2.4 - overlapsAnchor - tokenOverlap * 50 + (index === pinSide ? PIN_STAY : 0);
        if (score > bestScore) {
          bestScore = score;
          best = [cl, ct];
          bestIndex = index;
        }
      }
      // A forced side change glides to its new corner instead of teleporting.
      const now = performance.now();
      if (pinShown && bestIndex !== pinSide && !reduced.matches) { pinFrom = pinShown; pinStart = now; }
      pinSide = bestIndex;
      let [left, top] = best, gliding = false;
      if (pinFrom) {
        const k = Math.min(1, (now - pinStart) / PIN_GLIDE_MS), e = k * k * (3 - 2 * k);
        left = pinFrom[0] + (left - pinFrom[0]) * e;
        top = pinFrom[1] + (top - pinFrom[1]) * e;
        if (k >= 1) pinFrom = null; else gliding = true;
      }
      pinShown = [left, top];
      pin.style.left = Math.round(left) + 'px';
      pin.style.top = Math.round(top) + 'px';
      if (pin.dataset) pin.dataset.intersectsToken = String(Boolean(tokenRect &&
        left < tokenRect.right && left + pw > tokenRect.left && top < tokenRect.bottom && top + ph > tokenRect.top));
      leader.style.visibility = 'visible';
      leader.setAttribute('x1', x.toFixed(1));
      leader.setAttribute('y1', y.toFixed(1));
      leader.setAttribute('x2', Math.max(left, Math.min(left + pw, x)).toFixed(1));
      leader.setAttribute('y2', Math.max(top, Math.min(top + ph, y)).toFixed(1));
      return gliding;
    }

    function cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function fallback(error) {
      failed = true;
      cancel();
      if (viewport) viewport.dataset.render = 'fallback';
      if (fallbackStatus) fallbackStatus.textContent = '3D view unavailable — showing static lifecycle diagram.';
      hidePin();
      console.warn('Interactive figure unavailable.', error);
    }

    function draw() {
      raf = 0;
      if (suspended || lost || !renderer || !state) return;
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      if (!w || !h) return;
      // Sharp on HiDPI without paying for it everywhere: the cap and pixel budget are lower on weak
      // devices, and `quality` steps down further if the spatial view proves slow.
      const cap = lowPower ? 1.25 : 2, budget = lowPower ? 900000 : 2600000;
      const scale = Math.max(.6, Math.min(devicePixelRatio || 1, cap, Math.sqrt(budget / (w * h))) * quality);
      const resized = w !== width || h !== height || scale !== pixelRatio;
      if (resized) {
        width = w; height = h; pixelRatio = scale;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      }
      const view = state.view === 'spatial' ? 'spatial' : 'diagram';
      const switchingView = Boolean(renderedView && renderedView !== view);
      const switchingStep = Boolean(renderedStep && renderedStep !== state.stepId);
      const transition = !resized && (switchingView || (switchingStep && view !== 'spatial'));
      if (transition && canvas.width > 0 && canvas.height > 0) {
        if (!fadeCanvas) {
          fadeCanvas = document.createElement('canvas');
          fadeCanvas.className = 'scene-fade';
          fadeCanvas.setAttribute('aria-hidden', 'true');
          fadeCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;';
          canvas.after(fadeCanvas);
          fadeCtx = fadeCanvas.getContext('2d');
        }
        if (fadeCtx) {
          // WebGL's default drawing buffer may have been discarded between frames.
          // Repaint the outgoing canonical pose before taking the transition snapshot.
          const previous = scenes[renderedView];
          if (previous) renderer.render(previous.scene, previous.camera);
          fadeCanvas.width = canvas.width;
          fadeCanvas.height = canvas.height;
          fadeCtx.clearRect(0, 0, fadeCanvas.width, fadeCanvas.height);
          fadeCtx.drawImage(canvas, 0, 0);
        }
      }
      try {
        const api = view === 'spatial' ? window.ReaderSpatial : window.ReaderDiagram;
        const current = scenes[view] ??= api.create(THREE, window.ReaderTheme, renderer);
        if (view === 'spatial' && appliedSpatialQuality !== qualityTier) {
          current.setQuality?.(qualityTier); appliedSpatialQuality = qualityTier;
        }
        const started = performance.now();
        const snapCamera = view === 'spatial' && performance.now() >= settleUntil;
        const pinState = current.update({...state, reducedMotion: reduced.matches, snapCamera}, width / height, width);
        renderer.toneMappingExposure = current.exposure ?? 1;
        renderer.render(current.scene, current.camera);
        if (view === 'spatial') noteSpatialCost(performance.now() - started);
        frames++;
        calls = renderer.info.render.calls;
        viewport.dataset.render = 'ready';
        lastFrame = pinState.frame || null;
        current.camera.updateMatrixWorld();
        lastCameraPose = [...current.camera.matrixWorld.elements, ...current.camera.projectionMatrix.elements]
          .map(value => Math.round(value * 1e6) / 1e6);
        if (placePin(pinState, current.camera, width, height)) schedule();
      } catch (error) {
        fallback(error);
        return;
      }
      if (resized) {
        animation?.cancel();
        if (fadeCanvas) fadeCanvas.style.opacity = '0';
      }
      if (transition && fadeCanvas && fadeCanvas.animate) {
        animation?.cancel();
        fadeCanvas.style.opacity = '1';
        animation = fadeCanvas.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: reduced.matches ? 80 : switchingView ? 260 : 180,
          easing: 'cubic-bezier(.16, 1, .3, 1)'
        });
        animation.onfinish = () => { fadeCanvas.style.opacity = '0'; };
      }
      renderedView = view;
      renderedStep = state.stepId;
      // Keep drawing while the camera and layer fades glide to their new pose.
      if (view === 'spatial' && !reduced.matches && performance.now() < settleUntil) schedule();
    }

    // Spatial is the heavy view. Several slow draws in a row (a much lower bar on devices
    // that report little memory or few cores) tell the reader to fall back to the Diagram.
    const lowPower = navigator.connection?.saveData || navigator.deviceMemory <= 2 || navigator.hardwareConcurrency <= 2;
    qualityTier = lowPower ? 'low' : 'high';
    const SLOW_MS = lowPower ? 120 : 400, SLOW_RUN = 4;
    const SOFT_MS = lowPower ? 40 : 60, SOFT_RUN = 6, QUALITY_STEP = .2, QUALITY_MIN = .6;
    let slowDraws = 0, softDraws = 0;
    function noteSpatialCost(ms) {
      spatialFrameCosts.push(ms); if (spatialFrameCosts.length > 240) spatialFrameCosts.shift();
      // First remove expensive visual effects; only subsequent slow runs reduce resolution.
      softDraws = ms > SOFT_MS ? softDraws + 1 : 0;
      if (softDraws >= SOFT_RUN) {
        softDraws = 0;
        if (qualityTier === 'high') qualityTier = 'medium';
        else if (qualityTier === 'medium') { qualityTier = 'low'; quality = Math.min(quality, .85); }
        else quality = Math.max(QUALITY_MIN, quality - QUALITY_STEP);
        schedule();
      }
      slowDraws = ms > SLOW_MS ? slowDraws + 1 : 0;
      if (slowDraws >= SLOW_RUN) {
        slowDraws = 0;
        window.dispatchEvent(new Event('reader-spatial-slow'));
      }
    }

    function schedule() {
      if (!raf && renderer && state && !suspended && !lost && !failed) raf = requestAnimationFrame(draw);
    }

    const host = {
      update(next) {
        const settings = { ...next.settings };
        const key = [next.stepId, next.diagramPose, next.spatialBeat, next.localT, next.view, next.camera,
          next.opening, next.recap, next.present, next.overview, next.narrated, settings.cache, settings.kv, settings.effort].join('|');
        if (key === signature) return;
        signature = key;
        settleUntil = performance.now() + SETTLE_MS;
        state = { ...next, settings };
        schedule();
      },
      setRouting(k, bias) {
        scenes.spatial?.setRouting?.(k, bias);
        if (!suspended) schedule();
      },
      suspend() { suspended = true; cancel(); },
      resume() { suspended = false; schedule(); },
      resetPerformance() { spatialFrameCosts.length = 0; },
      stats() {
        const sorted = spatialFrameCosts.slice().sort((a, b) => a - b);
        const p95FrameMs = sorted.length ? sorted[Math.ceil(.95 * sorted.length) - 1] : 0;
        return { frames, calls, revision, lost, suspended, frame: lastFrame,
          qualityTier, pixelRatio, p95FrameMs, cameraPose: lastCameraPose, triangles: renderer?.info.render.triangles ?? 0,
          buffer: renderer ? [canvas.width, canvas.height] : [0, 0] };
      }
    };

    try {
      if (!viewport || !canvas) throw new Error('The reader figure canvas is missing.');
      hidePin();
      THREE = await window.ensureJourneyThree('160');
      revision = THREE.REVISION;
      renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, stencil: false, powerPreference: 'high-performance' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        lost = true;
        cancel();
        hidePin();
        viewport.dataset.render = 'lost';
        if (fallbackStatus) fallbackStatus.textContent = '3D view paused while graphics reset — restoring automatically…';
      });
      canvas.addEventListener('webglcontextrestored', () => {
        lost = false;
        scenes.spatial?.contextRestored?.(); appliedSpatialQuality = null;
        if (fallbackStatus) fallbackStatus.textContent = 'Lifecycle diagram';
        schedule();
      });
      new ResizeObserver(schedule).observe(viewport);
      reduced.addEventListener('change', () => {
        animation?.cancel();
        if (fadeCanvas) fadeCanvas.style.opacity = '0';
        schedule();
      });
      document.fonts?.ready.then(schedule);
      window.addEventListener('resize', schedule);
    } catch (error) {
      fallback(error);
    }
    return host;
  }

  window.ReaderScene = Object.freeze({ create });
})();
