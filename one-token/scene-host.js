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
    let renderer, THREE, state, animation, fadeCanvas, fadeCtx;
    let frames = 0, calls = 0, raf = 0, width = 0, height = 0, pixelRatio = 0;
    let revision = null, signature, renderedView;
    let lost = false, suspended = false, failed = false;

    function hidePin() {
      if (pin) pin.hidden = true;
      if (mobilePin) mobilePin.textContent = '';
      if (leader) leader.style.visibility = 'hidden';
    }

    function placePin({ anchor, label }, camera, w, h) {
      if (mobilePin) {
        mobilePin.textContent = label && label !== '“ Paris”' ? '· ' + label : '';
      }
      if (!pin || !leader || !label) {
        if (pin) pin.hidden = true;
        if (leader) leader.style.visibility = 'hidden';
        return;
      }
      const point = anchor.clone().project(camera);
      const x = (point.x + 1) * w / 2;
      const y = (1 - point.y) * h / 2;
      if (point.z < -1 || point.z > 1 || x < 1 || x > w - 1 || y < 1 || y > h - 1) {
        pin.hidden = true;
        leader.style.visibility = 'hidden';
        return;
      }
      pin.hidden = false;
      const text = pin.querySelector('[data-pin-text]') || pin;
      if (text.textContent !== label) text.textContent = label;
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
        [x - gap - pw, y + gap]
      ];
      let best = candidates[0], bestScore = -1e9;
      for (const [rawL, rawT] of candidates) {
        const cl = Math.max(pad, Math.min(w - pw - pad, rawL));
        const ct = Math.max(pad, Math.min(h - ph - pad, rawT));
        const clampPenalty = Math.abs(cl - rawL) + Math.abs(ct - rawT);
        const bx = cl + pw / 2, by = ct + ph / 2;
        const distFromCenter = Math.hypot((bx - cx) / Math.max(1, w), (by - cy) / Math.max(1, h)) * 120;
        const overlapsAnchor = (x >= cl - 8 && x <= cl + pw + 8 && y >= ct - 8 && y <= ct + ph + 8) ? 500 : 0;
        const topBias = rawT < y ? 14 : 0;
        const score = distFromCenter + topBias - clampPenalty * 2.4 - overlapsAnchor;
        if (score > bestScore) {
          bestScore = score;
          best = [cl, ct];
        }
      }
      const [left, top] = best;
      pin.style.left = Math.round(left) + 'px';
      pin.style.top = Math.round(top) + 'px';
      leader.style.visibility = 'visible';
      leader.setAttribute('x1', x.toFixed(1));
      leader.setAttribute('y1', y.toFixed(1));
      leader.setAttribute('x2', Math.max(left, Math.min(left + pw, x)).toFixed(1));
      leader.setAttribute('y2', Math.max(top, Math.min(top + ph, y)).toFixed(1));
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
      const scale = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1600000 / (w * h)));
      if (w !== width || h !== height || scale !== pixelRatio) {
        width = w; height = h; pixelRatio = scale;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      }
      const view = state.view === 'spatial' ? 'spatial' : 'diagram';
      const switchingView = Boolean(renderedView && renderedView !== view);
      if (switchingView && canvas.width > 0 && canvas.height > 0) {
        if (!fadeCanvas) {
          fadeCanvas = document.createElement('canvas');
          fadeCanvas.className = 'scene-fade';
          fadeCanvas.setAttribute('aria-hidden', 'true');
          fadeCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;';
          canvas.after(fadeCanvas);
          fadeCtx = fadeCanvas.getContext('2d');
        }
        if (fadeCtx) {
          fadeCanvas.width = canvas.width;
          fadeCanvas.height = canvas.height;
          fadeCtx.clearRect(0, 0, fadeCanvas.width, fadeCanvas.height);
          fadeCtx.drawImage(canvas, 0, 0);
        }
      }
      try {
        const api = view === 'spatial' ? window.ReaderSpatial : window.ReaderDiagram;
        const current = scenes[view] ??= api.create(THREE, window.ReaderTheme, renderer);
        const pinState = current.update(state, width / height, width);
        renderer.render(current.scene, current.camera);
        frames++;
        calls = renderer.info.render.calls;
        viewport.dataset.render = 'ready';
        placePin(pinState, current.camera, width, height);
      } catch (error) {
        fallback(error);
        return;
      }
      if (switchingView && fadeCanvas && fadeCanvas.animate) {
        animation?.cancel();
        fadeCanvas.style.opacity = '1';
        animation = fadeCanvas.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: reduced.matches ? 90 : 260,
          easing: 'cubic-bezier(.16, 1, .3, 1)'
        });
        animation.onfinish = () => { fadeCanvas.style.opacity = '0'; };
      }
      renderedView = view;
    }

    function schedule() {
      if (!raf && renderer && state && !suspended && !lost && !failed) raf = requestAnimationFrame(draw);
    }

    const host = {
      update(next) {
        const settings = { ...next.settings };
        const key = [next.stepId, next.diagramPose, next.spatialBeat, next.localT, next.view, next.camera,
          next.opening, next.recap, next.present, next.overview, settings.cache, settings.kv, settings.effort].join('|');
        if (key === signature) return;
        signature = key;
        state = { ...next, settings };
        schedule();
      },
      setRouting(k, bias) {
        scenes.spatial?.setRouting?.(k, bias);
        if (!suspended) schedule();
      },
      suspend() { suspended = true; cancel(); },
      resume() { suspended = false; schedule(); },
      stats() { return { frames, calls, revision, lost, suspended }; }
    };

    try {
      if (!viewport || !canvas) throw new Error('The reader figure canvas is missing.');
      hidePin();
      THREE = await window.ensureJourneyThree('160');
      revision = THREE.REVISION;
      renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
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
        if (fallbackStatus) fallbackStatus.textContent = 'Lifecycle diagram';
        schedule();
      });
      new ResizeObserver(schedule).observe(viewport);
      document.fonts?.ready.then(schedule);
      window.addEventListener('resize', schedule);
    } catch (error) {
      fallback(error);
    }
    return host;
  }

  window.ReaderScene = Object.freeze({ create });
})();
