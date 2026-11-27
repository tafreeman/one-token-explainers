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
    const leaderDot = document.getElementById('leader-dot');
    const fallbackStatus = document.getElementById('fallback-status');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const scenes = {};
    let renderer, THREE, state, animation, fadeCanvas, fadeCtx;
    let moving = false, snapNext = false;
    let quality = 1, qualityTier = 'high', appliedSpatialQuality = null, primePending = null;
    let frames = 0, calls = 0, raf = 0, width = 0, height = 0, pixelRatio = 0;
    const spatialFrameCosts = [];
    let revision = null, signature, renderedView, renderedStep;
    let lastFrame = null, lastCameraPose = null;
    let lost = false, suspended = false, failed = false;

    const PIN_STAY = 12, PIN_STAY_FLIGHT = 90, PIN_GLIDE_MS = 260, PIN_FADE_MS = 160;
    let pinSide = -1, pinShown = null, pinFrom = null, pinStart = 0, pinLabel = '';

    function forgetPin() { pinSide = -1; pinShown = null; pinFrom = null; }

    function hidePin() {
      forgetPin();
      if (pin) pin.hidden = true;
      if (mobilePin) mobilePin.textContent = '';
      if (leader) leader.style.visibility = 'hidden';
      if (leaderDot) leaderDot.style.visibility = 'hidden';
    }

    function placePin({ anchor, label, tokenAnchor, tokenRadius = 0, moving = false }, camera, w, h) {
      if (mobilePin) {
        mobilePin.textContent = label && label !== '“ Paris”' ? '· ' + label : '';
      }
      if (!pin || !leader || !label) {
        forgetPin();
        if (pin) pin.hidden = true;
        if (leader) leader.style.visibility = 'hidden';
        if (leaderDot) leaderDot.style.visibility = 'hidden';
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
        if (leaderDot) leaderDot.style.visibility = 'hidden';
        return;
      }
      pin.hidden = false;
      const text = pin.querySelector('[data-pin-text]') || pin;
      if (text.textContent !== label) text.textContent = label;
      // The same callout keeps its side through a camera flight; it may re-seat once the shot lands.
      const stay = moving && pinLabel === label ? PIN_STAY_FLIGHT : PIN_STAY;
      if (pinLabel !== label) {
        // New label: a short fade says "this is a different callout" without moving anything.
        if (pinLabel && !reduced.matches && pin.animate) pin.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PIN_FADE_MS, easing: 'cubic-bezier(.16, 1, .3, 1)' });
        forgetPin();
        pinLabel = label;
      }
      pin.style.maxWidth = Math.max(24, Math.min(240, w - 24)) + 'px';
      const pw = pin.offsetWidth;
      const ph = pin.offsetHeight;
      if (!pw || !ph) {
        leader.style.visibility = 'hidden';
        if (leaderDot) leaderDot.style.visibility = 'hidden';
        return;
      }
      const gap = 26;
      const pad = 12;
      // Favor a short local leader so the label reads with its active part.
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
      // Clear larger projected tokens with local alternatives, not corners.
      if (tokenRect) candidates.push(
        [x - pw / 2, tokenRect.top - ph - pad],
        [tokenRect.right + pad, y - ph / 2],
        [tokenRect.left - pw - pad, y - ph / 2],
        [x - pw / 2, tokenRect.bottom + pad]
      );
      const overlapsToken = (l, t) => tokenRect &&
        l < tokenRect.right && l + pw > tokenRect.left && t < tokenRect.bottom && t + ph > tokenRect.top;
      let best = candidates[0], bestScore = -1e9, bestIndex = 0;
      for (const [index, [rawL, rawT]] of candidates.entries()) {
        const cl = Math.max(pad, Math.min(w - pw - pad, rawL));
        const ct = Math.max(pad, Math.min(h - ph - pad, rawT));
        const clampPenalty = Math.abs(cl - rawL) + Math.abs(ct - rawT);
        const endX = Math.max(cl, Math.min(cl + pw, x));
        const endY = Math.max(ct, Math.min(ct + ph, y));
        const length = Math.hypot(endX - x, endY - y);
        const overlapsAnchor = (x >= cl - 8 && x <= cl + pw + 8 && y >= ct - 8 && y <= ct + ph + 8) ? 500 : 0;
        const topBias = ct + ph <= y ? 10 : 0;
        // A clear box can still send its leader across the travelling token.
        // Ignore a leader that starts inside the token's projected area.
        let crossesToken = false;
        if (tokenRect && !(x >= tokenRect.left && x <= tokenRect.right && y >= tokenRect.top && y <= tokenRect.bottom)) {
          let enter = 0, exit = 1;
          for (const [start, delta, min, max] of [
            [x, endX - x, tokenRect.left, tokenRect.right],
            [y, endY - y, tokenRect.top, tokenRect.bottom]
          ]) {
            if (Math.abs(delta) < .001) {
              if (start < min || start > max) { exit = -1; break; }
            } else {
              const a = (min - start) / delta, b = (max - start) / delta;
              enter = Math.max(enter, Math.min(a, b));
              exit = Math.min(exit, Math.max(a, b));
            }
          }
          crossesToken = enter <= exit;
        }
        // Hysteresis: the current side wins near-ties, so the label stops hopping across the anchor.
        const score = topBias - length - clampPenalty * 2 - overlapsAnchor -
          (overlapsToken(cl, ct) ? 10000 : 0) - (crossesToken ? 250 : 0) + (index === pinSide ? stay : 0);
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
      // Text and viewport dimensions can change during an active glide.
      left = Math.max(pad, Math.min(w - pw - pad, left));
      top = Math.max(pad, Math.min(h - ph - pad, top));
      // Skirt around the travelling token during a glide instead of aborting to a 200px jump.
      if (overlapsToken(left, top) && !overlapsToken(best[0], best[1])) {
        if (gliding) {
          const pushes = [
            [left, tokenRect.top - ph],
            [left, tokenRect.bottom],
            [tokenRect.left - pw, top],
            [tokenRect.right, top]
          ].map(([nx, ny]) => [Math.max(pad, Math.min(w - pw - pad, nx)), Math.max(pad, Math.min(h - ph - pad, ny))])
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
      pin.style.left = Math.round(left) + 'px';
      pin.style.top = Math.round(top) + 'px';
      if (pin.dataset) pin.dataset.intersectsToken = String(Boolean(tokenRect &&
        left < tokenRect.right && left + pw > tokenRect.left && top < tokenRect.bottom && top + ph > tokenRect.top));
      leader.style.visibility = 'visible';
      leader.setAttribute('x1', x.toFixed(1));
      leader.setAttribute('y1', y.toFixed(1));
      leader.setAttribute('x2', Math.max(left, Math.min(left + pw, x)).toFixed(1));
      leader.setAttribute('y2', Math.max(top, Math.min(top + ph, y)).toFixed(1));
      if (leaderDot) {
        leaderDot.style.visibility = 'visible';
        leaderDot.setAttribute('cx', x.toFixed(1));
        leaderDot.setAttribute('cy', y.toFixed(1));
      }
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

    function withAllRenderable(current, fn) {
      const changed = [];
      current.scene.traverse(object => {
        const range = object.geometry?.drawRange;
        const zeroRange = range && range.count === 0;
        const zeroInst = object.isInstancedMesh && object.count === 0;
        if (!object.visible || object.frustumCulled || zeroRange || zeroInst) {
          changed.push([object, object.visible, object.frustumCulled,
            zeroRange ? range.count : null, zeroInst ? object.count : null]);
          object.visible = true;
          object.frustumCulled = false;
          if (zeroRange) {
            const avail = object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0;
            if (avail > 0) object.geometry.setDrawRange(range.start, Math.min(3, avail));
          }
          if (zeroInst) object.count = 1;
        }
      });
      try { return fn(); }
      finally {
        for (const [object, visible, culled, rangeCount, instCount] of changed) {
          object.visible = visible;
          object.frustumCulled = culled;
          if (rangeCount !== null) object.geometry.setDrawRange(object.geometry.drawRange.start, rangeCount);
          if (instCount !== null) object.count = instCount;
        }
      }
    }

    // Compile every program the spatial hall can show (hidden stages included) in the
    // background, so a stage's first appearance mid-scroll doesn't stall a frame and the
    // camera doesn't jump to catch up. Skip software CPU rasterizers (SwiftShader/WARP),
    // where compiling all hidden stages upfront saturates CPU worker threads.
    function warmShaders(current) {
      if (software || !renderer.compileAsync || !current.scene || !current.camera) return;
      const prior = renderer.toneMapping;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      try {
        withAllRenderable(current, () => renderer.compileAsync(current.scene, current.camera)).then(() => {
          if (scenes.spatial !== current) return;
          primePending = current;
          if (renderedView === 'spatial' && !suspended && !lost && !failed && !document.hidden) primeDraw(current);
        }).catch(() => {});
      } catch {}
      renderer.toneMapping = prior;
    }
    // ANGLE on D3D11 finishes each pipeline on its first real draw, in the GPU process, where
    // compileAsync can't reach. Draw every object into a 1x1 non-clearing scissor so D3D11
    // builds every PSO and uploads geometry/textures without shading millions of fragments.
    function primeDraw(current) {
      primePending = null;
      const prior = [renderer.toneMapping, renderer.toneMappingExposure, renderer.autoClear, renderer.getScissorTest()];
      const vp = new THREE.Vector4(), sc = new THREE.Vector4();
      renderer.getViewport(vp); renderer.getScissor(sc);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = current.exposure ?? 1;
      renderer.autoClear = false;
      renderer.setViewport(0, 0, 1, 1);
      renderer.setScissor(0, 0, 1, 1);
      renderer.setScissorTest(true);
      try { withAllRenderable(current, () => renderer.render(current.scene, current.camera)); } catch {}
      finally {
        renderer.setViewport(vp);
        renderer.setScissor(sc);
        renderer.setScissorTest(prior[3]);
        renderer.autoClear = prior[2];
        renderer.toneMapping = prior[0];
        renderer.toneMappingExposure = prior[1];
      }
    }

    function draw() {
      raf = 0;
      if (suspended || document.hidden || lost || !renderer || !state) return;
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      if (!w || !h) return;
      // Sharp on HiDPI without paying for it everywhere: the cap and pixel budget are lower on weak
      // devices or CPU fallback rasterizers, and `quality` steps down further if spatial proves slow.
      const cap = (lowPower || cpuDriver) ? 1 : (software ? 1.25 : 2);
      const budget = (lowPower || cpuDriver) ? 900000 : (software ? 1200000 : 2600000);
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
      // Diagram cuts crossfade (a far step or a change of shot); a short move between
      // neighbouring steps glides instead.
      const diagramScene = view !== 'spatial' ? scenes[view] : null;
      const diagramCut = view !== 'spatial'
        && (diagramScene?.cuts?.({...state, reducedMotion: reduced.matches, snapCamera: snapNext}) ?? true);
      const shotChange = Boolean(renderedView && diagramScene?.shotChanges?.(state));
      const transition = !resized && (switchingView || ((switchingStep || shotChange) && diagramCut));
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
          if (previous) {
            renderer.toneMapping = renderedView === 'spatial' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
            renderer.toneMappingExposure = renderedView === 'spatial' ? (previous.exposure ?? 1) : 1;
            renderer.render(previous.scene, previous.camera);
          }
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
          warmShaders(current);
        }
        if (view === 'spatial' && primePending === current) primeDraw(current);
        const started = performance.now();
        // A representation returns at the current stop, never from its stale hidden camera.
        const snapCamera = switchingView || resized || snapNext;
        const pinState = current.update({...state, reducedMotion: reduced.matches, snapCamera}, width / height, width);
        snapNext = false;
        moving = Boolean(pinState.moving);
        renderer.toneMapping = view === 'spatial' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        renderer.toneMappingExposure = view === 'spatial' ? (current.exposure ?? 1) : 1;
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
      // The scene owns convergence; no timed final snap interrupts a camera flight.
      if (moving && !reduced.matches) schedule();
    }

    // Spatial is the heavy view. Several slow draws in a row (a much lower bar on devices
    // that report little memory or few cores) tell the reader to fall back to the Diagram.
    const qualityParam = new URLSearchParams(location.search).get('quality');
    const lowPower = navigator.connection?.saveData || navigator.deviceMemory <= 2 || navigator.hardwareConcurrency <= 2;
    let software = false, cpuDriver = false;
    qualityTier = qualityParam === 'high' ? 'high' : (qualityParam === 'low' || lowPower) ? 'low' : 'high';
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
      if (!raf && renderer && state && !suspended && !document.hidden && !lost && !failed) raf = requestAnimationFrame(draw);
    }

    const host = {
      update(next) {
        const settings = { ...next.settings };
        const key = [next.stepId, next.diagramPose, next.spatialBeat, next.localT, next.view, next.camera,
          next.opening, next.recap, next.present, next.overview, next.narrated, settings.cache, settings.kv, settings.effort].join('|');
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
      resume() { suspended = false; snapNext = true; schedule(); },
      resetPerformance() { spatialFrameCosts.length = 0; },
      stats() {
        const sorted = spatialFrameCosts.slice().sort((a, b) => a - b);
        const p95FrameMs = sorted.length ? sorted[Math.ceil(.95 * sorted.length) - 1] : 0;
        // step/view name what the last frame actually drew, which can trail the page's step.
        return { frames, calls, revision, lost, suspended, moving, step: renderedStep ?? null, view: renderedView ?? null, frame: lastFrame,
          qualityTier, pixelRatio, p95FrameMs, cameraPose: lastCameraPose, triangles: renderer?.info.render.triangles ?? 0,
          buffer: renderer ? [canvas.width, canvas.height] : [0, 0] };
      }
    };

    try {
      if (!viewport || !canvas) throw new Error('The reader figure canvas is missing.');
      hidePin();
      THREE = await window.ensureJourneyThree('160');
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
      renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: !software && !lowPower, stencil: false, powerPreference: 'high-performance' });
      renderer.userData = { software, cpuDriver };
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
        snapNext = true;
        width = 0; height = 0; pixelRatio = 0;
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
      document.addEventListener('visibilitychange', () => {
        // Visibility and Inspector suspension are independent. Audio may continue offscreen.
        if (document.hidden) { cancel(); animation?.cancel(); if (fadeCanvas) fadeCanvas.style.opacity = '0'; }
        else { snapNext = true; schedule(); }
      });
    } catch (error) {
      fallback(error);
    }
    return host;
  }

  window.ReaderScene = Object.freeze({ create });
})();
