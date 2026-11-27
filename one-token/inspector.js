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
      <div class="inspect-bar">
        <button type="button" class="inspect-back" aria-label="Back to lesson">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 10H3m6-6-6 6 6 6"/></svg>
          Back to lesson
        </button>
        <button type="button" class="inspect-expand" aria-pressed="false" hidden>Expand cutaway</button>
      </div>
      <h2 id="inspect-title"></h2>
      <p class="inspect-lesson"></p>
      <details class="inspect-cutaway">
        <summary>Zoom into 3D Observatory cutaway</summary>
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
    const expand = drawer.querySelector('.inspect-expand');
    const lessonNote = drawer.querySelector('.inspect-lesson');
    const title = drawer.querySelector('h2');
    const cutaway = drawer.querySelector('.inspect-cutaway');
    const status = drawer.querySelector('.inspect-status');
    const frameHost = drawer.querySelector('.inspect-frame');
    const labs = drawer.querySelector('.inspect-labs');
    const more = drawer.querySelector('.inspect-more');
    const links = drawer.querySelector('.inspect-links');
    const frame = document.createElement('iframe');
    frame.tabIndex = 0;
    let concept, saved, engine, pending, expanded = false;
    let prefixHitRate, pdDisaggregated;
    let timeout;

    // Phones: the figure (and so the 3D model) keeps its frame; the drawer becomes a
    // sheet that fills only the space the figure leaves free. Portrait stacks it below
    // the figure; a landscape phone in Present docks it in the explanation column.
    const stackedQuery = matchMedia('(max-width: 767px), (max-width: 1023px) and (orientation: portrait)');
    const sideQuery = matchMedia('(max-height: 500px) and (orientation: landscape)');

    function sheetRegion() {
      const mastBottom = Math.max(0, mast.getBoundingClientRect().bottom);
      const railTop = rail?.getBoundingClientRect().top || window.innerHeight;
      const present = document.body.dataset.mode === 'present';
      const bay = document.getElementById('explanation-bay')?.getBoundingClientRect();
      if (stackedQuery.matches && figure) {
        const top = present && bay?.height ? bay.top : figure.getBoundingClientRect().bottom;
        return {left: 0, width: window.innerWidth, top: Math.max(mastBottom, top), railTop, kind: 'stacked'};
      }
      if (sideQuery.matches && present && bay?.width) {
        return {left: bay.left, width: window.innerWidth - bay.left, top: mastBottom, railTop, kind: 'side'};
      }
      return null;
    }

    function sizeDrawer() {
      if (!saved) return;
      const region = sheetRegion();
      const box = lesson.getBoundingClientRect();
      if (figure) figure.inert = saved.figureInert;
      const railTop = rail?.getBoundingClientRect().top || window.innerHeight;
      const top = region ? region.top : Math.max(0, mast.getBoundingClientRect().bottom);
      drawer.style.setProperty('--inspect-left', (region ? region.left : box.left) + 'px');
      drawer.style.setProperty('--inspect-width', (region ? region.width : box.width) + 'px');
      drawer.style.setProperty('--inspect-top', top + 'px');
      drawer.style.setProperty('--inspect-bottom', Math.max(0, window.innerHeight - railTop) + 'px');
      if (region) {
        drawer.dataset.sheet = region.kind;
        if (expanded) { expanded = false; drawer.dataset.expanded = 'false'; expand.setAttribute('aria-pressed', 'false'); expand.textContent = 'Expand cutaway'; }
      } else delete drawer.dataset.sheet;
      // The expanded cutaway takes the figure stage on wide screens; sheets never cover the model.
      const stage = figure ? figure.getBoundingClientRect() : {left: 0, top, width: window.innerWidth, height: railTop - top};
      drawer.style.setProperty('--stage-left', stage.left + 'px');
      drawer.style.setProperty('--stage-top', stage.top + 'px');
      drawer.style.setProperty('--stage-width', stage.width + 'px');
      drawer.style.setProperty('--stage-height', stage.height + 'px');
    }

    function setExpanded(on) {
      if (on && drawer.dataset.sheet) on = false;
      expanded = on;
      drawer.dataset.expanded = String(on);
      expand.setAttribute('aria-pressed', String(on));
      expand.textContent = on ? 'Shrink cutaway' : 'Expand cutaway';
      sizeDrawer();
    }

    function stopCutaway() {
      if (!pending && !engine) return;
      clearTimeout(timeout);
      pending = null;
      engine = null;
      frame.remove();
      frame.removeAttribute('src');
      expand.hidden = true;
      setExpanded(false);
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
        skin: 'light',
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
      expand.hidden = false;
      setExpanded(!drawer.dataset.sheet);
    }

    function mountLabs(target) {
      const primary = [target.lab, ...(extraLabs[target.slug] || [])];
      prefixHitRate = pdDisaggregated = undefined;
      const options = {
        onRoute: (k, bias) => {
          scene.setRouting?.(k, bias);
          engine?.setRouting(k, bias);
        },
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
      const stage = Number(target.step.split('.')[0]);
      const available = stage < 4 ? ['bpe'] : stage < 6 ? ['bpe', 'kl'] : labNames;
      window.MicroLabs.dock(otherLabs, available.filter(name => !primary.includes(name)), options);
      window.LearningPanels.openLabs(labs);
      window.LearningPanels.openLabs(otherLabs);
      const steering = document.createElement('details');
      steering.className = 'micro-lab inspect-steering';
      steering.dataset.lab = 'steer';
      const summary = document.createElement('summary');
      summary.textContent = 'Try causal feature steering & logit lens';
      steering.append(summary);
      steering.addEventListener('toggle', () => {
        if (!steering.open || steering.children.length > 1) return;
        const vDrawer = JourneyMath.vectorDrawer();
        const lens = vDrawer.querySelector('.lens-slider')?.closest('section');
        for (const section of [lens, vDrawer.querySelector('.steer-section')].filter(Boolean)) {
          steering.append(section);
        }
      });
      if (stage >= 7) {
        (target.slug === 'mhc-residual' ? labs : otherLabs).append(steering);
        steering.open = true;
      }
      more.hidden = !otherLabs.children.length;
    }

    function mountLinks(target) {
      links.replaceChildren();
      const stepId = document.body.dataset.step || '';
      const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (const key of ['story', 'tour', 'obs']) {
        const link = document.createElement('a');
        link.textContent = window.SuiteLinks.PAGES[key].name;
        link.href = asset(window.SuiteLinks.urlFor(key, target.slug, {
          from: 'reader',
          pos: stepId,
          label: stepId ? 'Step ' + stepId : '',
          rm
        }));
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
          figureInert: figure?.inert,
          mastInert: mast?.inert,
          railInert: rail?.inert
        };
        document.documentElement.style.overflow = 'hidden';
        lesson.inert = true;
        if (mast) mast.inert = true;
        if (rail) rail.inert = true;
        drawer.hidden = false;
        document.body.dataset.inspect = 'open';
      }
      stopCutaway();
      pause();
      concept = target;
      title.textContent = target.label;
      const map = window.ConceptMap;
      lessonNote.textContent = 'Lesson ' + target.step + ' · Observatory: ' + target.obs.map(code => map.componentLabel(code, {tag: false})).join(', ');
      cutaway.open = more.open = true;
      status.textContent = '';
      mountLabs(target);
      mountLinks(target);
      sizeDrawer();
      startCutaway();
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
      if (mast) mast.inert = previous.mastInert;
      if (rail) rail.inert = previous.railInert;
      document.documentElement.style.overflow = previous.overflow;
      window.scrollTo({left: previous.x, top: previous.y, behavior: 'instant'});
      const trigger = previous.trigger;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus({preventScroll: true});
    }

    back.addEventListener('click', close);
    expand.addEventListener('click', () => setExpanded(!expanded));
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
    for (const el of [lesson, mast, rail, figure]) if (el) observer.observe(el);
    window.addEventListener('resize', sizeDrawer);
    window.LearningPanels.watchLabs(drawer);

    return {open, close, get isOpen() { return !!saved; }};
  }

  window.ReaderInspector = Object.freeze({create});
})();
