/* The reader and the embedded Observatory have independent scene lifecycles. */
(function () {
  'use strict';

  const extraLabs = {
    'csa-hca-kv': ['attention', 'rope'],
    'prefill-decode': ['roof', 'cache']
  };
  const labNames = ['bpe', 'stream', 'attention', 'rope', 'kv', 'moe', 'cache', 'pd', 'roof', 'mix', 'kl'];

  function create({scene, asset, pause}) {
    const drawer = document.querySelector('#inspector');
    const lesson = document.querySelector('#lesson');
    const figure = document.querySelector('#figure');
    const mast = document.querySelector('.mast');
    const rail = document.querySelector('.rail');
    drawer.setAttribute('aria-labelledby', 'inspect-title');
    drawer.innerHTML = `
      <button type="button" class="inspect-back">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 10H3m6-6-6 6 6 6"/></svg>
        Back to lesson
      </button>
      <h2 id="inspect-title"></h2>
      <details class="inspect-cutaway">
        <summary>Explore the 3D cutaway</summary>
        <p class="inspect-status" role="status"></p>
        <div class="inspect-frame"></div>
      </details>
      <div class="inspect-labs"></div>
      <details class="inspect-more">
        <summary>More labs</summary>
        <div></div>
      </details>
      <nav aria-label="More views of this component" class="inspect-links"></nav>`;

    const back = drawer.querySelector('.inspect-back');
    const title = drawer.querySelector('h2');
    const cutaway = drawer.querySelector('.inspect-cutaway');
    const status = drawer.querySelector('.inspect-status');
    const frameHost = drawer.querySelector('.inspect-frame');
    const labs = drawer.querySelector('.inspect-labs');
    const more = drawer.querySelector('.inspect-more');
    const links = drawer.querySelector('.inspect-links');
    const frame = document.createElement('iframe');
    const compact = matchMedia('(max-width: 760px)');
    frame.tabIndex = 0;
    let concept, saved, engine, pending;
    let prefixHitRate, pdDisaggregated;
    let timeout;

    function sizeDrawer() {
      if (!saved) return;
      const box = lesson.getBoundingClientRect();
      if (figure) figure.inert = saved.figureInert || compact.matches;
      drawer.style.setProperty('--inspect-left', box.left + 'px');
      drawer.style.setProperty('--inspect-width', box.width + 'px');
      drawer.style.setProperty('--inspect-top', Math.max(0, mast.getBoundingClientRect().bottom) + 'px');
      const railTop = rail?.getBoundingClientRect().top || window.innerHeight;
      drawer.style.setProperty('--inspect-bottom', Math.max(0, window.innerHeight - railTop) + 'px');
    }

    function stopCutaway() {
      if (!pending && !engine) return;
      clearTimeout(timeout);
      pending = null;
      engine = null;
      frame.remove();
      frame.removeAttribute('src');
      scene.resume();
    }

    function startCutaway() {
      if (pending || engine) return;
      const target = concept;
      const request = {};
      pending = request;
      scene.suspend();
      status.textContent = 'Loading the 3D cutaway…';
      frame.title = target.label + ' 3D cutaway';
      const ids = target.obs;
      const realm = {TR: 'TRAINING', MD: 'MODEL', IN: 'INFERENCE'}[ids[0].split('-')[0]];
      const params = new URLSearchParams({
        embed: '1',
        reader: '1',
        skin: realm === 'MODEL' ? 'blueprint' : 'light',
        realm,
        focus: ids.join(',')
      });
      const readerParams = new URLSearchParams(location.search);
      for (const key of ['rm', 'quality', 'pr', 'aa', 'perf']) {
        if (readerParams.has(key)) params.set(key, readerParams.get(key));
      }
      function unavailable() {
        if (pending !== request) return;
        stopCutaway();
        status.textContent = 'The inline cutaway is unavailable. The labs and Observatory link are below.';
      }
      timeout = setTimeout(unavailable, 20000);
      frame.onload = async () => {
        try {
          const api = await window.journeyObservatory(frame, []);
          if (pending !== request) return;
          api.setPlaying(false);
          api.setControls(true);
          api.setLabels(true);
          api.setRouting(window.MicroLabs.routing.k, window.MicroLabs.routing.bias);
          if (prefixHitRate !== undefined) api.setPrefixCache(prefixHitRate);
          if (pdDisaggregated !== undefined) api.setPDDisagg(pdDisaggregated);
          engine = api;
          pending = null;
          clearTimeout(timeout);
          status.textContent = '';
        } catch {
          unavailable();
        }
      };
      frame.src = asset('../shared/obs-core.html?' + params);
      frameHost.append(frame);
    }

    function mountLabs(target) {
      const primary = [target.lab, ...(extraLabs[target.slug] || [])];
      prefixHitRate = pdDisaggregated = undefined;
      const options = {
        onRoute: (k, bias) => engine?.setRouting(k, bias),
        onPrefixCache: ratio => {
          prefixHitRate = ratio;
          engine?.setPrefixCache(ratio);
        },
        onPDDisagg: on => {
          pdDisaggregated = on;
          engine?.setPDDisagg(on);
        }
      };
      labs.replaceChildren();
      const otherLabs = more.querySelector('div');
      otherLabs.replaceChildren();
      window.MicroLabs.dock(labs, primary, options);
      window.MicroLabs.dock(otherLabs, labNames.filter(name => !primary.includes(name)), options);
      labs.querySelector('details').open = true;
      const steering = document.createElement('details');
      steering.className = 'micro-lab inspect-steering';
      steering.dataset.lab = 'steer';
      const summary = document.createElement('summary');
      summary.textContent = 'Try causal feature steering';
      steering.append(summary);
      steering.addEventListener('toggle', () => {
        if (!steering.open || steering.children.length > 1) return;
        steering.append(JourneyMath.vectorDrawer().querySelector('.steer-section'));
      });
      (target.slug === 'mhc-residual' ? labs : otherLabs).append(steering);
    }

    function mountLinks(target) {
      links.replaceChildren();
      for (const key of ['story', 'tour', 'obs']) {
        const link = document.createElement('a');
        link.textContent = window.SuiteLinks.PAGES[key].name;
        link.href = asset(window.SuiteLinks.urlFor(key, target.slug));
        links.append(link);
      }
    }

    function open(slug, trigger) {
      const target = window.SuiteLinks.resolve(slug);
      if (!target) return;
      if (!saved) {
        saved = {
          trigger: trigger || document.activeElement,
          x: window.scrollX,
          y: window.scrollY,
          overflow: document.documentElement.style.overflow,
          inert: lesson.inert,
          figureInert: figure?.inert
        };
        document.documentElement.style.overflow = 'hidden';
        lesson.inert = true;
        drawer.hidden = false;
        document.body.dataset.inspect = 'open';
      }
      stopCutaway();
      pause();
      concept = target;
      title.textContent = target.label;
      cutaway.open = more.open = false;
      status.textContent = '';
      mountLabs(target);
      mountLinks(target);
      sizeDrawer();
      drawer.scrollTop = 0;
      back.focus({preventScroll: true});
    }

    function close() {
      if (!saved) return;
      const previous = saved;
      saved = null;
      stopCutaway();
      cutaway.open = false;
      drawer.hidden = true;
      delete document.body.dataset.inspect;
      lesson.inert = previous.inert;
      if (figure) figure.inert = previous.figureInert;
      document.documentElement.style.overflow = previous.overflow;
      window.scrollTo({left: previous.x, top: previous.y, behavior: 'instant'});
      const trigger = previous.trigger;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus({preventScroll: true});
    }

    back.addEventListener('click', close);
    cutaway.addEventListener('toggle', () => {
      if (saved && cutaway.open) startCutaway();
      else stopCutaway();
    });
    window.addEventListener('keydown', event => {
      if (!saved || event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }, true);
    window.journeyFrameKeys(frame, key => {
      if (key === 'Escape' && frame.isConnected) close();
    });
    const observer = new ResizeObserver(sizeDrawer);
    for (const el of [lesson, mast, rail]) if (el) observer.observe(el);
    window.addEventListener('resize', sizeDrawer);

    return {open, close, get isOpen() { return !!saved; }};
  }

  window.ReaderInspector = Object.freeze({create});
})();
