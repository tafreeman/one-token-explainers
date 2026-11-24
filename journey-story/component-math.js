/* Local assets for the matching stops in Journey Story and Guided Tour. */
const JourneyMath = (() => {
  'use strict';

  // DeepSeek-V4 technical report §2.4, Eq. 28. On singular values the matrix
  // iteration reduces to a scalar polynomial. Show the direction before RMS rescaling.
  function muonSpectrum(input) {
    const norm = Math.hypot(...input);
    if (!norm) return input.map(() => 0);
    return input.map(value => {
      let s = value / norm;
      for (let i = 0; i < 10; i++) {
        const [a, b, c] = i < 8 ? [3.4445, -4.7750, 2.0315] : [2, -1.5, 0.5];
        s *= a + s * s * (b + c * s * s);
      }
      return s;
    });
  }

  function bars(chart, values) {
    values.forEach((value, i) => {
      const bar = chart.children[i];
      const height = value * 30;
      bar.setAttribute('y', 54 - height);
      bar.setAttribute('height', height);
    });
  }

  function barMarks(count, start, gap) {
    return Array.from({length: count}, (_, i) =>
      `<rect x="${start + gap * i}" width="9" rx="1.5"/>`).join('');
  }

  function optimizer() {
    const panel = document.createElement('section');
    panel.className = 'component-math optimizer';
    panel.setAttribute('aria-label', 'Muon and AdamW optimizer comparison');
    panel.innerHTML = `
      <div class="math-controls" role="group" aria-label="Compare optimizer updates">
        <button type="button" data-mode="raw">Raw gradient</button>
        <button type="button" data-mode="step">After update</button>
      </div>
      <div class="optimizer-pair">
        <figure>
          <figcaption><b>Muon</b>Hidden 2D weight matrices</figcaption>
          <svg viewBox="0 0 144 64" aria-hidden="true">
            <circle class="math-guide" cx="25" cy="34" r="15"/>
            <ellipse cx="25" cy="34" rx="15" ry="15"/>
            <path class="math-guide" d="M50 24H142"/>
            <text x="52" y="19">σ = 1</text>
            <g data-spectrum>${barMarks(5, 60, 16)}</g>
            <path class="math-axis" d="M50 54H142"/>
          </svg>
          <small>Five singular values</small>
        </figure>
        <figure>
          <figcaption><b>AdamW</b>Embeddings, LM head, RMSNorm gains</figcaption>
          <svg viewBox="0 0 144 64" aria-hidden="true">
            <g data-coordinates>${barMarks(6, 12, 22)}</g>
            <path class="math-axis" d="M4 54H140"/>
          </svg>
          <small>Six coordinate magnitudes</small>
        </figure>
      </div>
      <p class="math-caption" aria-live="polite"></p>
      <small>Illustrative inputs · <a href="https://arxiv.org/html/2606.19348v1#S2.SS4">DeepSeek-V4 report §2.4</a></small>`;

    // A first-step matrix direction proportional to G. The ellipse shows the
    // cross-section along its strongest and weakest singular directions.
    const raw = [1.45, 0.82, 0.48, 0.27, 0.14];
    const orthogonal = muonSpectrum(raw);
    const gradient = [1.42, 0.32, 1.24, 0.21, 1.09, 0.48];
    const moment = [0.7, 0.28, 0.62, 0.26, 0.81, 0.36];
    const rms = [1.18, 0.40, 0.96, 0.55, 0.88, 0.48];
    const scaled = moment.map((m, i) => m / (rms[i] + 1e-8));
    const buttons = panel.querySelectorAll('button');
    const ellipse = panel.querySelector('ellipse');
    function render(mode) {
      const after = mode === 'step';
      const spectrum = after ? orthogonal : raw;
      bars(panel.querySelector('[data-spectrum]'), spectrum);
      bars(panel.querySelector('[data-coordinates]'), after ? scaled : gradient);
      ellipse.setAttribute('rx', 15 * spectrum[0]);
      ellipse.setAttribute('ry', 15 * spectrum[spectrum.length - 1]);
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      panel.querySelector('.math-caption').textContent = after
        ? 'Muon’s Newton–Schulz step brings the momentum update’s singular values near 1. AdamW scales each coordinate by its own gradient history, m̂ₖ / (√v̂ₖ + ε), before applying the step and weight decay.'
        : 'One matrix direction dominates the raw gradient, stretching the circle into an ellipse. Each AdamW bar shows the gradient magnitude of a single parameter.';
    }
    buttons.forEach(b => b.addEventListener('click', () => render(b.dataset.mode)));
    render('step');
    return panel;
  }

  // Illustrative 24-channel sampled activation slice of h in R^7168 across layers 1..61.
  function activationSlice(layer) {
    const t = Math.max(0, Math.min(1, (layer - 1) / 60));
    return Array.from({length: 24}, (_, i) => {
      const early = Math.sin(i * 1.17 + 0.4) * 0.48 + Math.cos(i * 0.53) * 0.22;
      const late = Math.cos(i * 0.85 - 1.1) * 0.65 + (i % 5 === 0 ? 0.32 : -0.18);
      return Number(Math.max(-1, Math.min(1, early * (1 - t) + late * t)).toFixed(3));
    });
  }

  // Illustrative toy attribution graph inspired by Circuit Tracer (not measured DeepSeek-V4-Pro weights).
  const STEER_STATES = {
    natural: {
      caption: 'Natural pass: “Eiffel Tower” activates “Paris”, which drives “France” as the top next token.',
      edges: { ep: 0.92, pf: 0.88, pi: 0.10 },
      nodes: { eiffel: 'on', paris: 'on', france: 'on', italy: 'dim' },
      probs: [['France', 78], ['Paris', 12], ['Europe', 6], ['Other', 4]]
    },
    ablate: {
      caption: 'Ablate “Paris” (0×): severing the intermediate city feature collapses “France” from 78% → 24%.',
      edges: { ep: 0.16, pf: 0.12, pi: 0.10 },
      nodes: { eiffel: 'on', paris: 'off', france: 'dim', italy: 'dim' },
      probs: [['tower', 28], ['France', 24], ['Europe', 16], ['Other', 32]]
    },
    swap: {
      caption: 'Clamp “Paris” → “Rome”: redirecting the mid-layer city concept flips the output from “France” to “Italy” (74%).',
      edges: { ep: 0.72, pf: 0.14, pi: 0.94 },
      nodes: { eiffel: 'on', paris: 'swap', france: 'dim', italy: 'on' },
      probs: [['Italy', 74], ['France', 11], ['Europe', 8], ['Other', 7]]
    },
    amplify: {
      caption: 'Amplify “France” (2×): boosting the late country feature concentrates probability on “France” (93%).',
      edges: { ep: 0.92, pf: 1.0, pi: 0.06 },
      nodes: { eiffel: 'on', paris: 'on', france: 'boost', italy: 'dim' },
      probs: [['France', 93], ['Paris', 3], ['Europe', 2], ['Other', 2]]
    }
  };

  function steerCircuit(mode = 'natural') {
    const key = Object.hasOwn(STEER_STATES, mode) ? mode : 'natural';
    const s = STEER_STATES[key];
    return { mode: key, caption: s.caption, edges: { ...s.edges }, nodes: { ...s.nodes }, probs: s.probs.map(([tok, pct]) => ({ token: tok, pct })) };
  }

  function vectorDrawer() {
    const drawer = document.createElement('details');
    drawer.className = 'component-math vector-drawer';
    drawer.innerHTML = `
      <summary>Inside the 7,168-Dim Streams</summary>
      <p>Generic interpretability schematics. No DeepSeek-V4-Pro activations or circuits are measured here.</p>
      <div class="vector-sections">
        <section>
          <h4>Linear representation &amp; superposition</h4>
          <svg viewBox="0 0 282 96" role="img" aria-label="Two active feature directions add to h, one of the token’s four 7,168-dimensional mHC residual streams. Dashed directions are inactive in this example.">
            <g transform="translate(63 76)" fill="none" stroke="currentColor">
              <path class="math-guide" d="M-46 -22L0 0L-30 15 M0 0L13 -66"/>
              <path class="math-guide" d="M58 -10L38 -55L-20 -45"/>
              <path class="vector-first" d="M0 0L58 -10l-6 -2m6 2l-5 4"/>
              <path class="vector-second" d="M0 0L-20 -45l-1 7m1 -7l6 4"/>
              <path stroke-width="2.5" d="M0 0L38 -55l-7 3m7 -3l-1 7"/>
            </g>
            <text x="106" y="22">h</text>
            <text x="15" y="27">a₂d₂</text><text x="122" y="70">a₁d₁</text>
            <text x="167" y="43">h ≈ Σᵢ aᵢdᵢ</text>
            <text x="167" y="64">h ∈ ℝ⁷¹⁶⁸</text>
          </svg>
          <p>The token travels as four 7,168-wide mHC streams. In this 2D projection of one stream, h, two active features add their directions. Sparse activity lets more than 7,168 possible features share its 7,168 coordinates, with some interference.</p>
        </section>
        <section>
          <h4>A two-layer induction head circuit</h4>
          <svg viewBox="0 0 282 88" role="img" aria-label="A previous-token head writes A at B’s position. At the repeated A, an induction head retrieves B from that position and promotes B as the next token.">
            <g fill="none" stroke-width="2">
              <path class="vector-first" d="M21 46Q42 11 64 44l-6 -2m6 2l1 -7"/>
              <path class="vector-second" d="M76 44Q122 -17 169 44l-7 -3m7 3l-1 -7"/>
              <path stroke="currentColor" d="M194 56h29l-6 -4m6 4l-6 4"/>
            </g>
            <g text-anchor="middle">
              <text x="20" y="62">[A]</text><text x="70" y="62">[B]</text>
              <text x="121" y="62">…</text><text x="175" y="62">[A]</text>
              <text x="248" y="62">[B]</text><text x="248" y="82">next</text>
              <text x="43" y="27">A</text><text x="123" y="13">B</text>
            </g>
          </svg>
          <p>An earlier head writes a trace of A at B’s position. When A appears again, a later head matches that trace and copies information about B, raising B’s next-token score.</p>
        </section>
        <section>
          <h4>Illustrative logit lens &amp; activation slice</h4>
          <p>After “The cat”, combine the four mHC streams at the current layer, read the result through the final normalization and vocabulary head, then apply softmax. Both the 24-channel slice and probabilities are constructed examples.</p>
          <label class="lens-slider">Layer <span data-layer>1</span> of 61
            <input type="range" min="1" max="61" step="1" value="1" aria-label="Illustrative logit lens layer">
          </label>
          <div class="math-controls" role="group" aria-label="Jump to layer">
            ${[1, 16, 38, 61].map(n => `<button type="button" data-layer-jump="${n}">L${n}</button>`).join('')}
          </div>
          <svg class="act-strip" viewBox="0 0 282 44" role="img" aria-label="Illustrative 24-channel sampled activation fingerprint of the residual vector">
            <line class="math-axis" x1="10" y1="22" x2="272" y2="22"/>
            <g data-act-bars>${Array.from({length: 24}, (_, i) => `<rect x="${12 + i * 10.8}" y="22" width="7.4" height="0" rx="1"/>`).join('')}</g>
            <text x="12" y="42" class="act-lbl">d₀</text>
            <text x="141" y="42" text-anchor="middle" class="act-lbl">sampled h ∈ ℝ⁷¹⁶⁸</text>
            <text x="270" y="42" text-anchor="end" class="act-lbl">d₇₁₆₇</text>
          </svg>
          <div class="lens-probabilities" data-lens-probs>
            ${['sat', 'is', 'was', 'ran', 'Other tokens'].map(token => `
              <div class="lens-probability"><span>${token}</span><span class="lens-track" aria-hidden="true"><i></i></span><span data-percent></span></div>`).join('')}
          </div>
        </section>
        <section class="steer-section">
          <h4>Causal feature steering (illustrative)</h4>
          <p>Prompt: “The Eiffel Tower is in …”. Clamp a feature node in this illustrative attribution graph to watch downstream next-token probabilities shift live (inspired by Circuit Tracer; not measured DeepSeek-V4-Pro weights).</p>
          <svg class="steer-svg" viewBox="0 0 296 108" role="img" aria-label="Illustrative causal feature steering graph connecting Eiffel Tower through Paris to France or Italy">
            <g class="steer-cols">
              <line class="math-guide" x1="48" y1="14" x2="48" y2="96"/>
              <line class="math-guide" x1="154" y1="14" x2="154" y2="96"/>
              <line class="math-guide" x1="250" y1="14" x2="250" y2="96"/>
              <text x="48" y="10" text-anchor="middle">L8</text>
              <text x="154" y="10" text-anchor="middle">L26</text>
              <text x="250" y="10" text-anchor="middle">L48 → Out</text>
            </g>
            <g fill="none" stroke-linecap="round">
              <path data-edge="ep" d="M92 52 C108 52 108 38 122 38"/>
              <path data-edge="pf" d="M186 38 C200 38 204 38 216 38"/>
              <path data-edge="pi" d="M186 42 C202 46 202 76 216 76"/>
            </g>
            <g class="steer-node" data-node="eiffel" transform="translate(2,38)">
              <rect width="90" height="28" rx="4"/><text x="45" y="17" text-anchor="middle">Eiffel Tower</text>
            </g>
            <g class="steer-node" data-node="paris" transform="translate(122,24)">
              <rect width="64" height="28" rx="4"/><text x="32" y="17" text-anchor="middle" data-paris-lbl>Paris</text>
            </g>
            <g class="steer-node" data-node="france" transform="translate(216,24)">
              <rect width="68" height="28" rx="4"/><text x="34" y="17" text-anchor="middle">France</text>
            </g>
            <g class="steer-node" data-node="italy" transform="translate(216,62)">
              <rect width="68" height="28" rx="4"/><text x="34" y="17" text-anchor="middle">Italy</text>
            </g>
          </svg>
          <div class="math-controls" role="group" aria-label="Causal feature clamping interventions">
            <button type="button" data-steer="natural">Natural</button>
            <button type="button" data-steer="ablate">Ablate “Paris”</button>
            <button type="button" data-steer="swap">Clamp → “Rome”</button>
            <button type="button" data-steer="amplify">Boost “France” 2×</button>
          </div>
          <div class="lens-probabilities" data-steer-probs>
            ${[0, 1, 2, 3].map(() => `
              <div class="lens-probability"><span data-tok></span><span class="lens-track" aria-hidden="true"><i></i></span><span data-percent></span></div>`).join('')}
          </div>
          <p class="math-caption" data-steer-caption aria-live="polite"></p>
        </section>
      </div>`;

    // Interpolate illustrative probabilities for four tokens. All omitted
    // vocabulary entries share the remainder, including after display rounding.
    const anchors = [
      {layer: 1, values: [6, 14, 11, 5]},
      {layer: 16, values: [17, 21, 16, 8]},
      {layer: 38, values: [41, 19, 14, 6]},
      {layer: 61, values: [64, 12, 9, 4]},
    ];
    const range = drawer.querySelector('input');
    const rows = drawer.querySelectorAll('[data-lens-probs] .lens-probability');
    const actBars = drawer.querySelectorAll('[data-act-bars] rect');
    const jumps = drawer.querySelectorAll('[data-layer-jump]');
    function render(layer) {
      const end = anchors.findIndex((a, i) => i > 0 && layer <= a.layer);
      const left = anchors[end - 1], right = anchors[end];
      const t = (layer - left.layer) / (right.layer - left.layer);
      const percentages = left.values.map((p, i) => Math.round(p + t * (right.values[i] - p)));
      percentages.push(100 - percentages.reduce((sum, p) => sum + p, 0));
      rows.forEach((row, i) => {
        row.querySelector('i').style.width = percentages[i] + '%';
        row.querySelector('[data-percent]').textContent = percentages[i] + '%';
      });
      activationSlice(layer).forEach((v, i) => {
        const bar = actBars[i];
        const h = Math.max(1.5, Math.abs(v) * 16);
        bar.setAttribute('y', (v >= 0 ? 22 - h : 22).toFixed(1));
        bar.setAttribute('height', h.toFixed(1));
        bar.setAttribute('class', v >= 0 ? 'act-pos' : 'act-neg');
      });
      range.value = layer;
      range.setAttribute('aria-valuetext', `Layer ${layer} of 61, illustrative probability of sat ${percentages[0]} percent`);
      drawer.querySelector('[data-layer]').textContent = layer;
      jumps.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.layerJump) === layer)));
    }
    range.addEventListener('input', () => render(range.valueAsNumber));
    jumps.forEach(b => b.addEventListener('click', () => render(Number(b.dataset.layerJump))));
    render(1);

    const circuit = drawer.querySelector('.steer-section');
    const steerBtns = circuit.querySelectorAll('[data-steer]');
    const steerRows = circuit.querySelectorAll('[data-steer-probs] .lens-probability');
    const steerCap = circuit.querySelector('[data-steer-caption]');
    const parisLbl = circuit.querySelector('[data-paris-lbl]');
    function renderSteer(mode) {
      const s = steerCircuit(mode);
      steerBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.steer === s.mode)));
      for (const [key, w] of Object.entries(s.edges)) {
        const edge = circuit.querySelector(`[data-edge="${key}"]`);
        if (!edge) continue;
        edge.setAttribute('stroke-width', (1.1 + w * 2.4).toFixed(2));
        edge.setAttribute('opacity', (0.2 + w * 0.8).toFixed(2));
        edge.dataset.active = String(w > 0.5);
      }
      for (const [key, st] of Object.entries(s.nodes)) {
        const node = circuit.querySelector(`[data-node="${key}"]`);
        if (node) node.dataset.state = st;
      }
      if (parisLbl) parisLbl.textContent = s.mode === 'swap' ? 'Rome*' : (s.mode === 'ablate' ? 'Paris ×' : 'Paris');
      s.probs.forEach(({token, pct}, i) => {
        const row = steerRows[i];
        row.querySelector('[data-tok]').textContent = token;
        row.querySelector('i').style.width = pct + '%';
        row.querySelector('[data-percent]').textContent = pct + '%';
      });
      steerCap.textContent = s.caption;
    }
    steerBtns.forEach(b => b.addEventListener('click', () => renderSteer(b.dataset.steer)));
    circuit.querySelector('[data-node="paris"]')?.addEventListener('click', () => renderSteer(
      circuit.querySelector('[data-steer="ablate"]').getAttribute('aria-pressed') === 'true' ? 'swap' : 'ablate'
    ));
    circuit.querySelector('[data-node="france"]')?.addEventListener('click', () => renderSteer('amplify'));
    circuit.querySelector('[data-node="eiffel"]')?.addEventListener('click', () => renderSteer('natural'));
    circuit.querySelector('[data-node="italy"]')?.addEventListener('click', () => renderSteer('swap'));
    renderSteer('natural');
    return drawer;
  }

  const api = {optimizer, vectorDrawer, activationSlice, steerCircuit, muonSpectrum};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
