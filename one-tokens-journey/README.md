# One Token’s Journey + 3D LLM Observatory

[Open the scrolling story](one-token-journey-3d.html) · [Open the guided tour](tour-v4.html) · [Inspect the shared core](obs-core.html?embed=1&skin=blueprint&realm=MODEL&focus=MD-2g,MD-2h)

## 2026-11-21 update: DeepSeek-V4-Pro refresh

- `one-token-journey-3d.html` and `obs-core.html` are now the V4-Pro versions.
  - The story no longer loads the hero PNG.
  - Tiles sit in their own grid row, so they no longer cover diagram text.
  - Phones now show inline 3D in all six chapters.
- `tour-v4.html` now uses the V4 story's 30-stop table (`STOPS`) and its `buildS1`–`buildS6` diagram builders. Its navigation code is unchanged.
- **Checked in Chrome, 2026-11-21:**
  - The tour: all 30 stops render with correct counters, number keys 1–6 jump chapters, and no V3 references remain.
  - The story: the engine docks in all six chapters on desktop and at 375 px, and chapters 1, 2, 3 and 6 cover no diagram text.
  - The standalone core loads.
  - No console errors on any page.
- The acceptance and frame-time tables below describe the 2026-11-19 build.
- If you viewed the old build, hard-refresh with Ctrl+F5, because the browser may serve the cached `obs-core.html` inside the iframe.

## Run locally

Serve the repository over HTTP: the story and tour embed `obs-core.html` in an iframe and load their assets with `fetch`, which browsers block on `file://`. From the repository root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/one-tokens-journey/>. Three.js r128 loads from cdnjs and the fonts load from Google Fonts, with local fallbacks.

## Controls

**Scrolling story.** Follow the token by scrolling or using the chapter rail. Chapters four and five open onto 3D rooms. The four other chapters dock a tile beside the original diagram. Click a 3D view or activate its Expand pill. Drag to orbit and use the wheel or pinch to zoom. Previous and Next move through the step’s components, then through adjacent steps. Close, Escape or the exposed scrim returns to the original position and focus. The recap opens the 31-component overview.

**Guided tour.** Start the journey, then use Next, Previous or the arrow keys. The chapter rail and keys 1–6 jump by chapter. Home and End select the first and last stops. [Stop 17](tour-v4.html#stop-17) opens the router directly. More detail opens the component record. Escape or Explore freely enables orbit and zoom. All components opens the 31-item index. Text view contains the entire story and the component reference.

The operating system’s reduced-motion preference and the `rm=1` query option snap camera and drawer transitions. Add `perf=1` to display the performance HUD.

## Validation states

| State | Page |
|---|---|
| ch1-tile | [Open](one-token-journey-3d.html?state=ch1-tile) |
| ch4-room-router | [Open](one-token-journey-3d.html?state=ch4-room-router) |
| ch4-drawer-router | [Open](one-token-journey-3d.html?state=ch4-drawer-router) |
| ch5-room-decode | [Open](one-token-journey-3d.html?state=ch5-room-decode) |
| ch6-tile | [Open](one-token-journey-3d.html?state=ch6-tile) |
| narrow-drawer | [Open](one-token-journey-3d.html?state=narrow-drawer) |
| tour-start | [Open](tour-v4.html?state=tour-start) |
| tour-ch1-bpe | [Open](tour-v4.html?state=tour-ch1-bpe) |
| tour-ch4-router | [Open](tour-v4.html?state=tour-ch4-router) |
| tour-ch5-decode | [Open](tour-v4.html?state=tour-ch5-decode) |
| tour-free-roam | [Open](tour-v4.html?state=tour-free-roam) |
| tour-narrow | [Open](tour-v4.html?state=tour-narrow) |

## Acceptance results

| Check | Result |
|---|---|
| Every inline script | Pass. Five scripts passed Node syntax checking. |
| Literal DOM ID lookups | Pass. All 43 distinct core targets, 15 story targets and nine tour targets resolved. |
| Headless deep links | Pass. The standalone core and twelve named states produced nonblank PNGs. Pillow checked separate 3D and card regions. Desktop captures are 3840 × 2160 and narrow captures are 780 × 1688. |
| Scrolling story | Pass. Traversed all six chapters from intro to outro without a console error. |
| Drawer, focus and scrolling | Pass. All six chapters expanded using the original canvas. Escape restored the exact scroll offset and Expand focus in each chapter. Pointer dragging and wheel input changed the camera pose. |
| Reduced motion and visibility | Pass. Drawer animation duration was zero and no camera flight occurred. Backgrounding the tab suspended the iframe and its frame count held steady. |
| Guided navigation | Pass. All 30 stops had the correct hash, heading, diagram and detail fields. Home, End, numeric chapter jumps, Escape, free roam, direct hash navigation, the full text view and 31-entry index were checked. |
| Content geometry | Pass. Tested eight routed slots, a separate shared expert, clear sight lines to all eight selected cells from the room camera and one visible additional decode slice per token for counts 0–5. |
| Core API and sharpness | Pass. Tested the complete public API and spatial projection. All 12 settled states used DPR 2 and MSAA. The explicit aa=0 path initialized FXAA. The observed motion floor was DPR 1. |

## Frame times

One owned headless Chrome page used ANGLE D3D11 WARP, identified as Microsoft Basic Render Driver, at 1920 × 1080 CSS pixels and DPR 2. The core, room and tour each submitted **zero frames during a 900 ms idle window**. A true idle interval has no average or percentile. The settled-redraw rows explicitly requested repeated full-resolution frames. The room and drawer used their actual on-page dimensions. Rapid Next used the tour’s keyboard handler. Values are frame intervals from the v4 rolling performance ring. Draw calls describe the last sampled frame.

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

## Known limits

The full-resolution drawer had the highest p95 at 204.2 ms on WARP. The settled scene sleeps between changes. Narrow layouts were verified in Chrome’s 390 × 844 viewport. Physical-phone touch and screen-reader output remain unverified.
