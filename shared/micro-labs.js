/* Classic script so the same calculations run from file:// and node --test. */
(function () {
  'use strict';
  const enc = new TextEncoder();
  const bytesOf = t => Array.from(enc.encode(t));
  const fmt = n => n.toLocaleString('en-US');
  const hex = b => b.toString(16).toUpperCase().padStart(2, '0');

  const rules = [], pairs = new Map(), pieces = Array.from({length: 256}, (_, i) => [i]);
  // The lesson's words come first, so their demo IDs stay fixed. Then about 200 common English words (with
  // their leading space) and suffixes, so typed text merges into whole words or subwords instead of single
  // bytes; anything rarer still falls back to smaller pieces, as real BPE does.
  const common = ('the a an and or of to is it its on at as by for from with you your we they he she I my me this that these ' +
    'what which who how why when where can could will would should do does did not no yes all some any more most many much ' +
    'one two three new good nice great small big first last next time day today tomorrow week year people world city weather ' +
    'rain sun sunny cold hot warm London Tokyo France model models token tokens text word words language large data train ' +
    'training learn learning AI computer code function return question answer hello thanks please like love make made go going ' +
    'get know think see look use used work works help tell write read run need want here there now then just very so but if ' +
    'because about after before over under up down out into also only again').split(' ').map(w => ' ' + w);
  const starts = 'What How Why When Where Is Can Do It This We You My Hello I A'.split(' ');
  const suffixes = 'ing ed er ers ly tion s es ment ness able al ive ize ful less est un re'.split(' ');
  // Like a trained BPE's earliest merges: a leading space joins every letter, then frequent English pairs and
  // triples, so a name the list lacks (' Montreal') splits into a few chunks, not one piece per byte.
  const letters = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c => ' ' + c);
  const pairs2 = ('th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ' +
    'ne ea ra ce li ch ll be ma si om ur ion ent and ing her ter con res ver all ons nce men ted ers pro are ess ive was ect rea ' +
    'com per int est sta ica ist ear ain one our rat').split(' ');
  const lesson = [' The', 'The', ' café', ' café!', ' sat', ' cat', ' Paris', 'the', '🚀', '你好', '東京', 'is', ' in'];
  for (const w of [...lesson, ...letters, ...pairs2, ...suffixes, ...common, ...starts]) {
    // Added words chain the pieces the rules so far already make, so each still ends as one token.
    const b = lesson.includes(w) ? bytesOf(w) : tokenize(w).ids; let left = b[0];
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
    const loads = Array(384).fill(0); let total = 0, hot = 0;
    for (let t = 0; t < batchTokens; t++) for (const e of routeExperts(k, bias, t)) {
      loads[e.id]++; total++; if (e.hot) hot++;
    }
    const capPerExpert = Math.max(1, Math.ceil(total * cf / loads.length));
    const dropped = loads.reduce((n, load) => n + Math.max(0, load - capPerExpert), 0);
    return {total, routed: total - dropped, dropped, hotShare: total ? hot / total : 0, capPerExpert, loads};
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
    const baseItlMs = 18, prefillChunkMs = Math.round(chunkK * 5), prefillStartMs = 36;
    const stallMs = disaggregated ? 0 : prefillChunkMs;
    const decodeTimesMs = Array.from({length: 26}, (_, i) => i * baseItlMs + (i >= 2 ? stallMs : 0)).filter(t => t <= 450);
    return {disaggregated, chunkK, baseItlMs, prefillChunkMs, prefillStartMs, decodeTimesMs, peakItlMs: baseItlMs + stallMs, stallMs};
  }
  function roofline(prompt, batch, ep = 1) {
    const d = 7168, m = 3072, k = 6, bw = 8e12, nvUni = 900e9;
    const epGroup = Math.max(1, Math.round(ep)), remote = epGroup > 1 ? (epGroup - 1) / epGroup : 0;
    if (384 % epGroup) throw new RangeError('EP group must divide 384');
    // EP: balanced per-GPU top-6 SwiGLU work; dense: one square GEMM.
    const peak = remote ? 5e15 : 10e15, ridge = peak / bw;
    function pt(rows) {
      const flops = remote ? 6 * k * d * m * rows : 2 * d * d * rows;
      const weights = remote ? 3 * d * m * Math.min(384 / epGroup, rows * k) : d * d;
      const hbmBytes = .5 * weights + 4 * d * rows * (remote ? k : 1), intensity = flops / hbmBytes, hbmCap = bw * intensity;
      const nvBytes = rows * k * d * 4 * remote, nvCap = nvBytes ? flops / nvBytes * nvUni : Infinity;
      const att = Math.min(peak, hbmCap, nvCap);
      const bound = att === nvCap && nvCap < Math.min(peak, hbmCap) ? 'NVLink EP All-to-All' : intensity >= ridge ? 'compute' : 'HBM bandwidth';
      return {flops, hbmBytes, nvBytes, intensity, pflops: att / 1e15, bound};
    }
    const nvlinkCeiling = remote ? Math.min(peak, 1.5 * m / remote * nvUni) / 1e15 : null;
    return {ridge, ep: epGroup, peakPflops: peak / 1e15, nvlinkCeiling, prefill: pt(prompt * batch), decode: pt(batch)};
  }
  // GB200 figures for the residency and sharding read-outs (NVIDIA GB200 NVL72 spec and multi-node tuning guide).
  // Grace's LPDDR5X (512 GB/s) is shared by the superchip's two GPUs over one 900 GB/s NVLink-C2C, so a GPU
  // fetching while its sibling does gets 256 GB/s. Recompute uses the roofline's assumed 5 PF/s and V4-Pro's
  // 49B active parameters, linear FLOPs only (attention excluded), so it is a lower bound on recompute time.
  const GB200 = {hbm: 8e12, host: 256e9, nvlink: 900e9, pflops: 5e15, active: 49e9, layers: 61};
  function kvTiers(len) {
    const bytes = kvFootprints(len).v4 * GB200.layers, recomputeS = 2 * GB200.active * len / GB200.pflops;
    return {bytes, perToken: bytes / len, hbmS: bytes / GB200.hbm, hostS: bytes / GB200.host, recomputeS,
      breakEvenPerToken: 2 * GB200.active / GB200.pflops * GB200.host};
  }
  // NVLink bytes per GPU per decode step, all 61 layers: two BF16 ring all-reduces per layer for tensor
  // parallelism (attention output, shared expert) and top-6 BF16 dispatch + combine for expert parallelism.
  function shardComm(batch, tp = 1, ep = 1) {
    const d = 7168, k = 6, L = GB200.layers;
    const tpBytes = L * 2 * (2 * (tp - 1) / tp) * batch * d * 2, epBytes = L * batch * k * d * 4 * (ep > 1 ? (ep - 1) / ep : 0);
    const s = (tpBytes + epBytes) / GB200.nvlink;
    return {tpBytes, epBytes, tpUs: tpBytes / GB200.nvlink * 1e6, epUs: epBytes / GB200.nvlink * 1e6, stepsPerS: s ? 1 / s : Infinity};
  }
  const stopLabs = {3: ['bpe'], 4: ['bpe'], 11: ['kl'], 14: ['attention', 'rope'], 15: ['kv'],
    16: ['mix'], 17: ['moe'], 23: ['pd'], 24: ['roof'], 25: ['roof'], 26: ['stream'], 30: ['cache']};
  // Observatory cards. Each concept's components (concept-map.js `obs`) carry its Break lab.
  const components = {'MD-2a': ['attention', 'rope'], 'MD-2b': ['kv'], 'MD-2c': ['kv'], 'MD-2d': ['attention', 'rope'], 'MD-2g': ['moe'], 'MD-2h': ['moe'],
    'IN-5': ['pd'], 'IN-6': ['pd'], 'IN-7': ['pd'], 'IN-9': ['stream'], 'IN-10': ['stream'], 'IN-11': ['cache'], 'IN-12': ['cache', 'pd']};
  const core = {tokenize, pieces, rules, pieceLabel, streamPrefix, attention, rope, kvFootprints, kvTiers, shardComm, GB200, maxContext,
    routeExperts, moeCapacity, prefixCache, PREFIX_TOKENS, pdSchedule, roofline, storyStops: stopLabs, tourStops: stopLabs, components};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const btn = (text, cls, pressed) => { const b = el('button', text, cls); b.type = 'button'; if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed)); return b; };
  const setA = (n, p) => { for (const [k, v] of Object.entries(p)) n.setAttribute(k, String(v)); return n; };
  const svg = (tag, p, parent, txt) => { const n = setA(document.createElementNS('http://www.w3.org/2000/svg', tag), p); if (txt !== undefined) n.textContent = txt; parent.append(n); return n; };
  const graphic = (box, viewBox, label) => svg('svg', {viewBox, role: 'img', 'aria-label': label, class: 'ml-graphic'}, box);
  const note = (box, text) => { const p = el('p', text, 'ml-note'); box.append(p); return p; };
  const readout = () => setA(el('div', '', 'ml-readout'), {role: 'status'});
  // Predict first: an optional, collapsed strip above a Break toggle. A choice runs the Break and explains what
  // the lab now shows; the Break button stays one click away. Completion is kept when storage is allowed.
  const POE_KEY = 'ot-poe-v1';
  const poeSeen = () => { try { return JSON.parse(localStorage.getItem(POE_KEY) || '{}'); } catch { return {}; } };
  function poe(key, question, choices, correct, explain, run) {
    const d = el('details', undefined, 'ml-poe'), out = setA(el('p', '', 'ml-poe-out'), {role: 'status'});
    const opts = setA(el('div', undefined, 'ml-presets'), {role: 'group', 'aria-label': 'Your prediction'});
    d.append(el('summary', poeSeen()[key] ? 'Predict first · tried' : 'Predict first (optional)'), el('p', question), opts, out);
    choices.forEach((c, i) => {
      const b = btn(c, undefined, false);
      b.onclick = () => {
        [...opts.children].forEach(o => o.setAttribute('aria-pressed', String(o === b)));
        run();
        out.textContent = (i === correct ? 'Yes. ' : 'Not quite. ') + explain();
        try { localStorage.setItem(POE_KEY, JSON.stringify({...poeSeen(), [key]: i === correct ? 'right' : 'tried'})); } catch { /* private mode or file:// */ }
      };
      opts.append(b);
    });
    return d;
  }
  /* ---- Change feedback: one helper drives every lab -------------------------------------------
     flash(el) adds .is-changed (CSS: an eased orange pulse that settles to the element's own state;
     under prefers-reduced-motion or html.rm it is a static orange highlight). setValue() tweens old -> new
     numbers. live(root) watches a lab and flashes whatever changed, so no lab needs its own hack. */
  const FLASH_MS = 650, TWEEN_MS = 450, NUM = /\d[\d,]*(?:\.\d+)?/g;
  const reducedMotion = () => document.documentElement.classList.contains('rm') ||
    !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function flashAll(nodes) {
    const list = [...new Set(nodes)].filter(n => n && n.classList);
    for (const n of list) { clearTimeout(n._mlFlash); n.classList.remove('is-changed'); }
    if (list.length) void document.documentElement.offsetWidth; // one reflow restarts every animation
    for (const n of list) {
      n.classList.add('is-changed');
      n._mlFlash = setTimeout(() => n.classList.remove('is-changed'), reducedMotion() ? 700 : FLASH_MS + 60);
    }
    return list;
  }
  const flash = node => { flashAll([node]); return node; };
  function setValue(node, value) {
    const text = String(value), from = node.textContent;
    cancelAnimationFrame(node._mlRaf);
    if (from === text) { node._mlTween = false; return false; }
    const a = from.match(NUM), b = text.match(NUM);
    const plain = !from || reducedMotion() || node.tagName === 'OUTPUT' || !node.isConnected || !a || !b ||
      a.length !== b.length || from.replace(NUM, '#') !== text.replace(NUM, '#');
    if (plain) { node._mlTween = false; node.textContent = text; if (from) flash(node); return true; }
    const num = s => parseFloat(s.replaceAll(',', '')), start = a.map(num), end = b.map(num);
    const t0 = performance.now(); node._mlTween = true; flash(node);
    const step = now => {
      const k = Math.min(1, (now - t0) / TWEEN_MS), e = 1 - (1 - k) ** 3; let i = 0;
      node.textContent = k >= 1 ? text : text.replace(NUM, m => {
        const digits = (m.split('.')[1] || '').length, v = (start[i] + (end[i] - start[i]) * e).toFixed(digits); i++;
        return m.includes(',') ? Number(v).toLocaleString('en-US', {minimumFractionDigits: digits}) : v;
      });
      if (k < 1) node._mlRaf = requestAnimationFrame(step); else node._mlTween = false;
    };
    node._mlRaf = requestAnimationFrame(step);
    return true;
  }
  const LIVE_TEXT = '.ml-value,.ml-readout,.ml-wire,.ml-num,.ml-weights span,svg text,output,.learning-equation strong,.learning-handover-readout strong,.math-caption,[data-percent],[data-layer]';
  const LIVE_ATTR = ['aria-pressed', 'aria-checked', 'width', 'height', 'x', 'y', 'cx', 'cy', 'x2', 'y2', 'd'];
  function live(root) {
    if (!root || root._mlLive) return root;
    root._mlLive = true;
    new MutationObserver(records => {
      const hits = [];
      for (const r of records) {
        const t = r.target.nodeType === 3 ? r.target.parentElement : r.target;
        if (!t || t._mlTween) continue;
        if (r.type === 'attributes') {
          const now = t.getAttribute(r.attributeName);
          if (now === r.oldValue) continue;
          if (r.attributeName.startsWith('aria-') ? now === 'true' : t.hasAttribute('data-live')) hits.push(t);
        } else if (t.matches?.(LIVE_TEXT)) {
          const was = r.type === 'characterData' ? r.oldValue : [...r.removedNodes].map(n => n.textContent).join('');
          if ((r.type === 'characterData' || r.removedNodes.length) && was !== t.textContent) hits.push(t);
        }
      }
      flashAll(hits);
    }).observe(root, {subtree: true, childList: true, characterData: true, characterDataOldValue: true,
      attributes: true, attributeOldValue: true, attributeFilter: LIVE_ATTR});
    return root;
  }
  /* "Try this" prompt first, "Why it matters" last: the same two plain lines on every lab. */
  function intro(body, tryText, whyText) {
    if (tryText) { const p = el('p', undefined, 'ml-try'); p.append(el('b', 'Try this'), ' ' + tryText); body.prepend(p); }
    if (whyText) { const p = el('p', undefined, 'ml-why'); p.append(el('b', 'Why it matters'), ' ' + whyText); body.append(p); }
  }
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
      if (typeof term === 'string' || term instanceof Node) { row.append(term); continue; }
      const [key, label, desc] = term, s = btn(label), item = {key, gloss: desc};
      s.setAttribute('aria-label', label + '. ' + desc);
      s.onfocus = () => { foc = item; show(); }; s.onblur = () => { foc = null; show(); };
      s.onpointerenter = () => { hov = item; show(); }; s.onpointerleave = () => { hov = null; show(); };
      row.append(s);
    }
    box.append(row, gloss);
  }

  function bpeLab(box, stream) {
    // The tokenizer lab opens on the lesson's own sentence; the UTF-8 lab keeps the emoji and CJK examples.
    const start = stream ? ' The café 🚀' : 'is in Paris.';
    const field = el('label', 'Prompt', 'ml-field'), input = Object.assign(el('textarea'), {rows: 2, maxLength: 160, value: start});
    field.append(input);
    const presets = el('div', undefined, 'ml-presets');
    const samples = stream
      ? [['café 🚀', ' The café 🚀'], ['你好 東京', '你好 東京'], ['🚀 alone', '🚀']]
      : [['is in Paris.', 'is in Paris.'], [' Paris', ' Paris'], ['the cat sat', 'the cat sat']];
    for (const [l, v] of samples) {
      const b = btn(l); b.onclick = () => { input.value = v; update(); }; presets.append(b);
    }
    const result = el('div', undefined, 'ml-pieces'), tally = el('div', undefined, 'ml-readout'), steps = el('ol', undefined, 'ml-merges'), trace = el('details', undefined, 'ml-trace');
    trace.append(el('summary', 'Show merge order'), steps);
    box.append(field, presets, result, tally, trace);
    const vocab = note(box, 'Demo vocabulary: about 200 common English words and suffixes, with IDs that differ from the main story. Rarer text splits into smaller pieces or single bytes, as real BPE does. ␠ marks a space; the label under each piece is its demo token ID.');
    vocab?.classList?.add('ml-demo-vocab');
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
      bufToggle = btn('UTF-8 buffer: On', 'ml-break ml-switch', false);
      bufToggle.setAttribute('role', 'switch');
      bufToggle.setAttribute('aria-checked', 'true');
      bufToggle.removeAttribute('aria-pressed');
      bufToggle.onclick = () => {
        buffered = !buffered;
        bufToggle.setAttribute('aria-checked', String(buffered));
        bufToggle.textContent = buffered ? 'UTF-8 buffer: On' : 'UTF-8 buffer: Off';
        bufToggle.classList.toggle('is-off', !buffered);
        // Land one byte into the first multi-byte character, so any length (é is 2 bytes, 🙂 is 4) is cut mid-way.
        if (!buffered && !streamPrefix(input.value, cursor.value).pending) {
          const first = enc.encode('data: ' + JSON.stringify({text: input.value})).findIndex(b => b >= 128);
          if (first >= 0) { cursor.input.value = String(first + 1); cursor.sync(); }
        }
        decode();
      };
      wire = el('pre', '', 'ml-wire'); status = readout();
      box.append(poe('stream', 'A network chunk ends halfway through a multi-byte character. With the UTF-8 buffer off, what does the reader see?',
        ['The character, a moment late', 'A replacement character (\uFFFD)', 'Nothing until the stream ends'], 1,
        () => streamPrefix(input.value, cursor.value, false).corrupted ? 'Each chunk is decoded on its own, so the split bytes become U+FFFD; the buffer would hold them until the rest arrives.' :
          'This text has no multi-byte character to split. Type é or 🙂 and try again.',
        () => { if (buffered) bufToggle.onclick(); }), bufToggle, wire, status);
    }
    let prevIds = null;
    function update() {
      const {ids, merges} = tokenize(input.value);
      const spans = ids.map(id => { const p = el('span', pieceLabel(pieces[id])); p.append(el('small', String(id))); return p; });
      result.replaceChildren(...spans);
      if (prevIds) flashAll(spans.filter((_, i) => prevIds[i] !== ids[i])); // only the pieces that changed pulse
      prevIds = ids;
      [...presets.children].forEach((b, i) => b.setAttribute('aria-pressed', String(samples[i][1] === input.value)));
      setValue(tally, ids.length + ' token' + (ids.length === 1 ? '' : 's') + ' from ' + bytesOf(input.value).length + ' bytes');
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
    const info = el('div', '', 'ml-readout'), controls = el('div', undefined, 'ml-tokens'), rows = [], btns = [], chips = [];
    const ring = svg('rect', {x: 39, width: 250, height: 29, rx: 4, class: 'ml-ring'}, fig);
    function select(i) {
      rows.forEach((r, j) => r.setAttribute('opacity', j === i ? '1' : '.46'));
      chips.forEach(([c, t], j) => { c.classList.toggle('ml-sel', j === i); t.classList.toggle('ml-on-sel', j === i); });
      setA(ring, {y: 22 + i * 31});
      btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      info.textContent = 'Query “' + tokens[i] + '” · allowed weights sum to ' + weights[i].reduce((a, b) => a + b).toFixed(2);
    }
    tokens.forEach((word, i) => {
      const b = btn(word); b.onpointerenter = b.onfocus = b.onclick = () => select(i);
      controls.append(b); btns.push(b);
      svg('text', {x: 70 + i * 61, y: 13, 'data-mark': 'keys', 'text-anchor': 'middle'}, fig, word);
      const row = svg('g', {}, fig); rows.push(row); row.onpointerenter = () => select(i);
      const chip = svg('rect', {x: 0, y: 29 + i * 31, width: 38, height: 17, rx: 3, class: 'ml-chip'}, row);
      chips.push([chip, svg('text', {x: 3, y: 42 + i * 31, 'data-mark': 'q'}, row, word)]);
      weights[i].forEach((w, j) => {
        const x = 42 + j * 61, y = 23 + i * 31;
        svg('rect', {x, y, width: 56, height: 27, rx: 3, class: j > i ? 'ml-masked' : 'ml-cell', opacity: j > i ? .32 : .12 + .7 * w, 'data-mark': j > i ? 'mask' : 'keys'}, row);
        svg('text', {x: x + 28, y: y + 18, 'text-anchor': 'middle'}, row, j > i ? '×' : w.toFixed(2));
      });
    });
    box.append(controls, info);
    eq(box, ['softmax(', ['q', 'q', 'The query asks which earlier tokens matter.'], ' · ', ['keys', 'Kᵀ', 'Each column scores the query against one key.'], ' / √d + ', ['mask', 'mask', 'Future positions receive zero probability.'], ')']);
    note(box, 'Four illustrative 2D query/key vectors. Choose a token to inspect its row.');
    fig.append(ring); // draw the orange ring above the cells
    select(2);
  }

  function ropeLab(box) {
    const m = slider(box, 'Query position m', 0, 24, 8, draw), n = slider(box, 'Key position n', 0, 24, 3, draw);
    const fig = graphic(box, '0 0 280 112', 'Query and key rotations at 15 degrees per position');
    svg('circle', {cx: 60, cy: 56, r: 43, class: 'ml-outline'}, fig);
    const lines = ['ml-vector', 'ml-key'].map(cls => svg('line', {x1: 60, y1: 56, class: cls, 'stroke-width': 3, 'data-live': ''}, fig));
    const legend = svg('text', {x: 124, y: 48}, fig), dot = svg('text', {x: 124, y: 72}, fig);
    note(box, 'Solid ray = query. Dashed ray = key. Both start at (1, 0). Move both positions equally to preserve their dot product.');
    function draw() {
      const r = rope(m.value, n.value);
      [r.query, r.key].forEach((a, i) => setA(lines[i], {x2: 60 + 43 * Math.cos(a), y2: 56 - 43 * Math.sin(a)}));
      setValue(legend, 'θ(m − n) = ' + Math.round(r.phase * 180 / Math.PI) + '°');
      setValue(dot, 'q · k = ' + r.dot.toFixed(3));
    }
    draw();
  }

  const secs = s => s < 1e-3 ? (s * 1e6).toFixed(0) + ' µs' : s < 1 ? (s * 1e3).toFixed(1) + ' ms' : s.toFixed(1) + ' s';
  function residency(len) {
    const t = kvTiers(len);
    return '\nWhole request, ' + GB200.layers + ' layers: ' + (t.bytes / 1e9).toFixed(2) + ' GB · HBM3e read ' + secs(t.hbmS) + ' · Grace fetch ' + secs(t.hostS) + ' · recompute ≥ ' + secs(t.recomputeS) +
      '\nFetching wins while KV stays under ' + (t.breakEvenPerToken / 1e6).toFixed(1) + ' MB/token; V4 is ' + (t.perToken / 1e3).toFixed(1) + ' KB/token here';
  }
  function kvLab(box) {
    const ctl = slider(box, 'Context length', 12, 20, 16, update, n => fmt(2 ** n) + ' tokens');
    const fig = graphic(box, '0 0 296 92', 'Log-scaled KV cache footprint per sequence across MHA, GQA, MLA, and V4 hybrid');
    const bars = ['Full MHA', 'GQA (8 KV)', 'MLA latent', 'V4 hybrid'].map((lbl, i) => {
      const y = 6 + i * 21;
      svg('text', {x: 2, y: y + 11}, fig, lbl);
      svg('rect', {x: 82, y, width: 150, height: 13, rx: 2, class: 'ml-idle'}, fig);
      const fill = svg('rect', {x: 82, y, width: 10, height: 13, rx: 2, class: i === 0 ? 'ml-drop' : 'ml-active', 'data-live': ''}, fig);
      const win = i === 3 ? svg('rect', {x: 82, y, width: 4, height: 13, rx: 2, class: 'ml-masked', opacity: '.55'}, fig) : null;
      const val = svg('text', {x: 238, y: y + 11}, fig);
      return {fill, win, val};
    });
    const table = el('table'), body = el('tbody'), info = el('div', '', 'ml-readout');
    const cells = ['Full MHA', 'GQA', 'MLA toy baseline', 'V4 fitted estimate'].map(name => {
      const tr = el('tr'), td = el('td'); tr.append(el('th', name), td); body.append(tr); return td;
    });
    table.append(body); box.append(table, info);
    const src = el('a', 'NVIDIA GB200 NVL72 specifications'); src.href = 'https://www.nvidia.com/en-us/data-center/gb200-nvl72/';
    const tiers = el('p', 'Where the cache lives: HBM3e is 8 TB/s per GPU. Grace’s LPDDR5X (512 GB/s) serves the superchip’s two GPUs over one 900 GB/s NVLink-C2C link, so 256 GB/s each. Recompute re-prefills at the roofline’s assumed 5 PF/s with 49B active parameters, attention excluded, so it is a lower bound. ', 'ml-note'); tiers.append(src); box.append(tiers);
    note(box, 'Illustrative average layer, MiB/sequence (log₂ bar scale). MHA/GQA: 128/8 KV heads, width 128, BF16. MLA toy baseline: 768 B/token, excluding metadata. The hybrid curve keeps 128 local tokens and fits the reported 1M ratio; it is not a V4 memory simulator.');
    function update() {
      const len = 2 ** ctl.value, v = kvFootprints(len);
      const rows = [['Full MHA', v.mha], ['GQA', v.gqa], ['MLA toy baseline', v.mla], ['V4 fitted estimate', v.v4]];
      const wOf = b => Math.max(3, Math.min(150, Math.round((Math.log2(Math.max(.125, b / 1048576)) + 3) * 9.8)));
      rows.forEach(([name, bytes], i) => {
        const w = wOf(bytes), mib = +(bytes / 1048576).toFixed(2);
        setA(bars[i].fill, {width: w});
        if (bars[i].win) setA(bars[i].win, {width: Math.max(2, Math.round(w * Math.min(1, (Math.min(len, 128) * 768) / bytes)))});
        setValue(bars[i].val, (mib >= 100 ? Math.round(mib) : mib) + ' MiB');
        setValue(cells[i], fmt(+(bytes / 1048576).toFixed(2)) + ' MiB');
      });
      info.textContent = (v.flopRatio ? 'Reported at 1M · 10% KV cache · 27% single-token FP8-equivalent FLOPs vs V3.2' :
        'Estimated V4 cache · ' + (100 * v.v4 / v.mla).toFixed(1) + '% of MLA. Move to 1M for the published FLOP comparison.') + residency(len);
    }
    update();
  }

  // Measured routing from a smaller open MoE (shared/real-traces.js), beside the V4-Pro simulation, never mixed with it.
  function realTrace(box, sim, T) {
    const st = {p: 0, t: 0, l: 0}, cols = Math.ceil(Math.sqrt(T.numRouted));
    const src = setA(el('div', undefined, 'ml-presets ml-source'), {role: 'group', 'aria-label': 'Router data'});
    const bSim = btn('Simulated · V4-Pro · 384 experts', undefined, true);
    const bReal = btn('Real trace · ' + T.modelId.split('/').pop() + ' · ' + T.numRouted + ' experts', undefined, false);
    const real = el('div', undefined, 'ml-real');
    real.hidden = true; src.append(bSim, bReal); box.append(src, sim, real);
    const show = on => {
      sim.hidden = on; real.hidden = !on;
      bSim.setAttribute('aria-pressed', String(!on)); bReal.setAttribute('aria-pressed', String(on));
      if (on) paint();
    };
    bSim.onclick = () => show(false); bReal.onclick = () => show(true);
    const pick = (label, items, key) => {
      const s = el('select'), l = el('label', label + ' ', 'ml-pick');
      items.forEach((x, i) => { const o = el('option', x); o.value = String(i); s.append(o); });
      s.onchange = () => { st[key] = Number(s.value); if (key === 'p') { st.t = 0; tokens(); } paint(); };
      l.append(s); real.append(l);
    };
    pick('Prompt', T.prompts.map(p => p.text), 'p');
    pick('Layer', T.layers.map(n => (n + 1) + ' of ' + T.numLayers), 'l');
    const toks = setA(el('div', undefined, 'ml-presets'), {role: 'group', 'aria-label': 'Token'});
    real.append(toks);
    const fig = graphic(real, '0 0 278 92', T.numRouted + ' routed experts in an ' + cols + '-column grid, plus ' + T.numShared + ' shared experts on the right');
    const cells = Array.from({length: T.numRouted}, (_, id) =>
      svg('rect', {x: (id % cols) * 28 + 2, y: Math.floor(id / cols) * 11 + 2, width: 24, height: 8, rx: 1.5, class: 'ml-idle'}, fig));
    for (let i = 0; i < T.numShared; i++) svg('rect', {x: 234, y: 2 + i * 44, width: 42, height: 40, rx: 3, class: 'ml-active'}, fig);
    const weights = el('div', '', 'ml-weights'), info = setA(el('div', '', 'ml-readout'), {role: 'status'});
    real.append(weights, info);
    note(real, 'Measured, not simulated: ' + T.modelId + ' @ ' + T.revision.slice(0, 7) + ', extracted ' + T.extractedAt + '. ' +
      T.numRouted + ' routed experts' + (T.numShared ? ' + ' + T.numShared + ' shared (always on, right)' : '') + ', top-' + T.topK +
      '. A smaller open model, not DeepSeek-V4-Pro’s 384-expert router.').classList.add('ml-prov');
    function tokens() {
      toks.replaceChildren(...T.prompts[st.p].tokens.map((t, i) => {
        const b = btn(t.replace(/^ /, '␣'), undefined, i === st.t);
        b.onclick = () => { st.t = i; paint(); };
        return b;
      }));
    }
    let prev = new Set();
    function paint() {
      const r = T.prompts[st.p].routes[st.t][st.l], load = T.load[st.l], fresh = [];
      [...toks.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === st.t)));
      cells.forEach(c => { setA(c, {class: 'ml-idle'}); c.removeAttribute('data-mark'); });
      weights.replaceChildren();
      r.e.forEach((id, i) => {
        setA(cells[id], {class: 'ml-sel', 'data-mark': 'top gate'});
        if (prev.size && !prev.has(id)) fresh.push(cells[id]);
        const row = el('div', undefined, 'ml-weight'), bar = el('i');
        bar.style.width = (r.w[i] * 100) + '%'; bar.dataset.mark = 'gate';
        row.append(el('span', 'E' + id), bar, el('span', (100 * r.w[i]).toFixed(1) + '%'));
        weights.append(row);
      });
      prev = new Set(r.e); flashAll(fresh);
      const top = Math.max(...load), busiest = load.indexOf(top);
      info.textContent = 'Top-' + T.topK + ' shares sum to 1 · router mass ' + r.m.toFixed(3) + (T.normTopK ? '' : ' · raw weight = share × mass') +
        '\nRouter entropy ' + r.h.toFixed(2) + ' bits; uniform over ' + T.numRouted + ' would be ' + Math.log2(T.numRouted).toFixed(2) +
        '\nThis layer over all ' + T.prompts.length + ' prompts: ' + load.filter(Boolean).length + '/' + T.numRouted +
        ' experts used · busiest E' + busiest + ' took ' + top + ' of ' + load.reduce((s, c) => s + c, 0) + ' picks';
    }
    tokens();
  }

  const routing = {k: 6, bias: 1};
  function moeLab(box, options) {
    let prevIds = new Set();
    // With shared/real-traces.js loaded, a switcher shows measured routing beside this simulation.
    const traces = typeof window !== 'undefined' && window.RealMoETraces, sim = traces ? el('div') : box;
    if (traces) realTrace(box, sim, traces);
    const count = slider(sim, 'Routed experts K', 1, 8, routing.k, change);
    const bias = slider(sim, 'Load correction', 0, 100, Math.round(routing.bias * 100), change, n => (n / 100).toFixed(2));
    const failBtn = btn('Break: Load-Bias Off (λ = 0)', 'ml-break', routing.bias === 0);
    sim.append(poe('moe', 'Turn the load correction off. Where will this batch’s expert picks go?',
      ['Spread evenly, as before', 'Onto the same few popular experts, which overflow', 'Onto random experts, still balanced'], 1,
      () => { const c = moeCapacity(routing.k, 0); return 'Every token now picks the same popular experts; at capacity ' + c.capPerExpert + ' per expert, ' + c.dropped + ' of ' + c.total + ' assignments drop.'; },
      () => { bias.input.value = '0'; bias.sync(); change(); }), failBtn);
    const fig = graphic(sim, '0 0 278 138', '384 routed experts in a 24 by 16 bank with capacity drop meter');
    const cells = Array.from({length: 384}, (_, id) => svg('rect', {x: (id % 24) * 11.6 + 2, y: Math.floor(id / 24) * 7.6 + 2, width: 8, height: 4.5, rx: 1, class: 'ml-idle', 'data-eid': id}, fig));
    svg('rect', {x: 2, y: 126, width: 274, height: 7, rx: 2, class: 'ml-idle'}, fig);
    const capOk = svg('rect', {x: 2, y: 126, width: 274, height: 7, rx: 2, class: 'ml-active'}, fig);
    const capDrop = svg('rect', {x: 276, y: 126, width: 0, height: 7, rx: 2, class: 'ml-drop'}, fig);
    const weights = el('div', '', 'ml-weights'), info = readout();
    sim.append(weights, info);
    eq(sim, [['top', 'top6', 'Six is the model default. K selects the highest corrected scores.'], ' → Σ ', ['gate', 'aⱼ', 'Normalized shares sum to 1; V4-Pro uses gates gⱼ = 2.5 aⱼ.'], ' · expertⱼ']);
    note(sim, 'Generic capped teaching router, not V4’s execution policy. A 24-token batch varies affinities; capacity = ceil(1.25 × 24 × K / 384) assignments/expert. Overflow drops expert assignments, not whole tokens. Bars show one token’s normalized shares; V4 scales their sum by 2.5 and adds its always-on shared expert.');
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
      const fresh = [];
      for (const {id, weight, hot} of entries) {
        const c = cells[id];
        setA(c, {class: col && hot ? 'ml-drop' : 'ml-sel', 'data-mark': 'top gate', height: (3 + 4.4 * Math.sqrt(weight)).toFixed(2)});
        if (prevIds.size && !prevIds.has(id)) fresh.push(c);
        c.style.setProperty('--ml-weight', String(weight));
        const row = el('div', undefined, 'ml-weight' + (col && hot ? ' is-hot' : ''));
        row.dataset.eid = String(id); row.onpointerenter = () => setTrace(id); row.onpointerleave = () => setTrace(null);
        const bar = el('i'); bar.style.width = (weight * 100) + '%'; bar.dataset.mark = 'gate';
        row.append(el('span', 'E' + id), bar, el('span', (100 * weight).toFixed(1) + '%'));
        weights.append(row);
        if (prevIds.size && !prevIds.has(id)) fresh.push(row);
      }
      prevIds = new Set(entries.map(e => e.id));
      flashAll(fresh); // newly chosen experts pulse; unchanged ones stay put
      const okW = (cap.routed / cap.total) * 274;
      setA(capOk, {width: okW.toFixed(1)}); setA(capDrop, {x: (2 + okW).toFixed(1), width: (274 - okW).toFixed(1)});
      info.textContent = 'Σ aⱼ = ' + entries.reduce((s, e) => s + e.weight, 0).toFixed(2) + ' · busy experts ' + entries.filter(e => e.hot).length + '/' + entries.length +
        '\nCapacity ' + cap.capPerExpert + '/expert · ' + cap.dropped + '/' + cap.total + ' expert assignments dropped (toy batch)';
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
    const bustBtn = btn('Break: Edit the first token', 'ml-break', false), strip = el('div', undefined, 'ml-prefix');
    const fig = graphic(box, '0 0 292 64', 'Prefix KV cache hit ratio and illustrative time to first token');
    svg('text', {x: 2, y: 14}, fig, 'Prefix KV'); svg('rect', {x: 78, y: 4, width: 158, height: 12, rx: 2, class: 'ml-idle'}, fig);
    const hitBar = svg('rect', {x: 78, y: 4, width: 150, height: 12, rx: 2, class: 'ml-active', 'data-live': ''}, fig);
    const missBar = svg('rect', {x: 228, y: 4, width: 8, height: 12, rx: 2, class: 'ml-drop', 'data-live': ''}, fig);
    const hitLbl = svg('text', {x: 242, y: 14}, fig);
    svg('text', {x: 2, y: 46}, fig, 'TTFT'); svg('rect', {x: 78, y: 36, width: 158, height: 12, rx: 2, class: 'ml-idle'}, fig);
    const ttftBar = svg('rect', {x: 78, y: 36, width: 15, height: 12, rx: 2, class: 'ml-active', 'data-live': ''}, fig);
    const ttftLbl = svg('text', {x: 242, y: 46}, fig), info = readout();
    box.append(poe('cache', 'Only the first token of the prompt changes. How much of the cached prefix can be reused?',
      ['All but the edited block', 'About half', 'None of it'], 2,
      () => { const s = prefixCache(0); return 'Prefix caching matches from the start, so reuse ends at the first changed token: ' + s.matched + ' of ' + s.total + ' blocks, and TTFT rises to ' + s.ttftMs + ' ms.'; },
      () => { edited = 0; paint(); }), bustBtn, strip, fig, info);
    note(box, 'Assume an eligible warm cache. Tiles stand for blocks of a 16K-token prompt. Edit a tile: reuse ends at its first changed token. TTFT is illustrative.');
    let prevStates = null;
    function paint() {
      const s = prefixCache(edited), wHit = Math.round(158 * s.hitRate);
      bustBtn.setAttribute('aria-pressed', String(edited != null));
      bustBtn.textContent = edited == null ? 'Break: Edit the first token' : 'Restore warm prefix (95% hit)';
      const tiles = PREFIX_TOKENS.map((tok, i) => {
        const b = btn(i === edited ? tok + '*' : tok, undefined, i === edited);
        b.dataset.state = i === edited ? 'edited' : (i < s.matched ? 'warm' : 'cold');
        b.onclick = () => { edited = edited === i ? null : i; paint(); };
        return b;
      });
      strip.replaceChildren(...tiles);
      if (prevStates) flashAll(tiles.filter((b, i) => b.dataset.state !== prevStates[i])); // tiles that flipped warm/cold/edited pulse
      prevStates = tiles.map(b => b.dataset.state);
      setA(hitBar, {width: wHit}); setA(missBar, {x: 78 + wHit, width: 158 - wHit});
      setValue(hitLbl, Math.round(s.hitRate * 100) + '%');
      setA(ttftBar, {width: Math.round(158 * (s.ttftMs / 1920)), class: s.hitRate < .5 ? 'ml-drop' : 'ml-active'});
      setValue(ttftLbl, s.ttftMs + 'ms');
      info.textContent = 'Prefix hit ' + Math.round(s.hitRate * 100) + '% (' + s.matched + '/' + s.total + ' blocks reused) · illustrative TTFT ' + s.ttftMs + ' ms' + (edited === 0 ? ' · full re-prefill triggered' : '');
      options.onPrefixCache?.(s.hitRate);
    }
    bustBtn.onclick = () => { edited = edited == null ? 0 : null; paint(); }; paint();
  }

  function pdLab(box, options) {
    let disagg = true;
    const toggle = btn('Break: PD-Disaggregation Off', 'ml-break', false);
    const fig = graphic(box, '0 0 296 106', 'Prefill and decode inter-token latency timeline'), info = readout();
    const tx = ms => 68 + ms * 220 / 450;
    let first = true;
    box.append(poe('pd', 'A ' + pdSchedule(true, 64).prefillChunkMs + ' ms prefill chunk lands on the GPU decoding your reply. What happens to the gap between your output tokens?',
      ['It stays steady', 'One gap stretches by the whole chunk', 'Every gap doubles'], 1,
      () => { const s = pdSchedule(false, 64); return 'Decode waits behind prefill, so one gap grows from ' + s.baseItlMs + ' ms to ' + s.peakItlMs + ' ms; separate prefill and decode pools avoid the stall.'; },
      () => { disagg = false; paint(); }), toggle, fig, info);
    note(box, 'Idealized schedule: 18 ms decode, a 320 ms prefill chunk, no queue or KV-transfer overhead. Dedicated pools avoid this modeled prefill stall; real ITL also depends on transfer and scheduling.');
    function paint() {
      const s = pdSchedule(disagg, 64);
      toggle.setAttribute('aria-pressed', String(!disagg));
      toggle.textContent = disagg ? 'Break: PD-Disaggregation Off' : 'PD-Disagg OFF (64K stall active) · Restore';
      fig.replaceChildren();
      const changed = [];
      svg('line', {x1: 68, y1: 88, x2: 288, y2: 88, class: 'ml-outline'}, fig);
      svg('text', {x: 68, y: 101}, fig, '0 ms'); svg('text', {x: 162, y: 101}, fig, 'time →'); svg('text', {x: 252, y: 101}, fig, '450 ms');
      if (disagg) {
        svg('text', {x: 2, y: 26}, fig, 'Prefill'); svg('rect', {x: tx(s.prefillStartMs), y: 12, width: tx(s.prefillChunkMs) - tx(0), height: 18, rx: 2, class: 'ml-masked', opacity: '.35'}, fig);
        svg('text', {x: tx(s.prefillStartMs + s.prefillChunkMs / 2), y: 24, 'text-anchor': 'middle'}, fig, '64K chunk (320 ms)');
        svg('text', {x: 2, y: 64}, fig, 'Decode');
      } else {
        svg('text', {x: 2, y: 45}, fig, 'Shared GPU');
        svg('text', {x: 174, y: 20, 'text-anchor': 'middle'}, fig, '64K prefill chunk (320 ms)');
        changed.push(svg('rect', {x: tx(s.prefillStartMs), y: 27, width: tx(s.prefillChunkMs) - tx(0), height: 26, rx: 2, class: 'ml-drop'}, fig));
        svg('path', {d: 'M' + tx(s.decodeTimesMs[1]) + ' 58 V63 H' + tx(s.decodeTimesMs[2]) + ' V58', class: 'ml-nvlink'}, fig);
        changed.push(svg('text', {x: 177, y: 78, 'text-anchor': 'middle'}, fig, 'ITL spike: ' + s.peakItlMs + ' ms'));
      }
      for (const t of s.decodeTimesMs) changed.push(svg('rect', {x: tx(t), y: disagg ? 50 : 31, width: 4, height: 18, rx: 1.5, class: 'ml-active'}, fig));
      if (!first) flashAll(changed); // the redrawn timeline pulses on every toggle
      first = false;
      info.textContent = disagg ? 'Isolated pools · decode ITL steady at ' + s.baseItlMs + ' ms while 64K prefill runs in parallel (illustrative)' :
        'Colocated GPU · 64K prefill chunk stalls concurrent decode ITL from ' + s.baseItlMs + ' ms → ' + s.peakItlMs + ' ms (illustrative)';
      options.onPDDisagg?.(disagg);
    }
    toggle.onclick = () => { disagg = !disagg; paint(); }; paint();
  }

  function roofLab(box) {
    const length = slider(box, 'Prompt length', 10, 17, 12, update, n => fmt(2 ** n) + ' tokens');
    const batch = slider(box, 'Batch size per GPU', 0, 10, 0, update, n => fmt(2 ** n));
    const epExp = slider(box, 'EP All-to-All group', 0, 6, 0, update, n => n === 0 ? '1 GPU (dense)' : fmt(2 ** n) + ' GPUs');
    let tp = 1;
    const tpRow = setA(el('div', undefined, 'ml-presets'), {role: 'group', 'aria-label': 'Tensor-parallel group'});
    for (const n of [1, 4, 8]) { const b = btn('TP ' + n, undefined, n === tp); b.dataset.tp = String(n); b.onclick = () => { tp = n; update(); }; tpRow.append(b); }
    box.append(tpRow);
    const fig = graphic(box, '0 0 306 150', '3-bound Blackwell roofline: compute, HBM3e bandwidth, and NVLink EP All-to-All');
    const x = i => Math.max(40, Math.min(276, 40 + Math.log2(Math.max(1, i)) * 18.5));
    const y = pf => Math.max(12, Math.min(110, 108 - (Math.log2(Math.max(.008, pf)) + 7) * 7.8));
    for (const pf of [.1, 1, 10]) svg('line', {x1: 40, x2: 278, y1: y(pf), y2: y(pf), class: 'ml-outline', opacity: '.16'}, fig);
    svg('path', {d: 'M40 12V111H278', class: 'ml-outline'}, fig);
    const curve = svg('path', {class: 'ml-curve'}, fig), ridgeLine = svg('line', {y2: 111, class: 'ml-guide'}, fig);
    const ridgeLabel = svg('text', {y: 124}, fig);
    const nvLine = svg('line', {x1: 40, x2: 278, y1: y(10), y2: y(10), class: 'ml-nvlink', opacity: '0'}, fig);
    const nvLbl = svg('text', {x: 276, y: y(10) - 4, 'text-anchor': 'end', opacity: '0'}, fig);
    for (const [tx, ty, l] of [[2, 15, 'PF/s'], [44, 140, '1'], [138, 140, 'FLOP/byte →'], [245, 140, '4096'], [2, y(10) + 3, '10'], [1, y(.01) + 3, '.01']]) svg('text', {x: tx, y: ty}, fig, l);
    const prefill = svg('circle', {r: 5, class: 'ml-sel', 'data-live': ''}, fig), decode = svg('rect', {width: 8, height: 8, class: 'ml-sel ml-square', 'data-live': ''}, fig), info = el('div', '', 'ml-readout');
    box.append(info);
    note(box, 'Sharding read-out: per decode step across 61 layers, TP adds two BF16 ring all-reduces per layer (attention output and shared expert, assumed) and EP the top-6 BF16 dispatch + combine, at 900 GB/s per direction. Bandwidth only: every collective also pays microseconds of launch latency, which dominates at small batch.');
    note(box, 'GB200: dense NVFP4 10 PFLOP/s, HBM3e 8 TB/s, NVLink 5 900 GB/s unidirectional (1.8 TB/s bidirectional) per GPU. EP All-to-All ceiling is an illustrative top-6 BF16 dispatch/combine model.');
    note(box, '1 GPU models a 7,168² GEMM. EP models top-6 SwiGLU experts (width 3,072), balanced work per GPU and 384/EP resident experts; each active expert’s FP4 weights are read once. BF16 inputs/outputs cross HBM; NVLink bytes count one direction across dispatch and combine. Ideal bounds omit metadata, intermediate traffic, imbalance and overlap.');
    const source = el('a', 'DeepSeek-V4 report'); source.href = 'https://arxiv.org/html/2606.19348v1#S1';
    const assumption = el('p', 'EP assumes a 5 PF/s FP4×FP8 compute ceiling from the report’s FP8-throughput equivalence; this is not measured performance. ', 'ml-note'); assumption.append(source); box.append(assumption);
    function update() {
      const r = roofline(2 ** length.value, 2 ** batch.value, 2 ** epExp.value);
      setA(curve, {d: 'M40 ' + y(.008) + ' L' + x(r.ridge) + ' ' + y(r.peakPflops) + ' H278'});
      setA(ridgeLine, {x1: x(r.ridge), x2: x(r.ridge), y1: y(r.peakPflops)});
      setA(ridgeLabel, {x: x(r.ridge) - 25}); ridgeLabel.textContent = fmt(r.ridge);
      setA(prefill, {cx: x(r.prefill.intensity), cy: y(r.prefill.pflops)});
      setA(decode, {x: x(r.decode.intensity) - 4, y: y(r.decode.pflops) - 4});
      if (r.nvlinkCeiling != null) {
        const ny = y(r.nvlinkCeiling);
        setA(nvLine, {y1: ny, y2: ny, opacity: '1'}); setA(nvLbl, {y: Math.max(22, ny - 4), opacity: '1'});
        nvLbl.textContent = 'NVLink EP ' + r.nvlinkCeiling.toFixed(1) + ' PF/s';
      } else { setA(nvLine, {opacity: '0'}); setA(nvLbl, {opacity: '0'}); }
      info.textContent = (r.ep === 1 ? 'Dense GEMM' : 'EP SwiGLU · assumed 5 PF/s compute') + ' · per GPU\n● Prefill ' + r.prefill.intensity.toFixed(1) + ' FLOP/B · ' + r.prefill.pflops.toFixed(2) + ' PF/s · ' + r.prefill.bound +
        '\n■ Decode ' + r.decode.intensity.toFixed(1) + ' FLOP/B · ' + r.decode.pflops.toFixed(2) + ' PF/s · ' + r.decode.bound;
      const c = shardComm(2 ** batch.value, tp, r.ep);
      tpRow.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.tp) === tp)));
      info.textContent += '\nNVLink per decode step (61 layers): TP ' + tp + ' all-reduce ' + c.tpUs.toFixed(1) + ' µs + EP ' + r.ep + ' All-to-All ' + c.epUs.toFixed(1) + ' µs' +
        (c.stepsPerS === Infinity ? ' · no NVLink traffic' : ' · bandwidth caps decode at ' + fmt(Math.round(c.stepsPerS)) + ' steps/s');
    }
    update();
  }

  function couplingLab(box, kind) {
    const fig = graphic(box, '0 0 280 105', kind === 'mix' ? 'Four residual streams pass through a mixing matrix' : 'Current and reference distributions for two possible tokens');
    if (kind === 'mix') {
      const paths = [], pick = el('div', undefined, 'ml-tokens'), btns = [], info = el('div', '', 'ml-readout');
      for (let i = 0; i < 4; i++) {
        const y = 16 + 24 * i; svg('text', {x: 0, y: y + 4}, fig, 'x' + (i + 1));
        paths.push([i, (i + 1) % 4].map(j => svg('path', {d: 'M24 ' + y + ' C110 ' + y + ' 170 ' + (16 + j * 24) + ' 248 ' + (16 + j * 24), class: 'ml-curve', opacity: i === j ? 1 : .5, 'data-mark': 'mix'}, fig)));
        svg('text', {x: 252, y: y + 4}, fig, 'y' + (i + 1));
      }
      const choose = i => {
        paths.forEach((pair, n) => pair.forEach(p => { p.classList.toggle('ml-sel-line', n === i); p.setAttribute('opacity', n === i ? 1 : .22); }));
        btns.forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
        info.textContent = 'x' + (i + 1) + ' sends ¾ to y' + (i + 1) + ' and ¼ to y' + ((i + 1) % 4 + 1);
      };
      for (let i = 0; i < 4; i++) { const b = btn('x' + (i + 1)); b.onclick = b.onfocus = () => choose(i); btns.push(b); pick.append(b); }
      box.append(pick, info);
      eq(box, ['Y = ', ['mix', 'mHC_mix', 'Each output mixes ¾ of its stream and ¼ from a neighbor. Every row and column sums to one.'], ' · X']);
      note(box, 'Illustrative fixed ¾ / ¼ doubly-stochastic mixing matrix. DeepSeek-V4-Pro learns dynamic H_pre, H_res, and H_post stream maps across 4 × 7,168 streams and merges them to 7,168 before final RMSNorm.');
      choose(1);
    } else {
      const ref = [.5, .5], bars = [], labels = [], klVal = el('span', '', 'ml-num');
      for (let i = 0; i < 2; i++) {
        const base = 20 + i * 46; svg('text', {x: 3, y: base + 12}, fig, i ? 'B' : 'A');
        bars.push(svg('rect', {x: 25, y: base, width: 10, height: 10, class: 'ml-sel', 'data-mark': 'kl', 'data-live': ''}, fig));
        labels.push(svg('text', {x: 30, y: base + 10}, fig));
        svg('rect', {x: 25, y: base + 14, width: 220 * ref[i], height: 10, class: 'ml-masked', 'data-mark': 'kl'}, fig);
        svg('text', {x: 30 + 220 * ref[i], y: base + 24}, fig, ref[i].toFixed(2));
      }
      const policy = slider(box, 'Current policy p(A)', 5, 95, 75, draw, n => (n / 100).toFixed(2));
      box.append(fig);
      eq(box, [['kl', 'KL', 'The penalty grows as the current policy departs from the reference distribution.'], '(π ∥ πref) = ', klVal, ' nats']);
      note(box, 'Current policy above each reference bar. KL = Σ p log(p / pref).');
      function draw() {
        const pa = policy.value / 100, p = [pa, 1 - pa];
        p.forEach((v, i) => { setA(bars[i], {width: (220 * v).toFixed(1)}); setA(labels[i], {x: 30 + 220 * v}); setValue(labels[i], v.toFixed(2)); });
        setValue(klVal, p.reduce((n, v, i) => n + v * Math.log(v / ref[i]), 0).toFixed(3));
      }
      draw();
    }
  }

  // [title, builder, "Try this" line, "Why it matters" line]
  const labs = {
    bpe: ['Trace a BPE merge', b => bpeLab(b, false), 'Click “ Paris” or type your own words, then open Show merge order.', 'The model reads these pieces, not letters, so unusual words split into more of them.'],
    stream: ['Step through the UTF-8 stream', b => bpeLab(b, true), 'Drag Bytes received through the emoji, then switch the UTF-8 buffer off.', 'A network chunk can end in the middle of a character, so the stream must wait for the rest.'],
    attention: ['Inspect causal attention', attentionLab, 'Click each word to see which earlier words it reads.', 'Attention is how a token pulls in context, and the mask stops it peeking at future words.'],
    rope: ['Rotate a query and key', ropeLab, 'Move both sliders by the same amount: q · k stays put.', 'Position is a rotation, so only the gap between two tokens matters.'],
    kv: ['Compare KV cache sizes', kvLab, 'Slide the context length up and watch each cache grow.', 'The KV cache is what limits how much context fits in GPU memory.'],
    moe: ['Adjust the expert router', moeLab, 'Drag Load correction to 0 and watch the busiest experts take over.', 'Balanced routing keeps every expert useful; without it a few overflow and drop work.'],
    cache: ['Test prefix cache busting', cacheLab, 'Click a token tile to edit it: everything after it must be recomputed.', 'A prefix cache only helps while the start of the prompt stays identical.'],
    pd: ['Test PD-disaggregation stalls', pdLab, 'Press Break to run prefill and decode on the same GPU.', 'Separate pools keep streaming smooth while a long prompt is processed.'],
    roof: ['Explore the 3-bound GB200 roofline', roofLab, 'Raise the batch size and watch the decode square climb toward the roof.', 'It shows whether a step waits on compute, memory bandwidth, or the network.'],
    mix: ['Follow the four residual streams', b => couplingLab(b, 'mix'), 'Pick a stream x1 to x4 to see where it flows.', 'Mixing lets the four streams share information while every row and column still sums to one.'],
    kl: ['Inspect the KL penalty', b => couplingLab(b, 'kl'), 'Slide the current policy away from the 0.50 reference and watch the penalty grow.', 'KL is the leash that keeps a tuned model close to its reference.']
  };
  function dock(parent, names = [], options = {}) {
    for (const name of names) {
      const details = el('details', undefined, 'micro-lab'); details.dataset.lab = name;
      details.append(el('summary', labs[name][0]));
      details.addEventListener('toggle', () => {
        if (!details.open) return;
        let body = details.querySelector('.ml-body');
        if (!body) {
          body = el('div', undefined, 'ml-body'); details.append(body); labs[name][1](body, options);
          intro(body, labs[name][2], labs[name][3]); live(body); // observe after the first paint so only changes pulse
        }
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
  window.MicroLabs = Object.freeze({...core, dock, routing, routerDrawing, routerCenter, reveal,
    flash, flashAll, setValue, live, intro, reducedMotion});
})();
