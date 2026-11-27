/* Expanded lessons, interactive math graphics, and release-to-inference handover
   shared only by the Journey (index.html) and 12-Stage Reader (one-token/index.html). */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text != null && text !== '') node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  function svg(tag, attrs, parent, text) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text != null) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  }

  function pulseValues(scope) {
    if (!scope) return;
    const targets = scope.querySelectorAll('output, .ml-value, .ml-readout, [data-percent], [data-layer], .learning-equation strong, [data-math-val]');
    targets.forEach(node => {
      node.dataset.changed = 'true';
      clearTimeout(node._pulseTimer);
      node._pulseTimer = setTimeout(() => { delete node.dataset.changed; }, 320);
    });
  }

  function bindValueFeedback(root) {
    if (!root || root.dataset.learningFeedback) return;
    root.dataset.learningFeedback = 'true';
    const trigger = event => {
      const container = event.target?.closest?.('.micro-lab, .component-math, .effort, .learning-handover');
      if (container) pulseValues(container);
    };
    root.addEventListener('input', trigger);
    root.addEventListener('change', trigger);
    root.addEventListener('click', event => {
      if (event.target?.closest?.('button:not(.learning-toggle)')) trigger(event);
    });
  }

  function openLabs(root) {
    root.querySelectorAll('details.micro-lab, details.component-math, details.ml-trace').forEach(lab => {
      // Initialize once: a learner's later collapse must survive layout updates.
      if (lab.dataset.learningReady) return;
      lab.dataset.learningReady = 'true';
      lab.open = true;
    });
  }

  function watchLabs(root) {
    if (!root) return;
    if (root.tagName === 'MAIN' && root.querySelector('#ch1')) {
      document.documentElement.classList.add('learning-journey');
      const mast = document.querySelector('.studio-bar');
      if (mast) {
        const sizeMast = () => document.documentElement.style.setProperty('--learning-mast-height', mast.getBoundingClientRect().height + 'px');
        new ResizeObserver(sizeMast).observe(mast);
        sizeMast();
      }
    }
    openLabs(root);
    bindValueFeedback(root);
    const observer = new MutationObserver(records => {
      if (records.some(record => record.addedNodes.length)) openLabs(root);
    });
    observer.observe(root, {childList: true, subtree: true});
  }

  function card(step, host = step) {
    if (host.querySelector(':scope > .learning-toggle')) return;
    const button = el('button', 'Collapse section', 'learning-toggle');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'true');
    button.addEventListener('click', () => {
      const collapsed = step.dataset.collapsed !== 'true';
      step.dataset.collapsed = String(collapsed);
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? 'Expand section' : 'Collapse section';
      window.__tokenJourney?.layout();
      window.dispatchEvent(new Event('resize'));
    });
    host.querySelector('h3')?.after(button);
    host.classList.add('learning-card');
  }

  /* ---------- Interactive Math Labs ---------- */

  function lossLab(token) {
    const lab = el('details', null, 'micro-lab learning-loss');
    lab.dataset.lab = 'training-loss';
    lab.open = true;
    lab.append(el('summary', 'Try it · make the correct token less surprising'));
    const body = el('div', null, 'ml-body');
    body.append(el('p', 'Move the probability assigned to “' + token + '”. Watch surprise L = −ln(p) and the downward gradient push 1 − p respond together.'));

    const presets = el('div', null, 'learning-presets');
    for (const [lbl, val] of [['Early · 5%', '5'], ['Mid · 25%', '25'], ['Half · 50%', '50'], ['Trained · 90%', '90']]) {
      const b = el('button', lbl, 'learning-chip');
      b.type = 'button';
      b.dataset.preset = val;
      presets.append(b);
    }

    const label = el('label', 'Probability of training target ', 'learning-slider');
    const input = el('input');
    Object.assign(input, {type: 'range', min: '1', max: '99', value: '25', step: '1'});
    input.setAttribute('aria-label', 'Probability of ' + token + ' in percent');
    const output = el('output');
    label.append(input, output);

    const plot = document.createElementNS(NS, 'svg');
    Object.entries({
      viewBox: '0 0 380 204',
      role: 'img',
      'aria-label': 'Cross-entropy loss decreases as the correct token becomes more probable.'
    }).forEach(([k, v]) => plot.setAttribute(k, v));

    svg('path', {d: 'M42 18V162H272', class: 'learning-axis'}, plot);
    [1, 2, 3, 4].forEach(n => {
      svg('path', {d: `M42 ${162 - n * 30}H272`, class: 'learning-grid'}, plot);
      svg('text', {x: 28, y: 166 - n * 30, 'text-anchor': 'end'}, plot, String(n));
    });
    const pts = Array.from({length: 99}, (_, i) => {
      const p = (i + 1) / 100;
      return [(42 + p * 226).toFixed(2), (162 + Math.log(p) * 30).toFixed(2)];
    });
    const curve = pts.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ');
    const area = svg('path', {class: 'learning-area'}, plot);
    svg('path', {d: curve, class: 'learning-curve'}, plot);
    svg('text', {x: 42, y: 184}, plot, '0');
    svg('text', {x: 155, y: 184, 'text-anchor': 'middle'}, plot, 'p(target)');
    svg('text', {x: 268, y: 184, 'text-anchor': 'end'}, plot, '1');
    svg('text', {x: 46, y: 15}, plot, 'loss (nats)');

    // Side gauge: target share p vs gradient push (1 - p)
    svg('line', {x1: 288, y1: 18, x2: 288, y2: 162, class: 'learning-grid'}, plot);
    svg('text', {x: 300, y: 30}, plot, 'p(target)');
    svg('rect', {x: 300, y: 36, width: 68, height: 11, rx: 3, class: 'learning-meter-bg'}, plot);
    const pFill = svg('rect', {x: 300, y: 36, width: 17, height: 11, rx: 3, class: 'learning-meter-val'}, plot);
    const pTxt = svg('text', {x: 300, y: 61, class: 'learning-svg-val'}, plot);

    svg('text', {x: 300, y: 92}, plot, '|∂L/∂z| push');
    svg('rect', {x: 300, y: 98, width: 68, height: 11, rx: 3, class: 'learning-meter-bg'}, plot);
    const gFill = svg('rect', {x: 300, y: 98, width: 51, height: 11, rx: 3, class: 'learning-meter-tok'}, plot);
    const gTxt = svg('text', {x: 300, y: 123, class: 'learning-svg-tok'}, plot);
    svg('text', {x: 300, y: 152, class: 'learning-svg-muted'}, plot, 'grad ↓ Δθ');

    const guide = svg('path', {class: 'learning-guide'}, plot);
    const dot = svg('circle', {r: 6.5, class: 'learning-dot'}, plot);

    const equation = el('p', null, 'learning-equation');
    const probability = el('strong'), loss = el('strong');
    equation.append('L = −ln(', probability, ') = ', loss, ' nats');

    const note = el('p', 'Illustrative probabilities; one target position, without the auxiliary MTP loss.', 'learning-note');
    const source = el('a', 'Cross-entropy definition');
    source.href = 'https://docs.pytorch.org/docs/stable/generated/torch.nn.CrossEntropyLoss.html';
    note.append(' ', source);

    function update() {
      const raw = Math.max(1, Math.min(99, Number(input.value) || 25));
      const p = raw / 100, value = -Math.log(p), grad = 1 - p;
      output.value = raw + '%';
      probability.textContent = p.toFixed(2);
      loss.textContent = value.toFixed(3);
      const x = 42 + p * 226, y = Math.max(20, 162 - value * 30);
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', y.toFixed(2));
      guide.setAttribute('d', `M42 ${y.toFixed(2)}H${x.toFixed(2)}V162`);
      const sub = pts.slice(0, raw).map(([px, py], i) => (i ? 'L' : 'M') + px + ' ' + py).join(' ');
      area.setAttribute('d', `${sub} L${x.toFixed(2)} 162 L42 162 Z`);
      pFill.setAttribute('width', (68 * p).toFixed(1));
      gFill.setAttribute('width', (68 * grad).toFixed(1));
      pTxt.textContent = (100 * p).toFixed(0) + '% mass';
      gTxt.textContent = '−' + grad.toFixed(2) + ' step';
      presets.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === String(raw))));
      plot.setAttribute('aria-label', `Probability ${raw} percent; loss ${value.toFixed(3)} nats; logit gradient magnitude ${grad.toFixed(2)}.`);
    }
    presets.addEventListener('click', e => {
      const b = e.target.closest('button[data-preset]');
      if (!b) return;
      input.value = b.dataset.preset;
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    input.addEventListener('input', update);
    update();
    body.append(presets, label, plot, equation, note);
    lab.append(body);
    return lab;
  }

  function dedupeLab(token) {
    const lab = el('details', null, 'micro-lab learning-dedupe');
    lab.dataset.lab = 'dedupe-math';
    lab.open = true;
    lab.append(el('summary', 'Try it · tune the MinHash near-duplicate sieve'));
    const body = el('div', null, 'ml-body');
    const ctl = el('label', 'Jaccard shingle threshold τ ', 'learning-slider');
    const input = Object.assign(el('input'), {type: 'range', min: '50', max: '95', value: '80', step: '5'});
    input.setAttribute('aria-label', 'MinHash Jaccard similarity threshold in percent');
    const out = el('output');
    ctl.append(input, out);

    const docs = [
      {name: 'book passage', sim: 12, hasTok: true},
      {name: 'scraped mirror', sim: 92, hasTok: true},
      {name: 'code repo', sim: 18, hasTok: false},
      {name: 'repost copy', sim: 84, hasTok: true},
      {name: 'math paper', sim: 25, hasTok: false},
      {name: 'template clone', sim: 68, hasTok: false}
    ];
    const fig = document.createElementNS(NS, 'svg');
    Object.entries({viewBox: '0 0 380 128', role: 'img', 'aria-label': 'MinHash deduplication sieve filtering near-duplicate documents'}).forEach(([k, v]) => fig.setAttribute(k, v));
    svg('rect', {x: 174, y: 12, width: 10, height: 84, rx: 3, class: 'learning-sieve'}, fig);
    svg('path', {d: 'M184 82 L236 112 H306', class: 'learning-chute'}, fig);
    svg('text', {x: 179, y: 10, 'text-anchor': 'middle'}, fig, 'LSH sieve');
    svg('text', {x: 312, y: 115, class: 'learning-svg-tok'}, fig, 'dropped');
    svg('text', {x: 372, y: 22, 'text-anchor': 'end', class: 'learning-svg-res'}, fig, 'training mix');

    const rows = docs.map((d, i) => {
      const y = 18 + i * 15;
      const g = svg('g', {}, fig);
      const pill = svg('rect', {x: 8, y, width: 112, height: 12, rx: 3, class: 'learning-doc'}, g);
      svg('text', {x: 14, y: y + 9.5}, g, d.name);
      const simTxt = svg('text', {x: 166, y: y + 9.5, 'text-anchor': 'end'}, g, (d.sim / 100).toFixed(2));
      const path = svg('path', {fill: 'none', 'stroke-width': 1.8}, g);
      return {d, y, pill, simTxt, path};
    });
    const readout = el('p', null, 'learning-equation learning-eq-compact');
    const keptVal = el('strong'), dropVal = el('strong');
    readout.append('kept ', keptVal, ' unique · dropped ', dropVal, ' near-duplicates');
    const note = el('p', 'Illustrative 6-document batch carrying “' + token + '”. Lowering τ drops looser paraphrases; raising τ keeps closer copies.', 'learning-note');

    function update() {
      const tau = Number(input.value);
      out.value = (tau / 100).toFixed(2);
      let kept = 0, dropped = 0;
      rows.forEach(({d, y, pill, path}) => {
        const isDup = d.sim >= tau;
        if (isDup) dropped++; else kept++;
        pill.setAttribute('class', isDup ? 'learning-doc is-dup' : 'learning-doc is-kept');
        path.setAttribute('class', isDup ? 'learning-ray-drop' : 'learning-ray-keep');
        path.setAttribute('d', isDup
          ? `M122 ${y + 6} H178 L232 108`
          : `M122 ${y + 6} H286`);
      });
      keptVal.textContent = kept + '/6';
      dropVal.textContent = dropped + '/6';
    }
    input.addEventListener('input', update);
    update();
    body.append(ctl, fig, readout, note);
    lab.append(body);
    return lab;
  }

  function yarnLab() {
    const lab = el('details', null, 'micro-lab learning-yarn');
    lab.dataset.lab = 'yarn-context';
    lab.open = true;
    lab.append(el('summary', 'Try it · stretch rotary context with YaRN'));
    const body = el('div', null, 'ml-body');
    const scales = [1, 2, 4, 8, 16];
    const ctl = el('label', 'Extension factor s ', 'learning-slider');
    const input = Object.assign(el('input'), {type: 'range', min: '0', max: '4', value: '4', step: '1'});
    input.setAttribute('aria-label', 'YaRN context extension scale factor');
    const out = el('output');
    ctl.append(input, out);

    const fig = document.createElementNS(NS, 'svg');
    Object.entries({viewBox: '0 0 380 108', role: 'img', 'aria-label': 'YaRN rotary wavelength scaling from 65,536 to 1,048,576 tokens'}).forEach(([k, v]) => fig.setAttribute(k, v));
    svg('rect', {x: 16, y: 22, width: 348, height: 14, rx: 4, class: 'learning-meter-bg'}, fig);
    const bar = svg('rect', {x: 16, y: 22, width: 348, height: 14, rx: 4, class: 'learning-meter-val'}, fig);
    svg('line', {x1: 38, y1: 18, x2: 38, y2: 40, class: 'learning-guide'}, fig);
    svg('text', {x: 16, y: 15}, fig, '65,536 base');
    const endTxt = svg('text', {x: 364, y: 15, 'text-anchor': 'end', class: 'learning-svg-val'}, fig);
    const wave = svg('path', {class: 'learning-curve'}, fig);
    svg('text', {x: 16, y: 98, class: 'learning-svg-muted'}, fig, 'rescaled low-frequency RoPE phase');

    const eq = el('p', null, 'learning-equation learning-eq-compact');
    const scaleEl = el('strong'), totalEl = el('strong');
    eq.append('65,536 × ', scaleEl, ' = ', totalEl, ' positions');
    const note = el('p', 'Illustrative rotary curve; DeepSeek-V4-Pro extends 65,536 × 16 to 1,048,576 tokens.', 'learning-note');

    function update() {
      const s = scales[Number(input.value)] || 16;
      const total = 65536 * s;
      out.value = '×' + s;
      scaleEl.textContent = String(s);
      totalEl.textContent = total.toLocaleString('en-US');
      const w = 22 + (326 * Math.log2(s)) / 4;
      bar.setAttribute('width', w.toFixed(1));
      endTxt.textContent = total.toLocaleString('en-US') + ' max';
      let d = '';
      for (let i = 0; i <= 64; i++) {
        const u = i / 64, x = 16 + u * 348;
        const freq = (6.5 / Math.sqrt(s)) * Math.PI * 2;
        const y = 68 - Math.sin(u * freq) * 16;
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      wave.setAttribute('d', d);
    }
    input.addEventListener('input', update);
    update();
    body.append(ctl, fig, eq, note);
    lab.append(body);
    return lab;
  }

  function grpoLab() {
    const lab = el('details', null, 'micro-lab learning-grpo');
    lab.dataset.lab = 'grpo-math';
    lab.open = true;
    lab.append(el('summary', 'Try it · grade a group of 8 attempts (GRPO)'));
    const body = el('div', null, 'ml-body');
    body.append(el('p', 'Click any attempt to flip its verifier reward (1 = pass, 0 = fail). GRPO normalizes against the group mean—no separate critic model needed.'));
    const scores = [0, 1, 0, 1, 0, 0, 1, 0];
    const toggles = el('div', null, 'learning-presets');
    const btns = scores.map((s, i) => {
      const b = el('button', `#${i + 1}: ${s ? '✓ 1' : '× 0'}`, 'learning-chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(Boolean(s)));
      b.addEventListener('click', () => {
        scores[i] = scores[i] ? 0 : 1;
        update();
      });
      toggles.append(b);
      return b;
    });

    const fig = document.createElementNS(NS, 'svg');
    Object.entries({viewBox: '0 0 380 142', role: 'img', 'aria-label': 'Signed group-relative advantage bars across eight attempts'}).forEach(([k, v]) => fig.setAttribute(k, v));
    svg('line', {x1: 210, y1: 10, x2: 210, y2: 134, class: 'learning-guide'}, fig);
    svg('text', {x: 210, y: 9, 'text-anchor': 'middle'}, fig, 'mean μ (A = 0)');
    const bars = scores.map((_, i) => {
      const y = 16 + i * 14.5;
      svg('text', {x: 12, y: y + 9}, fig, 'attempt ' + (i + 1));
      const rTxt = svg('text', {x: 96, y: y + 9, 'text-anchor': 'middle'}, fig);
      const rect = svg('rect', {x: 210, y: y + 1, width: 1, height: 9, rx: 2}, fig);
      const aTxt = svg('text', {x: 368, y: y + 9, 'text-anchor': 'end'}, fig);
      return {rTxt, rect, aTxt};
    });

    const eq = el('p', null, 'learning-equation learning-eq-compact');
    const muEl = el('strong'), posEl = el('strong');
    eq.append('μ = ', muEl, ' · winning Aᵢ = ', posEl);
    const note = el('p', 'Illustrative binary rewards with ε_std = 1e−4; when every attempt gets the same score, all advantages become 0.00.', 'learning-note');

    function update() {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
      const std = Math.sqrt(variance);
      let winAdv = '0.00';
      scores.forEach((s, i) => {
        btns[i].textContent = `#${i + 1}: ${s ? '✓ 1' : '× 0'}`;
        btns[i].setAttribute('aria-pressed', String(Boolean(s)));
        const adv = std < 1e-6 ? 0 : (s - mean) / (std + 1e-4);
        if (s === 1 && std >= 1e-6) winAdv = '+' + adv.toFixed(2);
        const w = Math.max(1.5, Math.min(92, Math.abs(adv) * 44));
        bars[i].rTxt.textContent = 'r=' + s;
        bars[i].rect.setAttribute('x', (adv >= 0 ? 210 : 210 - w).toFixed(1));
        bars[i].rect.setAttribute('width', w.toFixed(1));
        bars[i].rect.setAttribute('class', adv > 0.01 ? 'learning-meter-res' : adv < -0.01 ? 'learning-meter-tok' : 'learning-meter-bg');
        bars[i].aTxt.textContent = (adv > 0.005 ? '+' : '') + adv.toFixed(2);
      });
      muEl.textContent = mean.toFixed(2);
      posEl.textContent = winAdv;
    }
    update();
    body.append(toggles, fig, eq, note);
    lab.append(body);
    return lab;
  }

  function samplerLab(token) {
    const lab = el('details', null, 'micro-lab learning-sampler');
    lab.dataset.lab = 'sampler-math';
    lab.open = true;
    lab.append(el('summary', 'Try it · reshape next-token probabilities before sampling'));
    const body = el('div', null, 'ml-body');
    const ctl = el('label', 'Distribution spread scale ', 'learning-slider');
    const input = Object.assign(el('input'), {type: 'range', min: '4', max: '16', value: '10', step: '1'});
    input.setAttribute('aria-label', 'Illustrative softmax spread scale');
    const out = el('output');
    ctl.append(input, out);

    const items = token === 'sat'
      ? [[' on', 2.4], [' down', 1.5], [' still', 1.0], [' quietly', 0.6], [' other', 0.2]]
      : [['Paris', 2.5], ['Lyon', 1.2], ['Nice', 0.8], ['Rome', 0.4], ['other', 0.1]];
    const fig = document.createElementNS(NS, 'svg');
    Object.entries({viewBox: '0 0 380 116', role: 'img', 'aria-label': 'Normalized next-token probability distribution'}).forEach(([k, v]) => fig.setAttribute(k, v));
    const rows = items.map(([name], i) => {
      const y = 12 + i * 20;
      svg('text', {x: 8, y: y + 11}, fig, name);
      svg('rect', {x: 78, y: y + 1, width: 224, height: 12, rx: 3, class: 'learning-meter-bg'}, fig);
      const fill = svg('rect', {x: 78, y: y + 1, width: 10, height: 12, rx: 3, class: i === 0 ? 'learning-meter-tok' : 'learning-meter-val'}, fig);
      const pct = svg('text', {x: 368, y: y + 11, 'text-anchor': 'end'}, fig);
      return {fill, pct};
    });
    const eq = el('p', null, 'learning-equation learning-eq-compact');
    const leadEl = el('strong'), entropyEl = el('strong');
    eq.append('p(top) = ', leadEl, ' · H = ', entropyEl, ' nats');
    const note = el('p', 'Illustrative logits normalized with softmax; probabilities always sum to 100%.', 'learning-note');

    function update() {
      const scale = Number(input.value) / 10;
      out.value = scale.toFixed(1) + '×';
      const scaled = items.map(([, z]) => z / scale);
      const maxZ = Math.max(...scaled);
      const exps = scaled.map(z => Math.exp(z - maxZ));
      const sum = exps.reduce((a, b) => a + b, 0);
      const probs = exps.map(e => e / sum);
      const entropy = -probs.reduce((acc, p) => acc + (p > 1e-9 ? p * Math.log(p) : 0), 0);
      probs.forEach((p, i) => {
        rows[i].fill.setAttribute('width', Math.max(2, 224 * p).toFixed(1));
        rows[i].pct.textContent = (100 * p).toFixed(1) + '%';
      });
      leadEl.textContent = (100 * probs[0]).toFixed(1) + '%';
      entropyEl.textContent = entropy.toFixed(2);
    }
    input.addEventListener('input', update);
    update();
    body.append(ctl, fig, eq, note);
    lab.append(body);
    return lab;
  }

  /* ---------- Swiss / Beamline Stage Companion Graphic ---------- */
  const STAGE_META = [
    ['UTF-8 text', 'MinHash + mix → clean stream', 'TRAINING · DATA'],
    ['ID 12842*', 'BPE merge → 129,280-row table', 'TRAINING · TOKENS'],
    ['−ln p(target)', 'forward ↑ · loss · gradients ↓ Δθ', 'PRETRAIN · Δθ'],
    ['group attempt', 'SFT + GRPO + KL anchor → tuned θ', 'POST-TRAIN · Δθ'],
    ['checkpoint θ*', 'evals + red-team + classifiers → freeze', 'RELEASE · SEAL'],
    ['prompt ID', 'tools → system → messages + prefix check', 'INFERENCE · θ*'],
    ['h ∈ ℝ⁷¹⁶⁸', 'embed → CSA/HCA + 6/384 MoE ×61 → logits', 'FORWARD · θ*'],
    ['KV cache entry', 'parallel prefill → paged compressed KV', 'PREFILL · KV'],
    ['reasoning ctx', 'adaptive thinking steps read cached KV', 'THINK · KV'],
    ['sampled token', 'memory-bound step + MTP draft/verify', 'DECODE · NEXT'],
    ['UTF-8 SSE', 'detokenize bytes → content_block_delta', 'STREAM · WIRE'],
    ['reply screen', 'tool_result → warm prefix reuse → end_turn', 'AGENT · LOOP']
  ];

  function drawStageScene(g, stage) {
    // 12 crisp Swiss isometric / Beamline schematic vignettes (x: 16..424, y: 30..92)
    switch (stage) {
      case 1:
        [34, 54, 74].forEach((y, i) => svg('rect', {x: 24 + i * 4, y, width: 64, height: 8, rx: 2, class: 'learning-node'}, g));
        svg('path', {d: 'M98 58 H194', class: 'learning-flow'}, g);
        svg('rect', {x: 196, y: 34, width: 10, height: 50, rx: 2, class: 'learning-node active'}, g);
        svg('path', {d: 'M206 68 L244 88 H286', class: 'learning-ray-drop'}, g);
        svg('path', {d: 'M206 52 H322', class: 'learning-ray-keep'}, g);
        [38, 50, 62].forEach(y => svg('rect', {x: 326, y, width: 76, height: 8, rx: 2, class: 'learning-node active'}, g));
        svg('circle', {cx: 152, cy: 58, r: 5.5, class: 'learning-bead'}, g);
        break;
      case 2:
        svg('rect', {x: 24, y: 50, width: 92, height: 18, rx: 3, class: 'learning-node'}, g);
        svg('path', {d: 'M136 32 V86 M126 34 H146', class: 'learning-axis'}, g);
        [162, 206, 250].forEach((x, i) => svg('rect', {x, y: 48, width: 36, height: 22, rx: 4, class: i === 1 ? 'learning-node is-tok' : 'learning-node'}, g));
        svg('rect', {x: 316, y: 34, width: 90, height: 52, rx: 4, class: 'learning-node active'}, g);
        svg('path', {d: 'M224 48 C252 30 286 34 348 56', class: 'learning-guide'}, g);
        svg('circle', {cx: 348, cy: 56, r: 4.5, class: 'learning-bead'}, g);
        break;
      case 3:
        for (let i = 0; i < 5; i++) svg('rect', {x: 162, y: 36 + i * 10, width: 96, height: 6, rx: 1.5, class: 'learning-node active'}, g);
        svg('path', {d: 'M140 84 V38', class: 'learning-curve'}, g);
        svg('path', {d: 'M280 38 V84', class: 'learning-flow'}, g);
        svg('text', {x: 130, y: 64, 'text-anchor': 'end', class: 'learning-svg-val'}, g, 'fwd ↑');
        svg('text', {x: 290, y: 64, class: 'learning-svg-tok'}, g, '∇θ ↓');
        svg('circle', {cx: 210, cy: 31, r: 5, class: 'learning-bead'}, g);
        break;
      case 4:
        svg('rect', {x: 34, y: 42, width: 58, height: 42, rx: 4, class: 'learning-node'}, g);
        svg('rect', {x: 132, y: 36, width: 64, height: 48, rx: 4, class: 'learning-node active'}, g);
        svg('path', {d: 'M92 62 H132', class: 'learning-guide'}, g);
        [38, 52, 66, 80].forEach((y, i) => {
          svg('path', {d: `M196 60 L256 ${y}`, class: i % 2 === 0 ? 'learning-ray-keep' : 'learning-grid'}, g);
          svg('rect', {x: 258, y: y - 5, width: i % 2 === 0 ? 96 : 54, height: 9, rx: 2, class: i % 2 === 0 ? 'learning-meter-res' : 'learning-meter-bg'}, g);
        });
        break;
      case 5:
        svg('rect', {x: 42, y: 44, width: 82, height: 34, rx: 4, class: 'learning-node'}, g);
        svg('path', {d: 'M124 61 H318', class: 'learning-curve'}, g);
        svg('rect', {x: 196, y: 32, width: 48, height: 56, rx: 5, class: 'learning-node active'}, g);
        svg('text', {x: 220, y: 64, 'text-anchor': 'middle', class: 'learning-svg-val'}, g, 'θ*');
        svg('rect', {x: 318, y: 44, width: 84, height: 34, rx: 4, class: 'learning-node active'}, g);
        svg('text', {x: 360, y: 65, 'text-anchor': 'middle', class: 'learning-svg-res'}, g, 'FROZEN');
        break;
      case 6:
        [['tools', 30], ['system', 106], ['messages', 188]].forEach(([lbl, x], i) => {
          svg('rect', {x, y: 48, width: i === 2 ? 96 : 68, height: 24, rx: 4, class: i === 2 ? 'learning-node is-tok' : 'learning-node active'}, g);
          svg('text', {x: x + (i === 2 ? 48 : 34), y: 64, 'text-anchor': 'middle'}, g, lbl);
        });
        svg('path', {d: 'M30 41 H174 M30 44 H174', class: 'learning-ray-keep'}, g);
        svg('path', {d: 'M288 60 H396', class: 'learning-curve'}, g);
        svg('circle', {cx: 356, cy: 60, r: 5, class: 'learning-bead'}, g);
        break;
      case 7:
        for (let s = 0; s < 4; s++) svg('line', {x1: 52 + s * 6, y1: 86, x2: 52 + s * 6, y2: 34, class: 'learning-curve'}, g);
        svg('rect', {x: 112, y: 40, width: 86, height: 40, rx: 5, class: 'learning-node active'}, g);
        svg('text', {x: 155, y: 64, 'text-anchor': 'middle'}, g, 'CSA · HCA');
        svg('circle', {cx: 268, cy: 60, r: 22, class: 'learning-node active'}, g);
        svg('text', {x: 268, y: 64, 'text-anchor': 'middle', class: 'learning-svg-val'}, g, '6/384');
        [42, 54, 66, 78].forEach((y, i) => svg('rect', {x: 332 + i * 16, y: 86 - (i === 1 ? 42 : 18), width: 11, height: i === 1 ? 42 : 18, rx: 2, class: i === 1 ? 'learning-meter-tok' : 'learning-meter-val'}, g));
        break;
      case 8:
        [44, 68, 92, 116].forEach((x, i) => {
          svg('rect', {x, y: 66, width: 18, height: 18, rx: 3, class: i === 2 ? 'learning-node is-tok' : 'learning-node'}, g);
          svg('path', {d: `M${x + 9} 64 V38 H258`, class: 'learning-curve'}, g);
        });
        for (let k = 0; k < 4; k++) svg('rect', {x: 264, y: 36 + k * 12, width: 116, height: 8, rx: 2, class: 'learning-meter-res'}, g);
        break;
      case 9:
        svg('rect', {x: 34, y: 40, width: 68, height: 42, rx: 4, class: 'learning-node active'}, g);
        svg('text', {x: 68, y: 65, 'text-anchor': 'middle'}, g, 'KV ctx');
        [128, 160, 192, 224].forEach(x => svg('rect', {x, y: 50, width: 24, height: 22, rx: 3, class: 'learning-guide'}, g));
        svg('line', {x1: 268, y1: 34, x2: 268, y2: 88, class: 'learning-axis'}, g);
        svg('rect', {x: 288, y: 46, width: 112, height: 28, rx: 5, class: 'learning-node active'}, g);
        svg('text', {x: 344, y: 64, 'text-anchor': 'middle', class: 'learning-svg-res'}, g, 'tool choice');
        break;
      case 10:
        [24, 42, 60, 78, 96].forEach((x, i) => svg('rect', {x, y: 84 - (i === 1 ? 44 : 18 + (i % 2) * 10), width: 12, height: i === 1 ? 44 : 18 + (i % 2) * 10, rx: 2, class: i === 1 ? 'learning-meter-tok' : 'learning-meter-val'}, g));
        svg('path', {d: 'M122 58 H222', class: 'learning-flow'}, g);
        svg('rect', {x: 228, y: 44, width: 72, height: 30, rx: 4, class: 'learning-node is-tok'}, g);
        svg('rect', {x: 310, y: 44, width: 88, height: 30, rx: 4, class: 'learning-guide'}, g);
        svg('text', {x: 354, y: 63, 'text-anchor': 'middle'}, g, 'MTP verify');
        break;
      case 11:
        svg('rect', {x: 28, y: 46, width: 74, height: 28, rx: 4, class: 'learning-node is-tok'}, g);
        svg('text', {x: 65, y: 64, 'text-anchor': 'middle'}, g, 'UTF-8 buf');
        svg('path', {d: 'M106 60 H306', class: 'learning-curve'}, g);
        [142, 196, 250].forEach(x => svg('circle', {cx: x, cy: 60, r: 4.5, class: 'learning-bead'}, g));
        svg('rect', {x: 312, y: 36, width: 94, height: 48, rx: 5, class: 'learning-node active'}, g);
        [48, 60, 72].forEach((y, i) => svg('line', {x1: 324, y1: y, x2: 392 - i * 16, y2: y, class: 'learning-ray-keep'}, g));
        break;
      default:
        svg('rect', {x: 26, y: 44, width: 84, height: 32, rx: 4, class: 'learning-node active'}, g);
        svg('text', {x: 68, y: 64, 'text-anchor': 'middle', class: 'learning-svg-res'}, g, 'tool_result');
        svg('path', {d: 'M110 60 C150 28 202 28 242 60', class: 'learning-ray-keep'}, g);
        svg('path', {d: 'M132 76 H224 M132 80 H224', class: 'learning-curve'}, g);
        svg('rect', {x: 248, y: 44, width: 158, height: 32, rx: 5, class: 'learning-node is-tok'}, g);
        svg('text', {x: 327, y: 64, 'text-anchor': 'middle'}, g, 'streamed completion');
        break;
    }
  }

  function tokenStrip(stage, token, title, stepCode = '') {
    const figure = el('figure', null, 'learning-strip');
    const drawing = document.createElementNS(NS, 'svg');
    drawing.setAttribute('viewBox', '0 0 440 126');
    drawing.setAttribute('role', 'img');
    const [form, summary, badge] = STAGE_META[Math.max(0, Math.min(11, stage - 1))];
    drawing.setAttribute('aria-label', `${stepCode ? stepCode + ' ' : ''}${title}: ${summary}`);

    svg('text', {x: 14, y: 20, class: 'learning-token'}, drawing, `“ ${token}” · ${form}`);
    svg('text', {x: 426, y: 20, 'text-anchor': 'end', class: stage <= 5 ? 'learning-svg-tok' : 'learning-svg-val'}, drawing, badge);
    svg('line', {x1: 14, y1: 27, x2: 426, y2: 27, class: 'learning-grid'}, drawing);

    const sceneGroup = svg('g', {}, drawing);
    drawStageScene(sceneGroup, stage);

    svg('line', {x1: 14, y1: 96, x2: 426, y2: 96, class: 'learning-grid'}, drawing);
    svg('text', {x: 220, y: 114, 'text-anchor': 'middle', class: 'learning-svg-muted'}, drawing, summary);
    figure.append(drawing);
    return figure;
  }

  /* ---------- Interactive Release-to-Inference Swap-Over Scene ---------- */
  function handover(section, {token, promptText, replyText, svgReply, nextHref}) {
    if (!section || section.querySelector('.learning-handover')) return;
    const checkpoint = section.querySelector('.learning-checkpoint');
    const host = el('div', null, 'learning-handover');

    const tabs = el('div', null, 'learning-handover-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Inspect lifecycle swap-over phase');
    const phases = [
      {
        id: 'train',
        btn: '1 · Train & update Δθ',
        weights: 'updating (∇θ L)',
        occurrence: `corpus “ ${token}”`,
        state: 'optimizer moments',
        caption: `During pretraining and RL, “ ${token}” is a scored target: gradients flow down the tower and nudge weights Δθ.`
      },
      {
        id: 'freeze',
        btn: '2 · Release freezes θ*',
        weights: 'locked θ* (FP4/FP8)',
        occurrence: 'training copy retired',
        state: 'evals + safeguards set',
        caption: 'At the release gate, training ends. The corpus text is gone; only the learned parameter values θ* ship.'
      },
      {
        id: 'infer',
        btn: '3 · Fresh prompt uses θ*',
        weights: 'frozen (∇θ = 0)',
        occurrence: `new prompt “ ${token}”`,
        state: 'temporary KV + reply',
        caption: `A brand-new occurrence arrives in ${promptText}, rides upward through frozen θ*, fills KV state, and completes ${replyText}.`
      }
    ];

    const fig = document.createElementNS(NS, 'svg');
    Object.entries({
      viewBox: '0 0 640 164',
      class: 'learning-handover-svg',
      role: 'img',
      'aria-label': 'Transition from weight-updating training pass through the frozen checkpoint gate into frozen-weight request inference'
    }).forEach(([k, v]) => fig.setAttribute(k, v));

    // Left: Training zone
    const zTrain = svg('g', {'data-zone': 'train'}, fig);
    svg('rect', {x: 12, y: 14, width: 188, height: 136, rx: 8, class: 'lh-zone'}, zTrain);
    svg('text', {x: 26, y: 34, class: 'lh-zone-title'}, zTrain, '1 · TRAINING PASS');
    for (let i = 0; i < 4; i++) svg('rect', {x: 54, y: 50 + i * 13, width: 72, height: 7, rx: 2, class: 'lh-plate-train'}, zTrain);
    svg('path', {d: 'M42 98 V50', class: 'learning-curve'}, zTrain);
    svg('path', {d: 'M140 50 V98', class: 'learning-flow'}, zTrain);
    svg('text', {x: 150, y: 78, class: 'learning-svg-tok'}, zTrain, 'Δθ');
    svg('text', {x: 26, y: 122}, zTrain, `corpus “ ${token}”`);
    svg('text', {x: 26, y: 138, class: 'learning-svg-muted'}, zTrain, 'changes weights');

    // Arrow 1 -> 2
    svg('path', {d: 'M204 82 H230', class: 'lh-bridge'}, fig);

    // Center: Release Gate
    const zFreeze = svg('g', {'data-zone': 'freeze'}, fig);
    svg('rect', {x: 234, y: 14, width: 164, height: 136, rx: 8, class: 'lh-zone'}, zFreeze);
    svg('text', {x: 248, y: 34, class: 'lh-zone-title'}, zFreeze, '2 · RELEASE GATE');
    svg('rect', {x: 274, y: 48, width: 84, height: 48, rx: 6, class: 'lh-seal'}, zFreeze);
    svg('text', {x: 316, y: 71, 'text-anchor': 'middle', class: 'lh-seal-main'}, zFreeze, 'θ* FROZEN');
    svg('text', {x: 316, y: 87, 'text-anchor': 'middle', class: 'learning-svg-muted'}, zFreeze, '∇θ = 0');
    svg('text', {x: 248, y: 122}, zFreeze, 'evals + classifiers');
    svg('text', {x: 248, y: 138, class: 'learning-svg-muted'}, zFreeze, 'training text gone');

    // Arrow 2 -> 3
    svg('path', {d: 'M402 82 H428', class: 'lh-bridge'}, fig);

    // Right: Inference zone
    const zInfer = svg('g', {'data-zone': 'infer'}, fig);
    svg('rect', {x: 432, y: 14, width: 196, height: 136, rx: 8, class: 'lh-zone'}, zInfer);
    svg('text', {x: 446, y: 34, class: 'lh-zone-title'}, zInfer, '3 · INFERENCE PASS');
    for (let i = 0; i < 4; i++) svg('rect', {x: 468, y: 50 + i * 13, width: 68, height: 7, rx: 2, class: 'lh-plate-infer'}, zInfer);
    svg('path', {d: 'M454 98 V50', class: 'learning-curve'}, zInfer);
    svg('rect', {x: 548, y: 50, width: 64, height: 46, rx: 4, class: 'lh-kv'}, zInfer);
    svg('text', {x: 580, y: 71, 'text-anchor': 'middle', class: 'learning-svg-res'}, zInfer, 'KV');
    svg('text', {x: 580, y: 86, 'text-anchor': 'middle', class: 'learning-svg-muted'}, zInfer, 'state');
    svg('text', {x: 446, y: 122, class: 'learning-svg-val'}, zInfer, `fresh “ ${token}” →`);
    svg('text', {x: 446, y: 138, class: 'learning-svg-res'}, zInfer, svgReply || replyText);

    const traveler = svg('circle', {cx: 604, cy: 30, r: 6.5, class: 'learning-bead lh-traveler'}, fig);

    const meters = el('div', null, 'learning-handover-readout');
    const wCell = el('div'), tCell = el('div'), sCell = el('div');
    const wVal = el('strong'), tVal = el('strong'), sVal = el('strong');
    wVal.dataset.mathVal = tVal.dataset.mathVal = sVal.dataset.mathVal = '1';
    wCell.append(el('span', 'Weights'), wVal);
    tCell.append(el('span', 'Token instance'), tVal);
    sCell.append(el('span', 'Active memory'), sVal);
    meters.append(wCell, tCell, sCell);

    const liveNote = el('p', '', 'learning-handover-note');
    liveNote.setAttribute('aria-live', 'polite');

    const zoneEls = {train: zTrain, freeze: zFreeze, infer: zInfer};
    const dotX = {train: 178, freeze: 378, infer: 604};

    function select(id) {
      const p = phases.find(item => item.id === id) || phases[2];
      host.dataset.phase = p.id;
      tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.phase === p.id)));
      Object.entries(zoneEls).forEach(([k, node]) => node.setAttribute('data-active', String(k === p.id)));
      traveler.setAttribute('cx', String(dotX[p.id]));
      wVal.textContent = p.weights;
      tVal.textContent = p.occurrence;
      sVal.textContent = p.state;
      liveNote.textContent = p.caption;
    }

    phases.forEach(p => {
      const b = el('button', p.btn, 'learning-chip');
      b.type = 'button';
      b.dataset.phase = p.id;
      b.addEventListener('click', () => select(p.id));
      tabs.append(b);
    });

    select('infer');
    host.append(tabs, fig, meters, liveNote);
    if (checkpoint) checkpoint.replaceWith(host);
    else section.querySelector('h2')?.after(host);
    if (nextHref) {
      const link = section.querySelector('a[href]');
      if (link) link.classList.add('learning-cta');
    }
    bindValueFeedback(section);
  }

  /* ---------- Entry Point Wiring ---------- */

  const JOURNEY_STAGE = [1, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 8, 8, 10, 10, 11, 12, 12, 12];

  function journeyCard(cardEl, stop) {
    const stage = JOURNEY_STAGE[stop.i] || 7;
    cardEl.append(tokenStrip(stage, 'sat', stop.title, 'Stop ' + (stop.i + 1)));
    if (stop.i === 1) cardEl.append(dedupeLab('sat'));
    if (stop.i === 7) cardEl.append(yarnLab());
    if (stop.i === 10) cardEl.append(grpoLab());
    if (stop.i === 25) cardEl.append(samplerLab('sat'));
  }

  function journey() {
    const trans = document.querySelector('#inference-transition .learning-transition') || document.getElementById('inference-transition');
    handover(trans, {
      token: 'sat',
      promptText: '“The cat sat”',
      replyText: '“ on the mat”',
      nextHref: '#ch4'
    });
  }

  function reader({stops, articles, scene}) {
    for (const [i, stop] of stops.entries()) {
      const article = articles[i];
      if (!article) continue;
      card(article);
      article.append(tokenStrip(stop.stage, 'Paris', stop.title, stop.id));
      const concept = stop.conceptSlug && window.SuiteLinks.resolve(stop.conceptSlug);
      const names = concept ? [concept.lab] : [];
      if (stop.id === '4.4') names.push('kl');
      if (stop.id === '7.2') names.push('attention', 'rope');
      if (stop.id === '8.1') names.push('roof', 'cache');
      window.MicroLabs.dock(article, [...new Set(names.filter(Boolean))], {onRoute: (k, bias) => scene.setRouting(k, bias)});
      if (stop.id === '1.2') article.append(dedupeLab('Paris'));
      if (stop.id === '3.2') article.append(lossLab('Paris'));
      if (stop.id === '3.3') article.append(JourneyMath.optimizer());
      if (stop.id === '3.4') article.append(yarnLab());
      if (stop.id === '4.2') article.append(grpoLab());
      if (stop.id === '7.4') article.append(JourneyMath.vectorDrawer());
      if (stop.id === '10.2') article.append(samplerLab('Paris'));
    }
    handover(document.getElementById('reader-inference-transition'), {
      token: 'Paris',
      promptText: '“What’s the weather in Paris right now?”',
      replyText: '“18 °C and clear in Paris”',
      svgReply: '“18 °C in Paris”',
      nextHref: '#s-6'
    });
    watchLabs(document.querySelector('#lesson'));
  }

  window.LearningPanels = Object.freeze({card, lossLab, dedupeLab, yarnLab, grpoLab, samplerLab, tokenStrip, handover, journeyCard, journey, openLabs, watchLabs, reader});
})();
