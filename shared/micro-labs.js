/* Classic script so the same calculations run from file:// and node --test. */
(function () {
  'use strict';
  const enc = new TextEncoder();
  const bytesOf = t => Array.from(enc.encode(t));
  const fmt = n => n.toLocaleString('en-US');
  const hex = b => b.toString(16).toUpperCase().padStart(2, '0');

  const rules = [], pairs = new Map(), pieces = Array.from({length: 256}, (_, i) => [i]);
  for (const w of [' The', 'The', ' café', ' café!', ' sat', ' cat', ' Paris', 'the', '🚀', '你好', '東京']) {
    const b = bytesOf(w); let left = b[0];
    for (const right of b.slice(1)) {
      const k = left + ',' + right;
      if (!pairs.has(k)) { const id = pieces.length; pieces.push([...pieces[left], ...pieces[right]]); pairs.set(k, id); rules.push({left, right, id}); }
      left = pairs.get(k);
    }
  }
  function pieceLabel(b) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(b)).replaceAll(' ', '␠').replaceAll('\n', '↵').replaceAll('\t', '⇥'); }
    catch { return b.map(hex).join(' '); }
  }
  function tokenize(text) {
    let ids = bytesOf(text); const merges = [];
    for (const r of rules) {
      const next = []; let count = 0;
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === r.left && ids[i + 1] === r.right) { next.push(r.id); i++; count++; }
        else next.push(ids[i]);
      }
      if (count) merges.push({...r, count});
      ids = next;
    }
    return {ids, merges};
  }
  function streamPrefix(text, cursor, buffered = true) {
    const wire = enc.encode('data: ' + JSON.stringify({text}) + '\n\n');
    const end = Math.max(0, Math.min(wire.length, cursor));
    if (!buffered) {
      const prefix = new TextDecoder('utf-8', {fatal: false, ignoreBOM: true}).decode(wire.subarray(0, end));
      const delivered = end === wire.length && prefix.endsWith('\n\n');
      return {prefix, pending: 0, length: wire.length, delivered, corrupted: prefix.includes('\uFFFD'), value: delivered ? JSON.parse(prefix.slice(6, -2)).text : null};
    }
    const prefix = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(wire.subarray(0, end), {stream: true});
    const pending = end - enc.encode(prefix).length, delivered = prefix.endsWith('\n\n');
    return {prefix, pending, length: wire.length, delivered, corrupted: false, value: delivered ? JSON.parse(prefix.slice(6, -2)).text : null};
  }
  const tokens = ['The', 'cat', 'sat', 'down'], queries = [[1, 0], [.6, 1], [1.5, -.5], [0, 1.2]], keys = [[.8, .2], [-.4, 1], [1.1, -.3], [.1, .9]];
  function attention(q = queries, k = keys) {
    return q.map((v, i) => {
      const l = k.map((key, j) => j > i ? -Infinity : v.reduce((s, x, d) => s + x * key[d], 0) / Math.sqrt(v.length));
      const m = Math.max(...l), e = l.map(x => Math.exp(x - m)), t = e.reduce((a, b) => a + b, 0);
      return e.map(x => x / t);
    });
  }
  const rope = (m, n, theta = Math.PI / 12) => ({query: m * theta, key: n * theta, phase: (m - n) * theta, dot: Math.cos((m - n) * theta)});
  const maxContext = 1048576;
  function kvFootprints(len) {
    const mla = len * 768, w = Math.min(len, 128), c = (maxContext * 768 * .10 - 128 * 768) / (maxContext - 128);
    return {mha: len * 2 * 128 * 128 * 2, gqa: len * 2 * 8 * 128 * 2, mla, v4: w * 768 + (len - w) * c, flopRatio: len === maxContext ? .27 : null};
  }
  const baseSlots = [12, 74, 141, 206, 279, 348];
  function routeExperts(k = 6, bias = 1, offset = 0, slots = baseSlots) {
    const pool = Array.from({length: 384}, (_, id) => ({id, affinity: .04, load: .35}));
    for (let j = 0; j < 12; j++) Object.assign(pool[18 + j], {affinity: .99 - .028 * j, load: 1});
    [...slots, 54, 321].forEach((slot, j) => { const id = (slot + offset) % 384; if (pool[id].load !== 1) Object.assign(pool[id], {affinity: .8 * .82 ** j, load: 0}); });
    for (const e of pool) e.score = e.affinity - bias * e.load;
    pool.sort((a, b) => b.score - a.score || a.id - b.id);
    const sel = pool.slice(0, Math.min(8, Math.max(1, Math.round(k)))), sum = sel.reduce((n, e) => n + e.affinity, 0);
    return sel.map(e => ({id: e.id, weight: e.affinity / sum, hot: e.load === 1}));
  }
  function moeCapacity(k = 6, bias = 1, cf = 1.25, batchTokens = 24) {
    const entries = routeExperts(k, bias), hotShare = entries.filter(e => e.hot).length / entries.length;
    const total = batchTokens * entries.length, capPerExpert = Math.max(1, Math.ceil((total / 12) * cf));
    const hotCap = Math.max(1, Math.round(6 * capPerExpert * (1 - .52 * hotShare * (1 - bias))));
    const dropped = bias >= .45 ? 0 : Math.max(0, Math.round(total * hotShare) - hotCap);
    return {total, routed: total - dropped, dropped, hotShare, capPerExpert};
  }
  const PREFIX_TOKENS = ['[SYS]', 'You', 'are', 'a', 'precise', 'assistant', 'with', 'weather', 'tools', 'and',
    'strict', 'JSON', 'schemas', 'for', 'live', 'city', 'queries', '·', 'tool_call', '→'];
  function prefixCache(editIndex = null) {
    const total = PREFIX_TOKENS.length;
    const matched = editIndex == null ? total - 1 : Math.max(0, Math.min(total - 1, editIndex));
    const hitRate = matched / total;
    return {total, matched, prefilled: total - matched, hitRate, ttftMs: Math.round(180 + (1 - hitRate) * 1740), editIndex};
  }
  function pdSchedule(disaggregated = true, chunkK = 64) {
    const baseItlMs = 18, prefillChunkMs = Math.round(chunkK * 5);
    return {disaggregated, chunkK, baseItlMs, prefillChunkMs, peakItlMs: disaggregated ? baseItlMs : baseItlMs + prefillChunkMs, stallMs: disaggregated ? 0 : prefillChunkMs};
  }
  function roofline(prompt, batch, ep = 1) {
    const d = 7168, peak = 10e15, bw = 8e12, ridge = peak / bw, nvUni = 900e9;
    const epGroup = Math.max(1, Math.round(ep)), remote = epGroup > 1 ? (epGroup - 1) / epGroup : 0;
    function pt(rows) {
      const flops = 2 * d * d * rows, intensity = flops / (.5 * d * d + 4 * d * rows), hbmCap = bw * intensity;
      const epB = epGroup > 1 ? rows * 6 * d * 4 * remote : 0, nvCap = epB > 0 ? (flops / epB) * nvUni : Infinity;
      const att = Math.min(peak, hbmCap, nvCap);
      const bound = att === nvCap && nvCap < Math.min(peak, hbmCap) ? 'NVLink EP All-to-All' : intensity >= ridge ? 'compute' : 'HBM bandwidth';
      return {intensity, pflops: att / 1e15, nvlinkPflops: epB > 0 ? Math.min(peak, nvCap) / 1e15 : null, bound};
    }
    const nvlinkCeiling = epGroup > 1 ? Math.min(peak, (2 * d * d / (6 * d * 4 * remote)) * nvUni) / 1e15 : null;
    return {ridge, ep: epGroup, nvlinkCeiling, prefill: pt(prompt * batch), decode: pt(batch)};
  }
  const stopLabs = {3: ['bpe'], 4: ['bpe'], 11: ['kl'], 14: ['attention', 'rope'], 15: ['kv'],
    16: ['mix'], 17: ['moe'], 23: ['pd'], 24: ['roof'], 25: ['roof'], 26: ['stream'], 30: ['cache']};
  const core = {tokenize, pieces, pieceLabel, streamPrefix, attention, rope, kvFootprints, maxContext,
    routeExperts, moeCapacity, prefixCache, PREFIX_TOKENS, pdSchedule, roofline, storyStops: stopLabs, tourStops: stopLabs};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const btn = (text, cls, pressed) => { const b = el('button', text, cls); b.type = 'button'; if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed)); return b; };
  const setA = (n, p) => { for (const [k, v] of Object.entries(p)) n.setAttribute(k, String(v)); return n; };
  const svg = (tag, p, parent, txt) => { const n = setA(document.createElementNS('http://www.w3.org/2000/svg', tag), p); if (txt !== undefined) n.textContent = txt; parent.append(n); return n; };
  const graphic = (box, viewBox, label) => svg('svg', {viewBox, role: 'img', 'aria-label': label, class: 'ml-graphic'}, box);
  const note = (box, text) => box.append(el('p', text, 'ml-note'));
  function slider(box, label, min, max, start, update, describe = String) {
    const field = el('label', undefined, 'ml-control'), value = el('span', describe(start), 'ml-value');
    const input = Object.assign(el('input'), {type: 'range', min, max, value: start});
    input.setAttribute('aria-label', label);
    const sync = () => { const c = describe(+input.value); value.textContent = c; input.setAttribute('aria-valuetext', c); };
    input.addEventListener('input', () => { sync(); update(); });
    field.append(el('span', label), value, input); box.append(field); sync();
    return {input, sync, get value() { return +input.value; }};
  }
  function eq(box, terms) {
    const row = el('div', undefined, 'ml-equation'), gloss = el('div', '', 'ml-gloss');
    gloss.setAttribute('aria-live', 'polite');
    let foc, hov;
    const show = () => {
      const t = hov || foc;
      for (const p of box.querySelectorAll('[data-mark]')) p.classList.toggle('ml-lit', p.dataset.mark.split(' ').includes(t?.key));
      gloss.textContent = t?.gloss || '';
    };
    for (const term of terms) {
      if (typeof term === 'string') { row.append(term); continue; }
      const [key, label, desc] = term, s = btn(label), item = {key, gloss: desc};
      s.setAttribute('aria-label', label + '. ' + desc);
      s.onfocus = () => { foc = item; show(); }; s.onblur = () => { foc = null; show(); };
      s.onpointerenter = () => { hov = item; show(); }; s.onpointerleave = () => { hov = null; show(); };
      row.append(s);
    }
    box.append(row, gloss);
  }

  function bpeLab(box, stream) {
    const field = el('label', 'Prompt', 'ml-field'), input = Object.assign(el('textarea'), {rows: 2, maxLength: 160, value: ' The café 🚀'});
    field.append(input);
    const presets = el('div', undefined, 'ml-presets');
    for (const [l, v] of [['café 🚀', ' The café 🚀'], ['Paris', ' Paris'], ['你好 東京', '你好 東京']]) {
      const b = btn(l); b.onclick = () => { input.value = v; update(); }; presets.append(b);
    }
    const result = el('div', undefined, 'ml-pieces'), steps = el('ol', undefined, 'ml-merges'), trace = el('details');
    trace.append(el('summary', 'Merge order'), steps);
    box.append(field, presets, result, trace);
    note(box, 'Fixed teaching vocabulary. ␠ marks a space. Labels below each piece are its local token ID.');
    let cursor, wire, status, buffered = true, bufToggle;
    function decode() {
      const s = streamPrefix(input.value, cursor.value, buffered);
      wire.textContent = s.prefix || '∅';
      status.textContent = s.corrupted ? 'Buffer OFF · split UTF-8 bytes corrupted into U+FFFD (\uFFFD) mid-SSE' :
        s.delivered ? 'Event delivered · ' + JSON.stringify(s.value) :
        s.pending ? s.pending + ' UTF-8 byte(s) buffered · waiting for the rest of the character' :
        'Waiting for the blank line that ends this SSE event';
    }
    if (stream) {
      cursor = slider(box, 'Bytes received', 0, 1, 0, decode);
      bufToggle = btn('Break: UTF-8 Stream Buffer Off', 'ml-break', false);
      bufToggle.onclick = () => {
        buffered = !buffered;
        bufToggle.setAttribute('aria-pressed', String(!buffered));
        bufToggle.textContent = buffered ? 'Break: UTF-8 Stream Buffer Off' : 'UTF-8 Buffer OFF (U+FFFD active) · Restore';
        if (!buffered) {
          const raw = enc.encode('data: ' + JSON.stringify({text: input.value}));
          const at = raw.findIndex(b => b >= 240); const fb = raw.findIndex(b => b >= 128);
          if (at >= 0 || fb >= 0) { cursor.input.value = String((at >= 0 ? at : fb) + 2); cursor.sync(); }
        }
        decode();
      };
      wire = el('pre', '', 'ml-wire'); status = el('div', '', 'ml-readout');
      box.append(bufToggle, wire, status);
    }
    function update() {
      const {ids, merges} = tokenize(input.value);
      result.replaceChildren(...ids.map(id => { const p = el('span', pieceLabel(pieces[id])); p.append(el('small', String(id))); return p; }));
      steps.replaceChildren(...merges.map(({left, right, id, count}) => el('li', pieceLabel(pieces[left]) + ' + ' + pieceLabel(pieces[right]) + ' → ' + pieceLabel(pieces[id]) + (count > 1 ? ' × ' + count : ''))));
      if (!merges.length) steps.append(el('li', 'No matching pair.'));
      if (stream) {
        const len = streamPrefix(input.value, 0, true).length; cursor.input.max = String(len);
        const mb = enc.encode('data: ' + JSON.stringify({text: input.value})).findIndex(b => b >= 128);
        cursor.input.value = String(mb < 0 ? len : mb + 1); cursor.sync(); decode();
      }
    }
    input.addEventListener('input', update); update();
  }

  function attentionLab(box) {
    const weights = attention(), fig = graphic(box, '0 0 294 148', 'Causal attention weights by query row and key column');
    const info = el('div', '', 'ml-readout'), controls = el('div', undefined, 'ml-tokens'), rows = [], btns = [];
    function select(i) {
      rows.forEach((r, j) => r.setAttribute('opacity', j === i ? '1' : '.46'));
      btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      info.textContent = 'Query “' + tokens[i] + '” · allowed weights sum to ' + weights[i].reduce((a, b) => a + b).toFixed(2);
    }
    tokens.forEach((word, i) => {
      const b = btn(word); b.onpointerenter = b.onfocus = b.onclick = () => select(i);
      controls.append(b); btns.push(b);
      svg('text', {x: 70 + i * 61, y: 13, 'data-mark': 'keys', 'text-anchor': 'middle'}, fig, word);
      const row = svg('g', {}, fig); rows.push(row); row.onpointerenter = () => select(i);
      svg('text', {x: 1, y: 42 + i * 31, 'data-mark': 'q'}, row, word);
      weights[i].forEach((w, j) => {
        const x = 42 + j * 61, y = 23 + i * 31;
        svg('rect', {x, y, width: 56, height: 27, rx: 3, class: j > i ? 'ml-masked' : 'ml-cell', opacity: j > i ? .32 : .12 + .7 * w, 'data-mark': j > i ? 'mask' : 'keys'}, row);
        svg('text', {x: x + 28, y: y + 18, 'text-anchor': 'middle'}, row, j > i ? '×' : w.toFixed(2));
      });
    });
    box.append(controls, info);
    eq(box, ['softmax(', ['q', 'q', 'The query asks which earlier tokens matter.'], ' · ', ['keys', 'Kᵀ', 'Each column scores the query against one key.'], ' / √d + ', ['mask', 'mask', 'Future positions receive zero probability.'], ')']);
    note(box, 'Four illustrative 2D query/key vectors. Choose a token to inspect its row.');
    select(2);
  }

  function ropeLab(box) {
    const m = slider(box, 'Query position m', 0, 24, 8, draw), n = slider(box, 'Key position n', 0, 24, 3, draw);
    const fig = graphic(box, '0 0 280 112', 'Query and key rotations at 15 degrees per position');
    svg('circle', {cx: 60, cy: 56, r: 43, class: 'ml-outline'}, fig);
    const lines = ['ml-vector', 'ml-key'].map(cls => svg('line', {x1: 60, y1: 56, class: cls, 'stroke-width': 3}, fig));
    const legend = svg('text', {x: 124, y: 48}, fig), dot = svg('text', {x: 124, y: 72}, fig);
    note(box, 'Solid ray = query. Dashed ray = key. Both start at (1, 0). Move both positions equally to preserve their dot product.');
    function draw() {
      const r = rope(m.value, n.value);
      [r.query, r.key].forEach((a, i) => setA(lines[i], {x2: 60 + 43 * Math.cos(a), y2: 56 - 43 * Math.sin(a)}));
      legend.textContent = 'θ(m − n) = ' + Math.round(r.phase * 180 / Math.PI) + '°';
      dot.textContent = 'q · k = ' + r.dot.toFixed(3);
    }
    draw();
  }

  function kvLab(box) {
    const ctl = slider(box, 'Context length', 12, 20, 16, update, n => fmt(2 ** n) + ' tokens');
    const table = el('table'), body = el('tbody'), info = el('div', '', 'ml-readout');
    table.append(body); box.append(table, info);
    note(box, 'Illustrative average layer, MiB per sequence. MHA/GQA use 128/8 KV heads, width 128, BF16. MLA uses 768 B/token. The hybrid estimate keeps 128 local tokens and fits its compressed slope to the published 1M ratio.');
    function update() {
      const v = kvFootprints(2 ** ctl.value);
      body.replaceChildren(...[['Full MHA', v.mha], ['GQA', v.gqa], ['V3.2 MLA', v.mla], ['V4 CSA + HCA', v.v4]].map(([name, bytes]) => {
        const tr = el('tr'); tr.append(el('th', name), el('td', fmt(+(bytes / 1048576).toFixed(2)) + ' MiB')); return tr;
      }));
      info.textContent = v.flopRatio ? 'Published at 1M · 10% KV cache · 27% single-token inference FLOPs vs V3.2' :
        'Estimated V4 cache · ' + (100 * v.v4 / v.mla).toFixed(1) + '% of MLA. Move to 1M for the published FLOP comparison.';
    }
    update();
  }

  const routing = {k: 6, bias: 1};
  function moeLab(box, options) {
    const count = slider(box, 'Routed experts K', 1, 8, routing.k, change);
    const bias = slider(box, 'Load correction', 0, 100, Math.round(routing.bias * 100), change, n => (n / 100).toFixed(2));
    const failBtn = btn('Break: Load-Bias Off (λ = 0)', 'ml-break', routing.bias === 0);
    box.append(failBtn);
    const fig = graphic(box, '0 0 278 138', '384 routed experts in a 24 by 16 bank with capacity drop meter');
    const cells = Array.from({length: 384}, (_, id) => svg('rect', {x: (id % 24) * 11.6 + 2, y: Math.floor(id / 24) * 7.6 + 2, width: 8, height: 4.5, rx: 1, class: 'ml-idle', 'data-eid': id}, fig));
    svg('rect', {x: 2, y: 126, width: 274, height: 7, rx: 2, class: 'ml-idle'}, fig);
    const capOk = svg('rect', {x: 2, y: 126, width: 274, height: 7, rx: 2, class: 'ml-active'}, fig);
    const capDrop = svg('rect', {x: 276, y: 126, width: 0, height: 7, rx: 2, class: 'ml-drop'}, fig);
    const weights = el('div', '', 'ml-weights'), info = el('div', '', 'ml-readout');
    box.append(weights, info);
    eq(box, [['top', 'top6', 'Six is the model default. K selects the highest corrected scores.'], ' → Σ ', ['gate', 'gⱼ', 'A taller cell and a longer bar mean a larger share of the routed output.'], ' · expertⱼ']);
    note(box, 'Illustrative affinities. When λ = 0 collapses routing onto hot experts under capacity factor C = 1.25, overflow tokens drop. Original affinities set the mix; the shared expert runs separately.');
    const setTrace = id => {
      box.classList.toggle('has-focus', id != null);
      cells.forEach((c, idx) => c.classList.toggle('is-traced', id === idx));
      weights.querySelectorAll('.ml-weight').forEach(r => r.classList.toggle('is-traced', Number(r.dataset.eid) === id));
    };
    function paint() {
      const entries = routeExperts(routing.k, routing.bias), cap = moeCapacity(routing.k, routing.bias), col = routing.bias < .05;
      failBtn.setAttribute('aria-pressed', String(col));
      failBtn.textContent = col ? 'Load-Bias OFF (λ = 0) · Restore balanced' : 'Break: Load-Bias Off (λ = 0)';
      cells.forEach(c => { setA(c, {class: 'ml-idle', height: '4.5'}); c.removeAttribute('data-mark'); });
      weights.replaceChildren();
      for (const {id, weight, hot} of entries) {
        const c = cells[id];
        setA(c, {class: col && hot ? 'ml-drop' : 'ml-active', 'data-mark': 'top gate', height: (3 + 4.4 * Math.sqrt(weight)).toFixed(2)});
        c.style.setProperty('--ml-weight', String(weight));
        const row = el('div', undefined, 'ml-weight' + (col && hot ? ' is-hot' : ''));
        row.dataset.eid = String(id); row.onpointerenter = () => setTrace(id); row.onpointerleave = () => setTrace(null);
        const bar = el('i'); bar.style.width = (weight * 100) + '%'; bar.dataset.mark = 'gate';
        row.append(el('span', 'E' + id), bar, el('span', (100 * weight).toFixed(1) + '%'));
        weights.append(row);
      }
      const okW = (cap.routed / cap.total) * 274;
      setA(capOk, {width: okW.toFixed(1)}); setA(capDrop, {x: (2 + okW).toFixed(1), width: (274 - okW).toFixed(1)});
      info.textContent = 'Σ gⱼ = ' + entries.reduce((s, e) => s + e.weight, 0).toFixed(2) + ' · busy experts ' + entries.filter(e => e.hot).length + '/' + entries.length +
        (cap.dropped ? '\nCapacity C=1.25 overflow · ' + cap.dropped + '/' + cap.total + ' token slots dropped (illustrative)' : ' · 0/' + cap.total + ' dropped');
      setTrace(null);
    }
    function change() {
      routing.k = count.value; routing.bias = bias.value / 100; paint();
      options.onRoute?.(routing.k, routing.bias);
      document.dispatchEvent(new CustomEvent('labroute', {detail: {...routing}}));
    }
    failBtn.onclick = () => { bias.input.value = routing.bias < .05 ? '100' : '0'; bias.sync(); change(); };
    box._refreshRoute = () => { count.input.value = String(routing.k); bias.input.value = String(Math.round(routing.bias * 100)); count.sync(); bias.sync(); paint(); };
    options.onRoute?.(routing.k, routing.bias); paint();
  }

  function cacheLab(box, options) {
    let edited = null;
    const bustBtn = btn('Break: Edit token 1 (95% → 0%)', 'ml-break', false), strip = el('div', undefined, 'ml-prefix');
    const fig = graphic(box, '0 0 292 64', 'Prefix KV cache hit ratio and illustrative time to first token');
    svg('text', {x: 2, y: 14}, fig, 'Prefix KV'); svg('rect', {x: 78, y: 4, width: 158, height: 12, rx: 2, class: 'ml-idle'}, fig);
    const hitBar = svg('rect', {x: 78, y: 4, width: 150, height: 12, rx: 2, class: 'ml-active'}, fig);
    const missBar = svg('rect', {x: 228, y: 4, width: 8, height: 12, rx: 2, class: 'ml-drop'}, fig);
    const hitLbl = svg('text', {x: 242, y: 14}, fig);
    svg('text', {x: 2, y: 46}, fig, 'TTFT'); svg('rect', {x: 78, y: 36, width: 158, height: 12, rx: 2, class: 'ml-idle'}, fig);
    const ttftBar = svg('rect', {x: 78, y: 36, width: 15, height: 12, rx: 2, class: 'ml-active'}, fig);
    const ttftLbl = svg('text', {x: 242, y: 46}, fig), info = el('div', '', 'ml-readout');
    box.append(bustBtn, strip, fig, info);
    note(box, 'Click any token to edit it. KV reuse stops at the first changed token (illustrative 16K-token prompt TTFT).');
    function paint() {
      const s = prefixCache(edited), wHit = Math.round(158 * s.hitRate);
      bustBtn.setAttribute('aria-pressed', String(edited != null));
      bustBtn.textContent = edited == null ? 'Break: Edit token 1 (95% → 0%)' : 'Restore warm prefix (95% hit)';
      strip.replaceChildren(...PREFIX_TOKENS.map((tok, i) => {
        const b = btn(i === edited ? tok + '*' : tok, undefined, i === edited);
        b.dataset.state = i === edited ? 'edited' : (i < s.matched ? 'warm' : 'cold');
        b.onclick = () => { edited = edited === i ? null : i; paint(); };
        return b;
      }));
      setA(hitBar, {width: wHit}); setA(missBar, {x: 78 + wHit, width: 158 - wHit});
      hitLbl.textContent = Math.round(s.hitRate * 100) + '%';
      setA(ttftBar, {width: Math.round(158 * (s.ttftMs / 1920)), class: s.hitRate < .5 ? 'ml-drop' : 'ml-active'});
      ttftLbl.textContent = s.ttftMs + 'ms';
      info.textContent = 'Prefix hit ' + Math.round(s.hitRate * 100) + '% (' + s.matched + '/' + s.total + ' blocks reused) · illustrative TTFT ' + s.ttftMs + ' ms' + (edited === 0 ? ' · full re-prefill triggered' : '');
      options.onPrefixCache?.(s.hitRate);
    }
    bustBtn.onclick = () => { edited = edited == null ? 0 : null; paint(); }; paint();
  }

  function pdLab(box, options) {
    let disagg = true;
    const toggle = btn('Break: PD-Disaggregation Off', 'ml-break', false);
    const fig = graphic(box, '0 0 296 106', 'Prefill and decode inter-token latency timeline'), info = el('div', '', 'ml-readout');
    box.append(toggle, fig, info);
    note(box, 'Illustrative timeline: isolated Prefill and Decode pools keep decode ITL steady (~18 ms) when a 64K prefill chunk arrives.');
    function paint() {
      const s = pdSchedule(disagg, 64);
      toggle.setAttribute('aria-pressed', String(!disagg));
      toggle.textContent = disagg ? 'Break: PD-Disaggregation Off' : 'PD-Disagg OFF (64K stall active) · Restore';
      fig.replaceChildren();
      svg('line', {x1: 68, y1: 88, x2: 288, y2: 88, class: 'ml-outline'}, fig);
      svg('text', {x: 68, y: 101}, fig, '0 ms'); svg('text', {x: 162, y: 101}, fig, 'time →'); svg('text', {x: 252, y: 101}, fig, '450 ms');
      if (disagg) {
        svg('text', {x: 2, y: 26}, fig, 'Prefill'); svg('rect', {x: 84, y: 12, width: 136, height: 18, rx: 2, class: 'ml-masked', opacity: '.35'}, fig);
        svg('text', {x: 152, y: 24, 'text-anchor': 'middle'}, fig, '64K chunk (320 ms)');
        svg('text', {x: 2, y: 64}, fig, 'Decode');
        for (let i = 0; i < 12; i++) svg('rect', {x: 72 + i * 17, y: 50, width: 7, height: 18, rx: 1.5, class: 'ml-active'}, fig);
      } else {
        svg('text', {x: 2, y: 45}, fig, 'Shared GPU');
        for (let i = 0; i < 2; i++) svg('rect', {x: 72 + i * 16, y: 31, width: 7, height: 18, rx: 1.5, class: 'ml-active'}, fig);
        svg('text', {x: 174, y: 20, 'text-anchor': 'middle'}, fig, '64K prefill chunk (320 ms)');
        svg('rect', {x: 106, y: 27, width: 136, height: 26, rx: 2, class: 'ml-drop'}, fig);
        for (let i = 0; i < 2; i++) svg('rect', {x: 248 + i * 16, y: 31, width: 7, height: 18, rx: 1.5, class: 'ml-active'}, fig);
        svg('path', {d: 'M106 58 V63 H248 V58', class: 'ml-nvlink'}, fig);
        svg('text', {x: 177, y: 78, 'text-anchor': 'middle'}, fig, 'ITL spike: ' + s.peakItlMs + ' ms');
      }
      info.textContent = disagg ? 'Isolated pools · decode ITL steady at ' + s.baseItlMs + ' ms while 64K prefill runs in parallel (illustrative)' :
        'Colocated GPU · 64K prefill chunk stalls concurrent decode ITL from ' + s.baseItlMs + ' ms → ' + s.peakItlMs + ' ms (illustrative)';
      options.onPDDisagg?.(disagg);
    }
    toggle.onclick = () => { disagg = !disagg; paint(); }; paint();
  }

  function roofLab(box) {
    const length = slider(box, 'Prompt length', 10, 17, 12, update, n => fmt(2 ** n) + ' tokens');
    const batch = slider(box, 'Batch size', 0, 10, 0, update, n => fmt(2 ** n));
    const epExp = slider(box, 'EP All-to-All group', 0, 6, 0, update, n => n === 0 ? '1 GPU (dense)' : fmt(2 ** n) + ' GPUs');
    const fig = graphic(box, '0 0 306 150', '3-bound Blackwell roofline: compute, HBM3e bandwidth, and NVLink EP All-to-All');
    const x = i => Math.max(40, Math.min(276, 40 + Math.log2(Math.max(1, i)) * 18.5));
    const y = pf => Math.max(12, Math.min(110, 108 - (Math.log2(Math.max(.008, pf)) + 7) * 7.8));
    const ridge = roofline(4096, 1).ridge;
    for (const pf of [.1, 1, 10]) svg('line', {x1: 40, x2: 278, y1: y(pf), y2: y(pf), class: 'ml-outline', opacity: '.16'}, fig);
    svg('path', {d: 'M40 12V111H278', class: 'ml-outline'}, fig);
    svg('path', {d: 'M40 ' + y(.008) + ' L' + x(ridge) + ' ' + y(10) + ' H278', class: 'ml-curve'}, fig);
    svg('line', {x1: x(ridge), x2: x(ridge), y1: y(10), y2: 111, class: 'ml-guide'}, fig);
    const nvLine = svg('line', {x1: 40, x2: 278, y1: y(10), y2: y(10), class: 'ml-nvlink', opacity: '0'}, fig);
    const nvLbl = svg('text', {x: 276, y: y(10) - 4, 'text-anchor': 'end', opacity: '0'}, fig);
    for (const [tx, ty, l] of [[2, 15, 'PF/s'], [44, 140, '1'], [138, 140, 'FLOP/byte →'], [245, 140, '4096'], [2, y(10) + 3, '10'], [1, y(.01) + 3, '.01'], [x(ridge) - 30, 124, '1,250']]) svg('text', {x: tx, y: ty}, fig, l);
    const prefill = svg('circle', {r: 5, class: 'ml-active'}, fig), decode = svg('rect', {width: 8, height: 8, class: 'ml-key'}, fig), info = el('div', '', 'ml-readout');
    box.append(info);
    note(box, 'Single GB200 GPU per GPU: dense FP4 10 PFLOP/s, HBM3e 8 TB/s, NVLink 5 900 GB/s unidirectional (1.8 TB/s bidirectional) per GPU. EP All-to-All ceiling is an illustrative top-6 BF16 dispatch/combine model.');
    function update() {
      const r = roofline(2 ** length.value, 2 ** batch.value, 2 ** epExp.value);
      setA(prefill, {cx: x(r.prefill.intensity), cy: y(r.prefill.pflops)});
      setA(decode, {x: x(r.decode.intensity) - 4, y: y(r.decode.pflops) - 4});
      if (r.nvlinkCeiling != null) {
        const ny = y(r.nvlinkCeiling);
        setA(nvLine, {y1: ny, y2: ny, opacity: '1'}); setA(nvLbl, {y: Math.max(22, ny - 4), opacity: '1'});
        nvLbl.textContent = 'NVLink EP ' + r.nvlinkCeiling.toFixed(1) + ' PF/s';
      } else { setA(nvLine, {opacity: '0'}); setA(nvLbl, {opacity: '0'}); }
      info.textContent = '● Prefill ' + r.prefill.intensity.toFixed(1) + ' FLOP/B · ' + r.prefill.pflops.toFixed(2) + ' PF/s · ' + r.prefill.bound +
        '\n□ Decode ' + r.decode.intensity.toFixed(1) + ' FLOP/B · ' + r.decode.pflops.toFixed(2) + ' PF/s · ' + r.decode.bound;
    }
    update();
  }

  function couplingLab(box, kind) {
    const fig = graphic(box, '0 0 280 105', kind === 'mix' ? 'Four residual streams pass through a mixing matrix' : 'Current and reference distributions for two possible tokens');
    if (kind === 'mix') {
      for (let i = 0; i < 4; i++) {
        const y = 16 + 24 * i; svg('text', {x: 0, y: y + 4}, fig, 'x' + (i + 1));
        for (const j of [i, (i + 1) % 4]) svg('path', {d: 'M24 ' + y + ' C110 ' + y + ' 170 ' + (16 + j * 24) + ' 248 ' + (16 + j * 24), class: 'ml-curve', opacity: i === j ? 1 : .5, 'data-mark': 'mix'}, fig);
        svg('text', {x: 252, y: y + 4}, fig, 'y' + (i + 1));
      }
      eq(box, ['Y = ', ['mix', 'mHC_mix', 'Each output mixes ¾ of its stream and ¼ from a neighbor. Every row and column sums to one.'], ' · X']);
    } else {
      const p = [.75, .25], ref = [.5, .5];
      for (let i = 0; i < 2; i++) {
        const base = 20 + i * 46; svg('text', {x: 3, y: base + 12}, fig, i ? 'B' : 'A');
        [p[i], ref[i]].forEach((v, j) => {
          svg('rect', {x: 25, y: base + j * 14, width: 220 * v, height: 10, class: j ? 'ml-masked' : 'ml-active', 'data-mark': 'kl'}, fig);
          svg('text', {x: 30 + 220 * v, y: base + j * 14 + 10}, fig, v.toFixed(2));
        });
      }
      eq(box, [['kl', 'KL', 'The penalty grows as the current policy departs from the reference distribution.'], '(π ∥ πref) = 0.131 nats']);
      note(box, 'Current policy above each reference bar. KL = Σ p log(p / pref).');
    }
  }

  const labs = {
    bpe: ['Trace a BPE merge', b => bpeLab(b, false)], stream: ['Step through the UTF-8 stream', b => bpeLab(b, true)],
    attention: ['Inspect causal attention', attentionLab], rope: ['Rotate a query and key', ropeLab],
    kv: ['Compare KV cache sizes', kvLab], moe: ['Adjust the expert router', moeLab],
    cache: ['Test prefix cache busting', cacheLab], pd: ['Test PD-disaggregation stalls', pdLab],
    roof: ['Explore the 3-bound GB200 roofline', roofLab],
    mix: ['Follow the four residual streams', b => couplingLab(b, 'mix')], kl: ['Inspect the KL penalty', b => couplingLab(b, 'kl')]
  };
  const components = {'MD-2a': ['attention', 'rope'], 'MD-2b': ['kv'], 'MD-2c': ['kv'], 'MD-2d': ['attention', 'rope'], 'MD-2g': ['moe'], 'MD-2h': ['moe'], 'IN-12': ['cache', 'pd']};
  function dock(parent, names = [], options = {}) {
    for (const name of names) {
      const details = el('details', undefined, 'micro-lab'); details.dataset.lab = name;
      details.append(el('summary', labs[name][0]));
      details.addEventListener('toggle', () => {
        if (!details.open) return;
        let body = details.querySelector('.ml-body');
        if (!body) { body = el('div', undefined, 'ml-body'); details.append(body); labs[name][1](body, options); }
        else body._refreshRoute?.();
      });
      parent.append(details);
    }
  }
  const routerCenter = id => [170 + id % 24 * 11.2, 581 + Math.floor(id / 24) * 6];
  function routerDrawing(base, caption) {
    const group = svg('g', {'data-router-drawing': ''}, base), bank = svg('g', {}, group);
    const x = id => routerCenter(id)[0] - 4, y = id => routerCenter(id)[1] - 2;
    for (let id = 0; id < 384; id++) svg('rect', {x: x(id), y: y(id), width: 8, height: 4.4, rx: 1, fill: 'rgba(255,255,255,.16)'}, bank);
    const selected = svg('g', {}, group), paths = svg('g', {}, group), experts = svg('g', {}, group);
    function refresh() {
      selected.replaceChildren(); paths.replaceChildren(); experts.replaceChildren();
      const entries = routeExperts(routing.k, routing.bias);
      caption.textContent = 'top-' + entries.length + ' of 384';
      entries.forEach(({id, weight}, j) => {
        const mid = 228 + (j + .5) * 207 / entries.length, w = Math.min(26, 175 / entries.length), h = 40 * weight;
        svg('rect', {x: x(id), y: y(id) - weight * 4, width: 8, height: 4.4 + weight * 4, fill: '#ffd277', stroke: '#fff3c7', 'stroke-width': .5, 'data-expert': id, 'data-weight': weight}, selected);
        svg('path', {d: 'M' + (x(id) + 4) + ' ' + y(id) + ' L' + mid + ' 544', fill: 'none', stroke: '#ffd277', 'stroke-width': .45 + 8 * weight}, paths);
        svg('rect', {x: mid - w / 2, y: 500, width: w, height: 44, rx: 3, class: 'ln'}, experts);
        svg('rect', {x: mid - w / 2 + 2, y: 542 - h, width: w - 4, height: h, fill: '#ffd277'}, experts);
        svg('path', {d: 'M' + mid + ' 500 L300 476', class: 'ln faint'}, experts);
      });
    }
    group.refreshRouting = refresh; refresh();
    return (take, mix) => { selected.setAttribute('opacity', take); paths.setAttribute('opacity', mix); experts.setAttribute('opacity', .4 + .6 * take); };
  }
  document.addEventListener('labroute', () => {
    document.querySelectorAll('[data-router-drawing]').forEach(g => g.refreshRouting());
    document.querySelectorAll('.micro-lab[open] .ml-body').forEach(b => b._refreshRoute?.());
  });
  function reveal(root, name) {
    if (!Object.hasOwn(labs, name)) return;
    const lab = root.querySelector('[data-lab="' + name + '"]');
    if (!lab) return;
    for (let n = lab; n; n = n.parentElement) if (n.tagName === 'DETAILS') n.open = true;
    requestAnimationFrame(() => lab.querySelector('summary').scrollIntoView({block: 'center', behavior: 'instant'}));
  }
  window.MicroLabs = Object.freeze({...core, dock, components, routing, routerDrawing, routerCenter, reveal});
})();
