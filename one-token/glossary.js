/* First-use glossary: the first prose mention of each term in the lesson becomes a
   small button that opens a one-line plain-English definition. The definitions live in
   the static <dl> inside #glossary (Sources), which is also the printable list. */
(function () {
  'use strict';
  const lesson = document.getElementById('lesson');
  const list = document.querySelector('#glossary dl');
  if (!lesson || !list || typeof lesson.querySelectorAll !== 'function') return;

  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entries = [...list.querySelectorAll('dt')].map(dt => ({
    term: dt.textContent.trim(),
    definition: dt.nextElementSibling?.textContent.trim() || '',
    pattern: new RegExp('(?<![\\w-])(' + (dt.dataset.match || dt.textContent).split('|').map(escape).join('|') + ')(?![\\w-])', 'i')
  }));

  const skip = 'header.opening, .credits, h1, h2, h3, button, a, summary, legend, label, output, pre, code, dl, .sn, .st-num, .prov, .sources, script, style';
  const walker = document.createTreeWalker(lesson, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.data.trim() && !node.parentElement.closest(skip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const pending = new Set(entries);
  for (let node of nodes) {
    while (pending.size) {
      let best = null;
      for (const entry of pending) {
        const match = entry.pattern.exec(node.data);
        if (match && (!best || match.index < best.match.index)) best = {entry, match};
      }
      if (!best) break;
      const {entry, match} = best;
      const hit = node.splitText(match.index);
      const after = hit.splitText(match[0].length);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gloss';
      button.dataset.term = entry.term;
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-label', match[0] + ': definition');
      button.textContent = match[0];
      hit.replaceWith(button);
      pending.delete(entry);
      node = after;
    }
  }

  const popover = document.createElement('div');
  popover.id = 'gloss-pop';
  popover.setAttribute('popover', '');
  popover.setAttribute('role', 'note');
  popover.innerHTML = '<strong></strong><span></span>';
  document.body.append(popover);
  const byTerm = new Map(entries.map(entry => [entry.term, entry]));

  lesson.addEventListener('click', event => {
    const button = event.target.closest('button.gloss');
    if (!button || typeof popover.showPopover !== 'function') return;
    const entry = byTerm.get(button.dataset.term);
    popover.firstChild.textContent = entry.term;
    popover.lastChild.textContent = entry.definition;
    popover.showPopover();
    const box = button.getBoundingClientRect();
    const width = popover.offsetWidth, height = popover.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, box.left));
    const below = box.bottom + 8 + height < window.innerHeight - 70;
    popover.style.left = left + 'px';
    popover.style.top = Math.max(8, below ? box.bottom + 8 : box.top - height - 8) + 'px';
  });

  /* Augmented-Math interactive symbol bindings on <pre class="eq"> blocks:
     hovering, focusing, or tapping a formula term explains its concrete role
     and tints the active 3D stage callout in its semantic color family. */
  const eqSpecs = [
    ['minhash', 'fault', 'Computes compact document shingle signatures so near-duplicates collide.'],
    ['lsh_index', 'fault', 'Locality-sensitive hash table that flags near-duplicate documents for removal.'],
    ['tokenizer.encode', 'token', 'Applies learned byte-level BPE merge rules to map raw UTF-8 text into integer IDs.'],
    ['E[12842]', 'attention', 'O(1) row lookup in the 129,280 × 7,168 embedding matrix — no matrix multiply.'],
    ['float[7168]', 'token', 'The token’s continuous 7,168-number hidden-state vector entering the residual stream.'],
    ['12842', 'token', 'Illustrative vocabulary row ID for “ Paris” (including its leading space).'],
    ['cross_entropy', 'fault', 'Next-token prediction loss: −log p(target token) across every sequence position.'],
    ['mtp_loss', 'cache', 'Multi-token prediction auxiliary loss scoring the token after next.'],
    ['65_536 × 16', 'cache', 'YaRN rotary-frequency rescaling extending the 64K base window to 1,048,576 tokens.'],
    ['A_i', 'fault', 'Group-relative advantage in GRPO: each rollout’s reward normalized against the group mean.'],
    ['π_θ', 'token', 'Current trainable policy distribution being reinforced on verified attempts.'],
    ['"refusal"', 'fault', 'Safety-classifier stop signal ending generation when a policy boundary triggers.'],
    ['"ephemeral"', 'cache', 'Marks a prompt prefix boundary eligible for 5-minute KV reuse across requests.'],
    ['topk', 'attention', 'Lightweight CSA indexer selecting the 1,024 highest-scoring compressed KV entries.'],
    ['kv_compressed', 'cache', 'Compressed historical KV summaries stored in HBM so long context stays tractable.'],
    ['kv[-128:]', 'cache', 'Exact recent sliding window of the last 128 tokens read at full local fidelity.'],
    ['shared(x)', 'cache', 'Always-active shared expert FFN applied unconditionally to every token.'],
    ['expert_j(x)', 'token', 'Top-6 routed specialist SwiGLU FFNs activated out of 384 total experts.'],
    ['rmsnorm', 'attention', 'Root-mean-square normalization stabilizing vector magnitude before each sub-layer.'],
    ['merge_4_to_1', 'attention', 'Learned reduction collapsing the 4 × 7,168 mHC residual streams back to 7,168.'],
    ['softmax', 'token', 'Converts 129,280 raw vocabulary logits into normalized next-token probabilities.'],
    ['"adaptive"', 'cache', 'Effort-scaled reasoning mode where the model decides how many thinking tokens to spend.'],
    ['"tool_use"', 'tool', 'Stop signal pausing generation so client code can execute the requested tool.'],
    ['content_block_delta', 'token', 'Incremental Server-Sent Event streaming UTF-8 text or partial JSON chunks live.'],
    ['"tool_result"', 'tool', 'Untrusted execution output appended to the conversation for the next model pass.']
  ];
  const eqByTerm = new Map(eqSpecs.map(([k, role, desc]) => [k, {role, desc}]));
  const eqPattern = new RegExp('(' + eqSpecs.map(([k]) => escape(k)).sort((a, b) => b.length - a.length).join('|') + ')');

  for (const pre of lesson.querySelectorAll('pre.eq')) {
    const code = pre.querySelector('code') || pre;
    const eqWalker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const eqNodes = [];
    while (eqWalker.nextNode()) eqNodes.push(eqWalker.currentNode);
    let count = 0;
    for (let node of eqNodes) {
      for (;;) {
        const match = eqPattern.exec(node.data);
        if (!match) break;
        const spec = eqByTerm.get(match[0]);
        if (!spec) break;
        const hit = node.splitText(match.index);
        const after = hit.splitText(match[0].length);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'eq-term';
        btn.dataset.eq = match[0];
        btn.dataset.role = spec.role;
        btn.setAttribute('aria-label', match[0] + ': ' + spec.desc);
        btn.textContent = match[0];
        hit.replaceWith(btn);
        count++;
        node = after;
      }
    }
    if (count) {
      const strip = document.createElement('div');
      strip.className = 'eq-gloss';
      strip.setAttribute('aria-live', 'polite');
      pre.after(strip);
    }
  }

  function showEqTerm(btn) {
    const host = btn?.closest('.technical-detail, #explanation-detail');
    if (!host) return;
    const strip = btn.closest('pre.eq')?.nextElementSibling;
    const spec = eqByTerm.get(btn.dataset.eq);
    if (!spec) return;
    document.body.dataset.eqRole = spec.role;
    if (strip?.classList.contains('eq-gloss')) {
      strip.dataset.role = spec.role;
      strip.replaceChildren(Object.assign(document.createElement('b'), {textContent: btn.dataset.eq + ' — '}), spec.desc);
    }
  }
  function clearEqTerm(btn) {
    delete document.body.dataset.eqRole;
    const strip = btn?.closest('pre.eq')?.nextElementSibling;
    if (strip?.classList.contains('eq-gloss')) {
      delete strip.dataset.role;
      strip.textContent = '';
    }
  }
  document.addEventListener('pointerover', e => { const b = e.target.closest?.('button.eq-term'); if (b) showEqTerm(b); });
  document.addEventListener('pointerout', e => { const b = e.target.closest?.('button.eq-term'); if (b && b !== document.activeElement) clearEqTerm(b); });
  document.addEventListener('focusin', e => { const b = e.target.closest?.('button.eq-term'); if (b) showEqTerm(b); });
  document.addEventListener('focusout', e => { const b = e.target.closest?.('button.eq-term'); if (b) clearEqTerm(b); });
  document.addEventListener('click', e => { const b = e.target.closest?.('button.eq-term'); if (b) showEqTerm(b); });
})();
