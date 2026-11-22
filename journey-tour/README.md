# Guided Tour

Thirty stops through DeepSeek-V4-Pro, the same model as the [story](../journey-story/). It has a chapter rail, a component record for each stop, a 31-item index and a full text view.

- **Open:** <https://tafreeman.github.io/one-token-explainers/journey-tour/> · local <http://localhost:8000/journey-tour/>
- **Entry:** `index.html`. Deep links use `#stop-N`, for example [`#stop-17`](index.html#stop-17), the router.
- **Depends on:**
  - [`../shared/obs-core.html`](../shared/), the 3D engine, embedded with `?embed=1`.
  - [`../shared/journey-narration/`](../shared/journey-narration/), the clips and manifest.
  - Bricolage Grotesque from Google Fonts.
- **Narration:**
  - The 32-clip, 6:25 set shared with the story, voice Jade.
  - "Narrated tour" plays the intro, then each stop, moving the tour along as each clip ends. Choosing a stop yourself jumps the narration to it. Escape or Explore pauses it.
  - The page carries an inline copy of the manifest, so regenerate it if `../shared/journey-narration/manifest.json` changes.
- **Facts:** DeepSeek-V4 paper ([arXiv 2606.19348](https://arxiv.org/abs/2606.19348)) and the V4-Pro config, checked 21 November 2026.
- **Lineage:**
  - The audit ID is **J1** (score 9.3 after the V4 refresh) in `Downloads\animations\ANIMATIONS-ANALYSIS-2026-11-21.md`.
  - Source: `Downloads\animations\observatory\llm-observatory-merge\final\tour-v4.html`, which uses the V4 story's `STOPS` table and diagram builders.

## Controls

- **Moving through stops:** Start the journey, then use Next, Previous or the arrow keys.
- **Jumping:** the chapter rail and keys 1–6 jump by chapter. Home and End select the first and last stops.
- **More detail:** opens the component record.
- **Free roam:** Escape or Explore freely enables orbit and zoom.
- **All components:** opens the 31-item index.
- **Text view:** contains the entire story and the component reference.

If keys 1–6 don't respond, click outside the 3D view first, because focus inside the engine iframe swallows them.

## Validation states

| State | Page |
|---|---|
| tour-start | [Open](index.html?state=tour-start) |
| tour-ch1-bpe | [Open](index.html?state=tour-ch1-bpe) |
| tour-ch4-router | [Open](index.html?state=tour-ch4-router) |
| tour-ch5-decode | [Open](index.html?state=tour-ch5-decode) |
| tour-free-roam | [Open](index.html?state=tour-free-roam) |
| tour-narrow | [Open](index.html?state=tour-narrow) |

Acceptance results and frame times for the journey set are in [`../shared/README.md`](../shared/README.md).

## Known limits

Cosmetic, from the audit:
- Stops 10–12 reuse one camera.
- A sliver of "More detail" peeks below the sticky bar on stop 22.
