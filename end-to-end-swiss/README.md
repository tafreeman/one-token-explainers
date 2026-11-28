# One Token, End to End (Swiss)

The token " Paris" crosses twelve stages on one line, from a training document to a streamed reply from Claude Fable 5.2. The page shows how the model is made and how it answers you. Orthographic 3D figures sit beside each step, with controls for prefix-cache hit or miss, attention and KV mode, and effort.

Swiss is one of four linked presentations. **Explore the token** starts an
interactive instrument: scrub the axis or use arrows to move Paris through
the existing 3D stages and into the illustrative reply. **Read stage by stage**
opens the written route, which remains synchronized to the axis.

All 43 steps, examples, controls, code and specification tables are shown
directly rather than hidden behind stage and technical disclosures. They remain
available without JavaScript, WebGL or narration; reduced-motion and static
fallbacks preserve the written experience.

**Watch or listen** groups the animation and narration controls; closing that
disclosure pauses active hero playback. The drawing key and other presentations
are also available through labeled disclosures. The other presentations keep
their existing URLs and are linked with explicit HTML paths for local-file use.

- **Open:** <https://tafreeman.github.io/one-token-explainers/end-to-end-swiss/> · local <http://localhost:8000/end-to-end-swiss/>
- **Entry:** `index.html`
- **Depends on:**
  - Three.js r128, bundled at [`../shared/vendor/three-r128.min.js`](../shared/vendor/). If that file is missing, [`../shared/three-loader.js`](../shared/three-loader.js) tries the cdnjs, unpkg and jsDelivr mirrors behind one SRI hash.
  - From [`../shared/`](../shared/): `suite-theme.css`, `concept-map.js` and `concept-links.js` for suite navigation, and `obs-core.html` for the Observatory links.
  - Martian Mono and Roboto Flex from Google Fonts, with system fallbacks offline.
- **Narration:**
  - 14 clips, 4:38 in total, ElevenLabs voice `TYKLc7ViOIGE13dSZYlK` on `eleven_v4`.
  - The files are in `assets/narration/`, with `manifest.json`.
  - The page also carries an inline copy of the manifest (`<script id="narration-manifest">`) so narration works from `file://`. Regenerate that copy if `manifest.json` changes.
- **Facts:**
  - Claude facts come from the [Claude API docs](https://platform.claude.com/docs), checked 21 November 2026.
  - Internals are DeepSeek-V4-Pro's published values ([arXiv 2606.19348](https://arxiv.org/abs/2606.19348), [model card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro)), marked `*` on the page as a representative frontier design.
- **Lineage:**
  - This is audit ID **E1** ("v2-hardened", score 9.5) in `Downloads\animations\ANIMATIONS-ANALYSIS-2026-11-21.md`.
  - Source: `Downloads\animations\final-copies\final copies\one-token-end-to-end-v2-hardened\1121-0356__llm-frontier-journey-artifact__page.html`, plus an inline favicon.
  - The 2026-11-21 fact fixes are in that audit, §4b.
- **Known limits:** the two cosmetic limits from the audit no longer reproduce (measured 2026-11-27).
  - At 1440 × 900, the active axis label keeps at least 22 px from its neighbours on all twelve stages.
  - Below 900 px the axis labels are hidden, and every stage-12 label keeps at least 51 px from the screen edge
    at 390 and 360 px wide.
