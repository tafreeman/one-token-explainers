/* Local assets for the matching stops in Journey Story and Guided Tour. */
const JourneyMath = (() => {
  'use strict';

  // DeepSeek-V4 technical report §2.4, Eq. 28. On singular values the matrix
  // iteration reduces to a scalar polynomial. Show the direction before RMS rescaling.
  function muonSpectrum(input) {
    const norm = Math.hypot(...input);
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

  function vectorDrawer() {
    const drawer = document.createElement('details');
    drawer.className = 'component-math vector-drawer';
    drawer.innerHTML = `
      <summary>Inside the 7,168-Dim Streams</summary>
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
          <h4>Illustrative logit lens</h4>
          <p>After “The cat”, combine the four mHC streams at the current layer, read the result through the final normalization and vocabulary head, then apply softmax. These probabilities are a constructed example.</p>
          <label class="lens-slider">Layer <span data-layer>1</span> of 61
            <input type="range" min="1" max="61" step="1" value="1" aria-label="Illustrative logit lens layer">
          </label>
          <div class="math-controls" role="group" aria-label="Jump to layer">
            ${[1, 16, 38, 61].map(n => `<button type="button" data-layer-jump="${n}">L${n}</button>`).join('')}
          </div>
          <div class="lens-probabilities">
            ${['sat', 'is', 'was', 'ran', 'Other tokens'].map(token => `
              <div class="lens-probability"><span>${token}</span><span class="lens-track" aria-hidden="true"><i></i></span><span data-percent></span></div>`).join('')}
          </div>
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
    const rows = drawer.querySelectorAll('.lens-probability');
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
      range.value = layer;
      range.setAttribute('aria-valuetext', `Layer ${layer} of 61, illustrative probability of sat ${percentages[0]} percent`);
      drawer.querySelector('[data-layer]').textContent = layer;
      jumps.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.layerJump) === layer)));
    }
    range.addEventListener('input', () => render(range.valueAsNumber));
    jumps.forEach(b => b.addEventListener('click', () => render(Number(b.dataset.layerJump))));
    render(1);
    return drawer;
  }

  return {optimizer, vectorDrawer};
})();
