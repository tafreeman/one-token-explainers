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
    const leader = document.getElementById('leader');
    const fallbackStatus = document.getElementById('fallback-status');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const scenes = {};
    let renderer, THREE, state, animation;
    let frames = 0, calls = 0, raf = 0, width = 0, height = 0, pixelRatio = 0;
    let revision = null, signature, renderedView;
    let lost = false, suspended = false, failed = false;

    function hidePin() {
      if (pin) pin.hidden = true;
      if (leader) leader.style.visibility = 'hidden';
    }

    function placePin({ anchor, label }, camera, w, h) {
      if (!pin || !leader || !label) {
        hidePin();
        return;
      }
      const point = anchor.clone().project(camera);
      const x = (point.x + 1) * w / 2;
      const y = (1 - point.y) * h / 2;
      if (point.z < -1 || point.z > 1 || x < 1 || x > w - 1 || y < 1 || y > h - 1) {
        hidePin();
        return;
      }
      pin.hidden = false;
      const text = pin.querySelector('[data-pin-text]') || pin;
      if (text.textContent !== label) text.textContent = label;
      pin.style.maxWidth = Math.max(24, Math.min(240, w - 24)) + 'px';
      const pw = pin.offsetWidth;
      const ph = pin.offsetHeight;
      const gap = 19;
      const left = Math.max(12, Math.min(w - pw - 12, x + gap + pw <= w - 12 ? x + gap : x - gap - pw));
      const top = Math.max(12, Math.min(h - ph - 12, y - ph - gap));
      pin.style.left = left + 'px';
      pin.style.top = top + 'px';
      leader.style.visibility = 'visible';
      leader.setAttribute('x1', x);
      leader.setAttribute('y1', y);
      leader.setAttribute('x2', Math.max(left, Math.min(left + pw, x)));
      leader.setAttribute('y2', Math.max(top, Math.min(top + ph, y)));
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
      if (renderedView && renderedView !== view && canvas.animate) {
        animation?.cancel();
        animation = canvas.animate([{ opacity: 0.42 }, { opacity: 1 }], {
          duration: reduced.matches ? 100 : 240,
          easing: 'cubic-bezier(.16, 1, .3, 1)'
        });
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
          next.opening, next.recap, next.present, settings.cache, settings.kv, settings.effort].join('|');
        if (key === signature) return;
        signature = key;
        state = { ...next, settings };
        schedule();
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
