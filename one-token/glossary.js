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
})();
