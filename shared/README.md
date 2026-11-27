# Shared files

Files used by more than one explainer. Today, both journey pages ([story](../journey-story/) and [tour](../journey-tour/)) use everything here.

| Path | What it is | Used by |
|---|---|---|
| `obs-core.html` | The LLM Systems Observatory, the Three.js engine. The journey pages embed it with `?embed=1`. It also opens on its own. | journey-story, journey-tour, landing footer link |
| `micro-labs.js` and `micro-labs.css` | Offline, on-demand math labs. Run `node --test` at the repository root. | Story, Tour, standalone Observatory, Beamline Study |
| `concept-map.js` | The single table mapping lesson steps to Observatory codes (TR-2, MD-2d, IN-9) and to the seven Inspect panels. Labels, lesson-stage tags, deep links and the "Back to One Token" chip all read it. Load it before `concept-links.js`. | Reader, Swiss, Beamline, Story, Tour, Observatory |
| `concept-links.js` | Concept hashes and cross-explainer links, built on `concept-map.js`. | all explainers |
| `obs-file-bridge.js` | Connects local-file journey pages to the Observatory when the browser isolates their origins. | Story, Tour, Observatory |
| `journey-narration/` | 32 MP3s (an intro, one per tour stop, an outro), `manifest.json` and `narration-script.md` | journey-story, journey-tour |

## Engine: `obs-core.html`

- **Open on its own:** [`obs-core.html?embed=1&skin=blueprint&realm=MODEL&focus=MD-2g,MD-2h`](obs-core.html?embed=1&skin=blueprint&realm=MODEL&focus=MD-2g,MD-2h) shows the router and the experts.
- **Query options passed through from the pages:** `perf`, `rm`, `quality`, `pr`, `aa`.
- **Deep links:** `obs-core.html?from=reader&pos=2.1#concept=tokenization` pauses the tour, flies to the matching component (TR-2), selects it in the index and opens its description. Arrivals from the lesson start with the index collapsed and the light skin.
- **Labels:** components are named by code and name only ("TR-2 · Tokenizer"). The lesson-stage tag ("Lesson 02") comes from `concept-map.js`; TR-4, TR-7 and IN-12 have none.
- **Depends on:** Three.js r128 bundled in `vendor/`, and Google Sans Flex and Inter Tight from Google Fonts.
- **Lineage:**
  - The audit IDs are **O1/O3** in `Downloads\animations\ANIMATIONS-ANALYSIS-2026-11-21.md`.
  - Source: `Downloads\animations\observatory\llm-observatory-merge\final\obs-core.html` (V4-Pro).
- **Known limits:**
  - A ghost label shows behind the toolbar.

## Component labs

- Test the router at [Tour stop 17](../journey-tour/index.html?rm=1&lab=moe#stop-17). Both the component drawing and the Observatory use the same normalized affinities. The load correction affects selection only.
- Each failure lab sits on every card of its concept (`concept-map.js` `obs`): MoE load-bias off on MD-2g/2h, PD-disaggregation off on IN-5 to IN-7 and IN-12, UTF-8 buffer off on IN-9/10, and prefix-cache bust on IN-11/12. The Story, Tour and Beamline Study hosts match. `tools/micro-labs.test.cjs` asserts every placement. In the standalone Observatory these cards also drive the 3D scene.
- The BPE vocabulary, query/key vectors, load history and single-layer roofline are teaching examples. The KV comparison fits its illustrative V4 curve to the [DeepSeek-V4 report](https://arxiv.org/abs/2606.19348) at 1M. The reported 27% FLOP ratio applies at that endpoint.
- The roofline uses the [GB200 specifications](https://www.nvidia.com/en-us/data-center/gb200-nvl72/) per GPU. The sampling probe implements the [Fable 5.2 parameter contract](https://platform.claude.com/docs/en/models/fable-5-2/overview) locally.

## Narration: `journey-narration/`

- **Voice and model:** ElevenLabs voice Jade on `eleven_v4`. There are 32 clips, 6:25 in total.
- **Extras:** `manifest.json` `extras` holds 7 more clips for stops the 32-clip script never covered: the five Training Line stations, the release gate, and stop 19 (frozen weights), whose original clip narrates training. Only the root Journey tour plays them; each names its tour stop in `slot`.
- **Script:** `narration-script.md`.
- **Manifest:** `manifest.json` lists each clip with its duration, its tour stop and its captions. Captions are timed by each sentence's share of the clip, snapped to the pauses that `ffmpeg silencedetect` finds.
- **Paths:** clip `src` paths are written relative to the pages (`../shared/journey-narration/<clip>.mp3`). Both pages sit one folder deep, so one manifest serves both.
- **Inline copies:** each page also carries an inline copy of the manifest so narration works from `file://`. Regenerate both copies if `manifest.json` changes.

## Journey set: acceptance results (2026-11-19 build)

| Check | Result |
|---|---|
| Every inline script | Pass. Five scripts passed Node syntax checking. |
| Literal DOM ID lookups | Pass. All 43 distinct core targets, 15 story targets and nine tour targets resolved. |
| Headless deep links | Pass. The standalone core and twelve named states produced nonblank PNGs. Pillow checked separate 3D and card regions. Desktop captures are 3840 × 2160 and narrow captures are 780 × 1688. |
| Scrolling story | Pass. Traversed all six chapters from intro to outro without a console error. |
| Drawer, focus and scrolling | Pass. All six chapters expanded using the original canvas. Escape restored the exact scroll offset and Expand focus in each chapter. Pointer dragging and wheel input changed the camera pose. |
| Reduced motion and visibility | Pass. Drawer animation duration was zero and no camera flight occurred. Backgrounding the tab suspended the iframe and its frame count held steady. |
| Guided navigation | Pass. All 30 stops had the correct hash, heading, diagram and detail fields. Home, End, numeric chapter jumps, Escape, free roam, direct hash navigation, the full text view and 31-entry index were checked. |
| Content geometry | Pass. Tested six routed slots (of 384) plus one shared expert, clear sight lines to all six selected cells from the room camera and one visible additional decode slice per token for counts 0–5. Matches `MOE_N = 384` and `MOE_BASE_LIT` (length 6) in `obs-core.html`; `node tools/check-facts.mjs` asserts both. |
| Core API and sharpness | Pass. Tested the complete public API and spatial projection. All 12 settled states used DPR 2 and MSAA. The explicit aa=0 path initialized FXAA. The observed motion floor was DPR 1. |

**2026-11-21 V4-Pro refresh, checked in Chrome:**
- **Tour:** all 30 stops render with correct counters, keys 1–6 jump chapters, and no V3 references remain.
- **Story:** the engine docks in all six chapters on desktop and at 375 px, and chapters 1, 2, 3 and 6 cover no diagram text.
- **Core:** the standalone core loads.
- **All pages:** no console errors.

## Journey set: frame times (2026-11-19 build)

**Setup:** one owned headless Chrome page on ANGLE D3D11 WARP (identified as Microsoft Basic Render Driver), at 1920 × 1080 CSS pixels and DPR 2.

**Idle:** the core, room and tour each submitted **zero frames during a 900 ms idle window**. A true idle interval has no average or percentile.

**How the rows were measured:**
- The settled-redraw rows explicitly requested repeated full-resolution frames.
- The room and drawer used their actual on-page dimensions.
- Rapid Next used the tour's keyboard handler.
- Values are frame intervals from the v4 rolling performance ring.
- Draw calls describe the last sampled frame.

| Workload | Intervals | Mean ms | p95 ms | Draw calls | Minimum DPR |
|---|---:|---:|---:|---:|---:|
| Core, settled redraw | 57 | 59.7 | 88.3 | 166 | 2 |
| Core, flight | 157 | 25.2 | 66.5 | 169 | 1 |
| Story room, settled redraw | 61 | 52.1 | 58.5 | 317 | 2 |
| Story room, flight | 151 | 25.9 | 30.4 | 317 | 1 |
| Story drawer, open redraw | 45 | 77.6 | 204.2 | 119 | 2 |
| Tour, settled redraw | 54 | 58.8 | 97.0 | 171 | 2 |
| Tour, flight | 162 | 24.1 | 57.9 | 209 | 1 |
| Tour, rapid Next | 246 | 22.3 | 71.7 | 123 | 1 |

The full-resolution drawer had the highest p95, 204.2 ms on WARP. The settled scene sleeps between changes.
