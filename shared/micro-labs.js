/* Classic script so the same calculations run from file:// and node --test. */
(function () {
  'use strict';

  const encoder = new TextEncoder();
  const bytesOf = text => Array.from(encoder.encode(text));
  const fmt = number => number.toLocaleString('en-US');
  const hex = byte => byte.toString(16).toUpperCase().padStart(2, '0');

  // Rules are learned in advance in a real tokenizer. Here the fixed vocabulary
  // is deliberately small enough to trace by hand. IDs 0–255 are raw bytes.
  const rules = [];
  const pairs = new Map();
  const pieces = Array.from({length: 256}, (_, i) => [i]);
  for (const word of [' The', 'The', ' café', ' café!', ' sat', ' cat', ' Paris', 'the', '🚀', '你好', '東京']) {
    const bytes = bytesOf(word);
    let left = bytes[0];
    for (const right of bytes.slice(1)) {
      const pair = left + ',' + right;
      if (!pairs.has(pair)) {
        const id = pieces.length;
        pieces.push([...pieces[left], ...pieces[right]]);
        pairs.set(pair, id);
        rules.push({left, right, id});
      }
      left = pairs.get(pair);
    }
  }

  function pieceLabel(bytes) {
    try {
      return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(bytes))
        .replaceAll(' ', '␠').replaceAll('\n', '↵').replaceAll('\t', '⇥');
    } catch {
      return bytes.map(hex).join(' ');
    }
  }

  function tokenize(text) {
    let ids = bytesOf(text);
    const merges = [];
    for (const rule of rules) {
      const next = [];
      let count = 0;
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === rule.left && ids[i + 1] === rule.right) {
          next.push(rule.id);
          i++;
          count++;
        } else {
          next.push(ids[i]);
        }
      }
      if (count) merges.push({...rule, count});
      ids = next;
    }
    return {ids, merges};
  }

  // Replaying only the arrived bytes makes the byte cursor seekable in either direction.
  function streamPrefix(text, cursor) {
    const wire = encoder.encode('data: ' + JSON.stringify({text}) + '\n\n');
    const end = Math.max(0, Math.min(wire.length, cursor));
    const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
    const prefix = decoder.decode(wire.subarray(0, end), {stream: true});
    const pending = end - encoder.encode(prefix).length;
    const delivered = prefix.endsWith('\n\n');
    return {prefix, pending, length: wire.length, delivered,
      value: delivered ? JSON.parse(prefix.slice(6, -2)).text : null};
  }

  const tokens = ['The', 'cat', 'sat', 'down'];
  const queries = [[1, 0], [.6, 1], [1.5, -.5], [0, 1.2]];
  const keys = [[.8, .2], [-.4, 1], [1.1, -.3], [.1, .9]];
  function attention(q = queries, k = keys) {
    return q.map((vector, i) => {
      const logits = k.map((key, j) => j > i ? -Infinity :
        vector.reduce((sum, x, d) => sum + x * key[d], 0) / Math.sqrt(vector.length));
      const max = Math.max(...logits);
      const exp = logits.map(x => Math.exp(x - max));
      const total = exp.reduce((a, b) => a + b, 0);
      return exp.map(x => x / total);
    });
  }

  function rope(m, n, theta = Math.PI / 12) {
    return {query: m * theta, key: n * theta, phase: (m - n) * theta,
      dot: Math.cos((m - n) * theta)};
  }

  const maxContext = 1048576;
  function kvFootprints(length) {
    // Illustrative per-layer byte budget. The V4 curve is anchored to the
    // published whole-model ratio at 1M, with a 128-token local window.
    const mla = length * 768;
    const window = Math.min(length, 128);
    const compressed = (maxContext * 768 * .10 - 128 * 768) / (maxContext - 128);
    return {mha: length * 2 * 128 * 128 * 2, gqa: length * 2 * 8 * 128 * 2,
      mla, v4: window * 768 + (length - window) * compressed,
      flopRatio: length === maxContext ? .27 : null};
  }

  const baseSlots = [12, 74, 141, 206, 279, 348];
  function routeExperts(k = 6, bias = 1, offset = 0, slots = baseSlots) {
    // A fixed prior load profile: experts 18–29 were heavily used in a prior
    // batch. Bias changes selection only. Mixing uses original affinities.
    const pool = Array.from({length: 384}, (_, id) => ({id, affinity: .04, load: .35}));
    for (let j = 0; j < 12; j++) Object.assign(pool[18 + j], {affinity: .99 - .028 * j, load: 1});
    [...slots, 54, 321].forEach((slot, j) => {
      const id = (slot + offset) % pool.length;
      if (pool[id].load !== 1) Object.assign(pool[id], {affinity: .8 * .82 ** j, load: 0});
    });
    for (const e of pool) e.score = e.affinity - bias * e.load;
    pool.sort((a, b) => b.score - a.score || a.id - b.id);
    const selected = pool.slice(0, Math.min(8, Math.max(1, Math.round(k))));
    const sum = selected.reduce((n, e) => n + e.affinity, 0);
    return selected.map(e => ({id: e.id, weight: e.affinity / sum, hot: e.load === 1}));
  }

  function roofline(prompt, batch) {
    // Ideal dense linear layer: read FP4 weights once and BF16 inputs/outputs.
    const d = 7168, peak = 10e15, bandwidth = 8e12, ridge = peak / bandwidth;
    function point(rows) {
      const intensity = 2 * d * d * rows / (.5 * d * d + 4 * d * rows);
      return {intensity, pflops: Math.min(peak, bandwidth * intensity) / 1e15,
        bound: intensity >= ridge ? 'compute' : 'HBM bandwidth'};
    }
    return {ridge, prefill: point(prompt * batch), decode: point(batch)};
  }

  const stopLabs = {3: ['bpe'], 4: ['bpe'], 11: ['kl'], 14: ['attention', 'rope'], 15: ['kv'],
    16: ['mix'], 17: ['moe'], 24: ['roof'], 25: ['roof'], 26: ['stream']};
  const core = {tokenize, pieces, pieceLabel, streamPrefix, attention, rope,
    kvFootprints, maxContext, routeExperts, roofline, storyStops: stopLabs, tourStops: stopLabs};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = (tag, props, parent) => {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(props)) node.setAttribute(name, value);
    parent.append(node);
    return node;
  };
  function graphic(box, viewBox, label) {
    return svg('svg', {viewBox, role: 'img', 'aria-label': label, class: 'ml-graphic'}, box);
  }
  function slider(box, label, min, max, start, update, describe = String) {
    const field = el('label', undefined, 'ml-control');
    const name = el('span', label), value = el('span', describe(start), 'ml-value');
    const input = el('input');
    Object.assign(input, {type: 'range', min, max, value: start});
    input.setAttribute('aria-label', label);
    const sync = () => {
      const caption = describe(+input.value);
      value.textContent = caption;
      input.setAttribute('aria-valuetext', caption);
    };
    input.addEventListener('input', () => {sync(); update();});
    field.append(name, value, input);
    box.append(field);
    sync();
    return {input, sync, get value() { return +input.value; }};
  }
  function note(box, text) {
    box.append(el('p', text, 'ml-note'));
  }
  function eq(box, terms) {
    const equation = el('div', undefined, 'ml-equation');
    const gloss = el('div', '', 'ml-gloss');
    gloss.setAttribute('aria-live', 'polite');
    let focused, hovered;
    function show() {
      const term = hovered || focused;
      for (const part of box.querySelectorAll('[data-mark]')) {
        part.classList.toggle('ml-lit', part.dataset.mark.split(' ').includes(term?.key));
      }
      gloss.textContent = term?.gloss || '';
    }
    for (const term of terms) {
      if (typeof term === 'string') { equation.append(term); continue; }
      const [key, label, description] = term;
      const symbol = el('button', label);
      symbol.type = 'button';
      symbol.setAttribute('aria-label', label + '. ' + description);
      const item = {key, gloss: description};
      symbol.onfocus = () => { focused = item; show(); };
      symbol.onblur = () => { focused = null; show(); };
      symbol.onpointerenter = () => { hovered = item; show(); };
      symbol.onpointerleave = () => { hovered = null; show(); };
      equation.append(symbol);
    }
    box.append(equation, gloss);
  }

  function bpeLab(box, stream) {
    const field = el('label', 'Prompt', 'ml-field'), input = el('textarea');
    input.rows = 2;
    input.maxLength = 160;
    input.value = ' The café 🚀';
    field.append(input);
    const result = el('div', undefined, 'ml-pieces'), steps = el('ol', undefined, 'ml-merges');
    const trace = el('details');
    trace.append(el('summary', 'Merge order'), steps);
    box.append(field, result, trace);
    note(box, 'Fixed teaching vocabulary. ␠ marks a space. Labels below each piece are its local token ID.');
    let cursor, wire, status;
    function decode() {
      const state = streamPrefix(input.value, cursor.value);
      wire.textContent = state.prefix || '∅';
      status.textContent = state.delivered ? 'Event delivered · ' + JSON.stringify(state.value) :
        state.pending ? state.pending + ' UTF-8 byte(s) buffered · waiting for the rest of the character' :
        'Waiting for the blank line that ends this SSE event';
    }
    if (stream) {
      cursor = slider(box, 'Bytes received', 0, 1, 0, decode);
      wire = el('pre', '', 'ml-wire');
      status = el('div', '', 'ml-readout');
      box.append(wire, status);
    }
    function update() {
      const {ids, merges} = tokenize(input.value);
      result.replaceChildren(...ids.map(id => {
        const piece = el('span', pieceLabel(pieces[id]));
        piece.append(el('small', String(id)));
        return piece;
      }));
      steps.replaceChildren(...merges.map(({left, right, id, count}) => el('li',
        pieceLabel(pieces[left]) + ' + ' + pieceLabel(pieces[right]) + ' → ' + pieceLabel(pieces[id]) +
        (count > 1 ? ' × ' + count : ''))));
      if (!merges.length) steps.append(el('li', 'No matching pair.'));
      if (stream) {
        const length = streamPrefix(input.value, 0).length;
        cursor.input.max = String(length);
        const firstMultibyte = encoder.encode('data: ' + JSON.stringify({text: input.value})).findIndex(b => b >= 128);
        cursor.input.value = String(firstMultibyte < 0 ? length : firstMultibyte + 1);
        cursor.sync();
        decode();
      }
    }
    input.addEventListener('input', update);
    update();
  }


  function attentionLab(box) {
    const weights = attention(), fig = graphic(box, '0 0 294 148', 'Causal attention weights by query row and key column');
    const info = el('div', '', 'ml-readout');
    const controls = el('div', undefined, 'ml-tokens');
    const rows = [];
    const buttons = [];
    function select(i) {
      rows.forEach((row, j) => row.setAttribute('opacity', j === i ? '1' : '.46'));
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      info.textContent = 'Query “' + tokens[i] + '” · allowed weights sum to ' +
        weights[i].reduce((a, b) => a + b).toFixed(2);
    }
    tokens.forEach((word, i) => {
      const button = el('button', word);
      button.type = 'button';
      button.onpointerenter = button.onfocus = button.onclick = () => select(i);
      controls.append(button); buttons.push(button);
      svg('text', {x: 70 + i * 61, y: 13, 'data-mark': 'keys', 'text-anchor': 'middle'}, fig).textContent = word;
      const row = svg('g', {}, fig);
      rows.push(row);
      row.onpointerenter = () => select(i);
      svg('text', {x: 1, y: 42 + i * 31, 'data-mark': 'q'}, row).textContent = word;
      weights[i].forEach((w, j) => {
        const x = 42 + j * 61, y = 23 + i * 31;
        svg('rect', {x, y, width: 56, height: 27, rx: 3, class: j > i ? 'ml-masked' : 'ml-cell',
          opacity: j > i ? .32 : .12 + .7 * w, 'data-mark': j > i ? 'mask' : 'keys'}, row);
        svg('text', {x: x + 28, y: y + 18, 'text-anchor': 'middle'}, row).textContent = j > i ? '×' : w.toFixed(2);
      });
    });
    box.append(controls, info);
    eq(box, ['softmax(', ['q', 'q', 'The query asks which earlier tokens matter.'], ' · ',
      ['keys', 'Kᵀ', 'Each column scores the query against one key.'], ' / √d + ',
      ['mask', 'mask', 'Future positions receive zero probability.'], ')']);
    note(box, 'Four illustrative 2D query/key vectors. Choose a token to inspect its row.');
    select(2);
  }

  function ropeLab(box) {
    const m = slider(box, 'Query position m', 0, 24, 8, draw);
    const n = slider(box, 'Key position n', 0, 24, 3, draw);
    const fig = graphic(box, '0 0 280 112', 'Query and key rotations at 15 degrees per position');
    svg('circle', {cx: 60, cy: 56, r: 43, class: 'ml-outline'}, fig);
    const lines = ['ml-vector', 'ml-key'].map(cls =>
      svg('line', {x1: 60, y1: 56, class: cls, 'stroke-width': 3}, fig));
    const legend = svg('text', {x: 124, y: 48}, fig), dot = svg('text', {x: 124, y: 72}, fig);
    note(box, 'Solid ray = query. Dashed ray = key. Both start at (1, 0). Move both positions equally to preserve their dot product.');
    function draw() {
      const r = rope(m.value, n.value);
      [r.query, r.key].forEach((a, i) => {
        lines[i].setAttribute('x2', 60 + 43 * Math.cos(a));
        lines[i].setAttribute('y2', 56 - 43 * Math.sin(a));
      });
      legend.textContent = 'θ(m − n) = ' + Math.round(r.phase * 180 / Math.PI) + '°';
      dot.textContent = 'q · k = ' + r.dot.toFixed(3);
    }
    draw();
  }

  function kvLab(box) {
    const control = slider(box, 'Context length', 12, 20, 16, update, n => fmt(2 ** n) + ' tokens');
    const table = el('table'), body = el('tbody');
    table.append(body); box.append(table);
    const info = el('div', '', 'ml-readout');
    box.append(info);
    note(box, 'Illustrative average layer, MiB per sequence. MHA/GQA use 128/8 KV heads, width 128, BF16. MLA uses 768 B/token. The hybrid estimate keeps 128 local tokens and fits its compressed slope to the published 1M ratio.');
    function update() {
      const v = kvFootprints(2 ** control.value);
      body.replaceChildren(...[['Full MHA', v.mha], ['GQA', v.gqa], ['V3.2 MLA', v.mla], ['V4 CSA + HCA', v.v4]].map(([name, bytes]) => {
        const tr = el('tr'); tr.append(el('th', name), el('td', fmt(+(bytes / 1048576).toFixed(2)) + ' MiB')); return tr;
      }));
      info.textContent = v.flopRatio ? 'Published at 1M · 10% KV cache · 27% single-token inference FLOPs vs V3.2' :
        'Estimated V4 cache · ' + (100 * v.v4 / v.mla).toFixed(1) + '% of MLA. Move to 1M for the published FLOP comparison.';
    }
    update();
  }

  // The lab control and the adjacent component illustration share this state.
  const routing = {k: 6, bias: 1};
  function moeLab(box, options) {
    const count = slider(box, 'Routed experts K', 1, 8, routing.k, change);
    const bias = slider(box, 'Load correction', 0, 100, Math.round(routing.bias * 100), change, n => (n / 100).toFixed(2));
    const fig = graphic(box, '0 0 278 124', '384 routed experts in a 24 by 16 bank; selected experts sized by gate weight');
    const cells = Array.from({length: 384}, (_, id) => svg('rect', {x: (id % 24) * 11.6 + 2,
      y: Math.floor(id / 24) * 7.6 + 2, width: 8, height: 4.5, rx: 1, class: 'ml-idle'}, fig));
    const weights = el('div', '', 'ml-weights'), info = el('div', '', 'ml-readout');
    box.append(weights, info);
    eq(box, [['top', 'top6', 'Six is the model default. K selects the highest corrected scores.'],
      ' → Σ ', ['gate', 'gⱼ', 'A taller cell and a longer bar mean a larger share of the routed output.'], ' · expertⱼ']);
    note(box, 'Illustrative affinities. Correction penalizes experts with high prior load during selection. Original affinities determine the mix. The shared expert runs separately.');
    function paint() {
      const entries = routeExperts(routing.k, routing.bias);
      cells.forEach(c => {c.setAttribute('class', 'ml-idle'); c.setAttribute('height', '4.5'); c.removeAttribute('data-mark');});
      weights.replaceChildren();
      for (const {id, weight} of entries) {
        const c = cells[id]; c.setAttribute('class', 'ml-active'); c.setAttribute('data-mark', 'top gate');
        c.setAttribute('height', (3 + 4.4 * Math.sqrt(weight)).toFixed(2));
        c.style.setProperty('--ml-weight', String(weight));
        const row = el('div', undefined, 'ml-weight');
        const bar = el('i'); bar.style.width = (weight * 100) + '%'; bar.dataset.mark = 'gate';
        row.append(el('span', 'E' + id), bar, el('span', (100 * weight).toFixed(1) + '%'));
        weights.append(row);
      }
      info.textContent = 'Σ gⱼ = ' + entries.reduce((s, e) => s + e.weight, 0).toFixed(2) +
        ' · previously busy experts ' + entries.filter(e => e.hot).length + '/' + entries.length;
    }
    function change() {
      routing.k = count.value; routing.bias = bias.value / 100;
      paint();
      options.onRoute?.(routing.k, routing.bias);
      document.dispatchEvent(new CustomEvent('labroute', {detail: {...routing}}));
    }
    box._refreshRoute = () => {
      count.input.value = String(routing.k); bias.input.value = String(Math.round(routing.bias * 100));
      count.sync(); bias.sync(); paint();
    };
    options.onRoute?.(routing.k, routing.bias);
    paint();
  }

  function roofLab(box) {
    const length = slider(box, 'Prompt length', 10, 17, 12, update, n => fmt(2 ** n) + ' tokens');
    const batch = slider(box, 'Batch size', 0, 10, 0, update, n => fmt(2 ** n));
    const fig = graphic(box, '0 0 306 142', 'Log–log roofline: memory bandwidth rises to the horizontal compute ceiling');
    const x = intensity => 40 + Math.log2(intensity) * 18.5;
    const y = pflops => 108 - (Math.log2(pflops) + 7) * 7.8;
    const ridge = roofline(4096, 1).ridge;
    svg('path', {d: 'M40 12V111H278', class: 'ml-outline'}, fig);
    svg('path', {d: 'M40 ' + y(.008) + ' L' + x(ridge) + ' ' + y(10) + ' H278', class: 'ml-curve'}, fig);
    svg('line', {x1: x(ridge), x2: x(ridge), y1: y(10), y2: 111, class: 'ml-guide'}, fig);
    for (const [tx, ty, label] of [[2, 15, 'PF/s'], [44, 136, '1'], [138, 136, 'FLOP/byte →'], [245, 136, '4096'],
      [2, y(10) + 3, '10'], [1, y(.01) + 3, '.01'], [x(ridge) - 30, 122, '1,250']]) {
      svg('text', {x: tx, y: ty}, fig).textContent = label;
    }
    const prefill = svg('circle', {r: 5, class: 'ml-active'}, fig);
    const decode = svg('rect', {width: 8, height: 8, class: 'ml-key'}, fig);
    const info = el('div', '', 'ml-readout'); box.append(info);
    note(box, 'Single Blackwell GPU in GB200: dense FP4 10 PFLOP/s, HBM3e 8 TB/s. Ideal 7,168-wide projection reads weights once and BF16 activations in/out. Points are upper bounds for this kernel.');
    function update() {
      const r = roofline(2 ** length.value, 2 ** batch.value);
      prefill.setAttribute('cx', x(r.prefill.intensity)); prefill.setAttribute('cy', y(r.prefill.pflops));
      decode.setAttribute('x', x(r.decode.intensity) - 4); decode.setAttribute('y', y(r.decode.pflops) - 4);
      info.textContent = '● Prefill ' + r.prefill.intensity.toFixed(1) + ' FLOP/B · ' + r.prefill.bound +
        '\n□ Decode ' + r.decode.intensity.toFixed(1) + ' FLOP/B · ' + r.decode.bound;
    }
    update();
  }

  function couplingLab(box, kind) {
    const fig = graphic(box, '0 0 280 105', kind === 'mix' ? 'Four residual streams pass through a mixing matrix' :
      'Current and reference distributions for two possible tokens');
    if (kind === 'mix') {
      for (let i = 0; i < 4; i++) {
        const y = 16 + 24 * i;
        svg('text', {x: 0, y: y + 4}, fig).textContent = 'x' + (i + 1);
        for (const j of [i, (i + 1) % 4]) {
          svg('path', {d: 'M24 ' + y + ' C110 ' + y + ' 170 ' + (16 + j * 24) + ' 248 ' + (16 + j * 24),
            class: 'ml-curve', opacity: i === j ? 1 : .5, 'data-mark': 'mix'}, fig);
        }
        svg('text', {x: 252, y: y + 4}, fig).textContent = 'y' + (i + 1);
      }
      eq(box, ['Y = ', ['mix', 'mHC_mix', 'Each output mixes ¾ of its stream and ¼ from a neighbor. Every row and column sums to one.'], ' · X']);
    } else {
      const p = [.75, .25], ref = [.5, .5];
      for (let i = 0; i < 2; i++) {
        const base = 20 + i * 46;
        svg('text', {x: 3, y: base + 12}, fig).textContent = i ? 'B' : 'A';
        for (const [j, value] of [p[i], ref[i]].entries()) {
          svg('rect', {x: 25, y: base + j * 14, width: 220 * value, height: 10,
            class: j ? 'ml-masked' : 'ml-active', 'data-mark': 'kl'}, fig);
          svg('text', {x: 30 + 220 * value, y: base + j * 14 + 10}, fig).textContent = value.toFixed(2);
        }
      }
      eq(box, [['kl', 'KL', 'The penalty grows as the current policy departs from the reference distribution.'], '(π ∥ πref) = 0.131 nats']);
      note(box, 'Current policy above each reference bar. KL = Σ p log(p / pref).');
    }
  }

  const labs = {
    bpe: ['Trace a BPE merge', box => bpeLab(box, false)],
    stream: ['Step through the UTF-8 stream', box => bpeLab(box, true)],
    attention: ['Inspect causal attention', attentionLab], rope: ['Rotate a query and key', ropeLab],
    kv: ['Compare KV cache sizes', kvLab], moe: ['Adjust the expert router', moeLab],
    roof: ['Explore the B200 roofline', roofLab],
    mix: ['Follow the four residual streams', box => couplingLab(box, 'mix')],
    kl: ['Inspect the KL penalty', box => couplingLab(box, 'kl')]
  };
  const components = {'MD-2a': ['attention', 'rope'], 'MD-2b': ['kv'], 'MD-2c': ['kv'],
    'MD-2d': ['attention', 'rope'], 'MD-2g': ['moe'], 'MD-2h': ['moe']};
  function dock(parent, names = [], options = {}) {
    for (const name of names) {
      const details = el('details', undefined, 'micro-lab');
      details.dataset.lab = name;
      details.append(el('summary', labs[name][0]));
      details.addEventListener('toggle', () => {
        if (!details.open) return;
        let body = details.querySelector('.ml-body');
        if (!body) {
          body = el('div', undefined, 'ml-body'); details.append(body);
          labs[name][1](body, options);
        } else body._refreshRoute?.();
      });
      parent.append(details);
    }
  }

  function routerCenter(id) {
    return [170 + id % 24 * 11.2, 581 + Math.floor(id / 24) * 6];
  }
  function routerDrawing(base, caption) {
    const group = svg('g', {'data-router-drawing': ''}, base);
    const bank = svg('g', {}, group);
    const x = id => routerCenter(id)[0] - 4;
    const y = id => routerCenter(id)[1] - 2;
    for (let id = 0; id < 384; id++) {
      svg('rect', {x: x(id), y: y(id), width: 8, height: 4.4, rx: 1, fill: 'rgba(255,255,255,.16)'}, bank);
    }
    const selected = svg('g', {}, group), paths = svg('g', {}, group);
    const experts = svg('g', {}, group);
    function refresh() {
      selected.replaceChildren(); paths.replaceChildren(); experts.replaceChildren();
      const entries = routeExperts(routing.k, routing.bias);
      caption.textContent = 'top-' + entries.length + ' of 384';
      entries.forEach(({id, weight}, j) => {
        const mid = 228 + (j + .5) * 207 / entries.length;
        const w = Math.min(26, 175 / entries.length);
        svg('rect', {x: x(id), y: y(id) - weight * 4, width: 8, height: 4.4 + weight * 4,
          fill: '#ffd277', stroke: '#fff3c7', 'stroke-width': .5, 'data-expert': id, 'data-weight': weight}, selected);
        svg('path', {d: 'M' + (x(id) + 4) + ' ' + y(id) + ' L' + mid + ' 544',
          fill: 'none', stroke: '#ffd277', 'stroke-width': .45 + 8 * weight}, paths);
        svg('rect', {x: mid - w / 2, y: 500, width: w, height: 44, rx: 3, class: 'ln'}, experts);
        const height = 40 * weight;
        svg('rect', {x: mid - w / 2 + 2, y: 542 - height, width: w - 4, height, fill: '#ffd277'}, experts);
        svg('path', {d: 'M' + mid + ' 500 L300 476', class: 'ln faint'}, experts);
      });
    }
    group.refreshRouting = refresh;
    refresh();
    return (take, mix) => {
      selected.setAttribute('opacity', take);
      paths.setAttribute('opacity', mix);
      experts.setAttribute('opacity', .4 + .6 * take);
    };
  }
  document.addEventListener('labroute', () => {
    document.querySelectorAll('[data-router-drawing]').forEach(g => g.refreshRouting());
    document.querySelectorAll('.micro-lab[open] .ml-body').forEach(b => b._refreshRoute?.());
  });
  function reveal(root, name) {
    if (!Object.hasOwn(labs, name)) return;
    const lab = root.querySelector('[data-lab="' + name + '"]');
    if (!lab) return;
    for (let node = lab; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS') node.open = true;
    }
    requestAnimationFrame(() => lab.querySelector('summary').scrollIntoView({block: 'center', behavior: 'instant'}));
  }
  window.MicroLabs = Object.freeze({...core, dock, components, routing, routerDrawing, routerCenter, reveal});
})();
