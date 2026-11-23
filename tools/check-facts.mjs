#!/usr/bin/env node
// Fact and syntax gate for the explainers. Zero dependencies: `node tools/check-facts.mjs`.
// Exits 1 and lists every failure. Each check names the Phase 1 task it guards.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const failures = [];
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failures.push(detail ? `${name}: ${detail}` : name);
};

const PAGES = {
  core: 'shared/obs-core.html',
  story: 'journey-story/index.html',
  tour: 'journey-tour/index.html',
  swiss: 'end-to-end-swiss/index.html',
  beamline: 'end-to-end-beamline/index.html',
};
const src = Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [k, read(p)]));

// Task 1: MoE geometry is DeepSeek-V4-Pro top-6 of 384, not V3 top-8.
const moeN = Number((src.core.match(/const MOE_N = (\d+);/) || [])[1]);
const litRaw = (src.core.match(/const MOE_BASE_LIT = \[([^\]]*)\];/) || [])[1];
const lit = litRaw ? litRaw.split(',').map((n) => Number(n.trim())) : [];
check('MOE_N === 384', moeN === 384, `found ${moeN}`);
check('MOE_BASE_LIT has 6 slots', lit.length === 6, `found ${lit.length}`);
check('MOE_BASE_LIT slots are distinct and < MOE_N', new Set(lit).size === lit.length && lit.every((n) => n >= 0 && n < moeN));

// Tasks 1-2 / gate 03: no stale V3 or MLA-vs-GQA terminology in obs-core, Story, Tour or shared/README.md.
const STALE = /\btop-?8\b|top-eight|eight routed|\b8 routed|MLA\s*(?:vs\.?|\/)\s*GQA|GQA\s*(?:vs\.?|\/)\s*MLA|GqaMla|mlaModeActive|gqaBtn/i;
for (const p of [PAGES.core, PAGES.story, PAGES.tour, 'shared/README.md']) {
  const m = read(p).match(STALE);
  check(`no stale terms in ${p}`, !m, m && `"${m[0]}"`);
}
check('CSA/HCA toggle id present', src.core.includes('id="btnCsaHcaToggle"'));
check('embed API keeps setAttentionMode', /setAttentionMode\(m\)\{[^}]*hcaModeActive=\(m!=='csa'\)/.test(src.core));

// Task 3 / gate 04: GB200 prefill FLOPS and decode bandwidth share per-GPU granularity.
for (const k of ['core', 'story', 'tour']) {
  const facts = src[k].match(/GB200 (?:dense FP4|HBM3e)[^"<]*(?:<span[^>]*>[^<]*<\/span>[^"<]*)*/g) || [];
  check(`GB200 facts found in ${PAGES[k]}`, facts.length >= 2, `found ${facts.length}`);
  for (const f of facts) {
    const plain = f.replace(/<[^>]+>/g, '');
    check(`per-GPU scope in ${PAGES[k]}`, /per GPU/.test(plain), plain.slice(0, 90));
  }
}

// Task 4: Swiss keeps one drawn stream but says V4 uses four; Beamline draws four strands.
check('Swiss notes the 4-stream mHC', /drawing keeps one stream for clarity; DeepSeek‑V4 widens it into four parallel streams/.test(src.swiss));
check('Beamline builds 4 mHC strands', /NSTR = 4\b/.test(src.beamline) && !/CylinderGeometry\(\.1, \.1, TOWER_TOP/.test(src.beamline));

// Task 5: provenance lines at stages 3, 4 and 7 (Swiss) and Stations 3, 4-5 and 7 (Beamline).
for (const n of [3, 4, 7]) {
  check(`Swiss stage ${n} provenance line`, new RegExp(`id="h-${n}"[^\\n]*\\n\\s*<p class="prov">`).test(src.swiss));
}
check('Beamline has 3 provenance lines', (src.beamline.match(/<p class="prov">/g) || []).length === 3);

// Task 6: clipped GRPO objective in Beamline Study mode only; Swiss main flow stays simplified.
check('Beamline Study toggle', src.beamline.includes('id="studyBtn"') && src.beamline.includes('html.study .study-note{display:block}'));
check('Beamline clipped GRPO in a study note', /class="study-note">[\s\S]{0,200}full GRPO objective[\s\S]{0,300}clip\(ρ_i,t, 1 − ε, 1 \+ ε\)[\s\S]{0,80}β · KL\(π_θ ‖ π_ref\)/.test(src.beamline));
check('Swiss has no study notes', !src.swiss.includes('study-note'));

// Audit corrections: the published 1M KV ratio is storage vs V3.2, not a dense-attention speedup.
// https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro (Introduction, checked 2026-11-22).
check('Swiss has no invented 10x dense memory/bandwidth ratio', !/10[×x][^'\n]*(?:memory|bandwidth)/i.test(src.swiss));
const swissKV = (src.swiss.match(/const KV_COPY=\{([\s\S]*?)\n\};/) || [])[1] || '';
check('Swiss KV endpoint names model, length, storage and baseline',
  /V4.Pro/.test(swissKV) && /1M/.test(swissKV) && /10%/.test(swissKV) && /V3\.2/.test(swissKV) && /stored KV/.test(swissKV));
const precisionStep = (src.swiss.match(/<h3><span class="sn">3\.3<\/span>([\s\S]*?)<\/article>/) || [])[1] || '';
check('Swiss separates FP8 pretraining from FP4 QAT release',
  /pretraining uses FP8 mixed precision/i.test(precisionStep) && /QAT[^<]*FP4[^<]*release/.test(precisionStep));
check('Story benchmark labels the reported Think Max mode', /V4-PRO[^'\n]*THINK MAX/.test(src.story));
check('Story does not invent a red-team pass', !/\['Red-team safety',\s*'PASS'/.test(src.story));

// Narration: inline manifests must match the shared manifest (file:// playback, audio timing).
const inline = (html, id) => JSON.parse((html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`)) || [])[1] || 'null');
const shared = JSON.parse(read('shared/journey-narration/manifest.json'));
for (const k of ['story', 'tour']) {
  check(`${PAGES[k]} inline manifest matches shared manifest`, JSON.stringify(inline(src[k], 'narration-manifest')) === JSON.stringify(shared));
}

// Every inline script parses.
const tmp = mkdtempSync(join(tmpdir(), 'check-facts-'));
try {
  for (const [k, html] of Object.entries(src)) {
    let i = 0;
    for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1] || '';
      if (/\bsrc=|application\/json|importmap/.test(attrs)) continue;
      const file = join(tmp, `${k}-${i += 1}.${/type="module"/.test(attrs) ? 'mjs' : 'js'}`);
      writeFileSync(file, m[2]);
      const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      check(`${PAGES[k]} inline script ${i} parses`, r.status === 0, (r.stderr || '').split('\n').slice(0, 4).join(' '));
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`check-facts: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`check-facts: all ${passed} checks passed`);
