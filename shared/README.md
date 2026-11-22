# Shared files

Files used by more than one explainer. Today, both journey pages ([story](../journey-story/) and [tour](../journey-tour/)) use everything here.

| Path | What it is | Used by |
|---|---|---|
| `obs-core.html` | The LLM Systems Observatory, the Three.js engine. The journey pages embed it with `?embed=1`. It also opens on its own. | journey-story, journey-tour, landing footer link |
| `journey-narration/` | 32 MP3s (an intro, one per tour stop, an outro), `manifest.json` and `narration-script.md` | journey-story, journey-tour |

## Engine: `obs-core.html`

- **Open on its own:** [`obs-core.html?embed=1&skin=blueprint&realm=MODEL&focus=MD-2g,MD-2h`](obs-core.html?embed=1&skin=blueprint&realm=MODEL&focus=MD-2g,MD-2h) shows the router and the experts.
- **Query options passed through from the pages:** `perf`, `rm`, `quality`, `pr`, `aa`.
- **Depends on:** Three.js r128 from cdnjs, and Google Sans Flex and Inter Tight from Google Fonts.
- **Lineage:**
  - The audit IDs are **O1/O3** in `Downloads\animations\ANIMATIONS-ANALYSIS-2026-11-21.md`.
  - Source: `Downloads\animations\observatory\llm-observatory-merge\final\obs-core.html` (V4-Pro).
- **Known limits:**
  - Three.js loads from one CDN, and there's no WebGL context-loss handling.
  - A ghost label shows behind the toolbar.

## Narration: `journey-narration/`

- **Voice and model:** ElevenLabs voice Jade on `eleven_v4`. There are 32 clips, 6:25 in total.
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
