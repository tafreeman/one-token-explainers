# One Token's Journey

A scrolling 3D story of one token through DeepSeek-V4-Pro, from raw text to the next token, in six chapters. Chapters four and five open onto 3D rooms. The other four dock a 3D tile beside the original blueprint diagram.

- **Open:** <https://tafreeman.github.io/one-token-explainers/journey-story/> · local <http://localhost:8000/journey-story/>
- **Entry:** `index.html`. It links to the [guided tour](../journey-tour/).
- **Depends on:**
  - [`../shared/obs-core.html`](../shared/), the 3D engine, embedded with `?embed=1`.
  - [`../shared/journey-narration/`](../shared/journey-narration/), the clips and manifest.
  - Bricolage Grotesque from Google Fonts.
- **Narration:**
  - The 32-clip, 6:25 set shared with the tour, voice Jade.
  - "Narrated run" in the top bar plays the intro, then scrolls to each step card as its clip starts. Scrolling or arrow keys pause it.
  - The page carries an inline copy of the manifest (`<script id="narration-manifest">`), so regenerate it if `../shared/journey-narration/manifest.json` changes.
- **Facts:** DeepSeek-V4 paper ([arXiv 2606.19348](https://arxiv.org/abs/2606.19348)) and the V4-Pro config, checked 21 November 2026.
- **Lineage:**
  - The audit ID is **J3**, refreshed to V4-Pro (score 9.2 after the refresh) in `Downloads\animations\ANIMATIONS-ANALYSIS-2026-11-21.md`.
  - Source: `Downloads\animations\observatory\llm-observatory-merge\final\one-token-journey-3d.html`.
  - The repo history carries later mobile and hero-label fixes.

## Controls

Follow the token by scrolling or using the chapter rail.

- **Opening a 3D view:** click it, or activate its Expand pill.
- **Moving the camera:** drag to orbit, and use the wheel or pinch to zoom.
- **Previous and Next:** these move through the step's components, then through adjacent steps.
- **Drawer keyboard:** Tab and Shift+Tab traverse the native lab controls and the 3D scene. Range and text-editing keys stay with their control. In the focused scene, arrows step through parts, Home/End jump to the boundaries and 1–6 jump chapters.
- **Closing:** Close, Escape or the exposed scrim returns you to your original position and focus.
- **Recap:** opens the 31-component overview.

The operating system's reduced-motion preference and the `rm=1` query option snap camera and drawer transitions. `perf=1` shows the performance HUD.

## Validation states

| State | Page |
|---|---|
| ch1-tile | [Open](index.html?state=ch1-tile) |
| ch4-room-router | [Open](index.html?state=ch4-room-router) |
| ch4-drawer-router | [Open](index.html?state=ch4-drawer-router) |
| ch5-room-decode | [Open](index.html?state=ch5-room-decode) |
| ch6-tile | [Open](index.html?state=ch6-tile) |
| narrow-drawer | [Open](index.html?state=narrow-drawer) |

Acceptance results and frame times for the journey set are in [`../shared/README.md`](../shared/README.md).

## Known limits

- The chapter 4 and 5 rooms sit over part of those chapters' diagrams by design.
- Narrow layouts were verified in Chrome's 390 × 844 viewport. Physical-phone touch and screen-reader output remain unverified.
- After an engine update, hard-refresh with Ctrl+F5, because the browser may serve a cached `obs-core.html` inside the iframe.
