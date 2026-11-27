# One Token Explainers

Scroll-driven 3D explainers that follow one token through a large language model: how the model is built, and what happens between your prompt and the reply. Standalone HTML pages with Three.js, no build step.

**Live site:** <https://tafreeman.github.io/one-token-explainers/>

The root page (`index.html`) opens directly into the unified **One Token, End to End**
Continuous Reader: all 43 written explanation steps across 12 stages with their technical
details and specifications visible without extra disclosure clicks, paired with a
synchronized 3D figure (**Diagram** and **Spatial** views on one WebGL context), a
**Present** mode, dual narration tracks (9:41 full walkthrough and 4:38 quick summary),
and an inline **Component Inspector** with interactive micro-labs and lazy 3D Observatory
cutaways. Use **Steps** to jump within the lesson, or **Views** to switch to a
classic edition, a deep dive, or a component lab. **Other views** also appears at
the end of the lesson.
The factual, API, keyboard and focus corrections from PR #7 remain in place.

The November 23 [content and math review](docs/content-and-math-review-2026-11-23.md)
updates the written lessons and simulations. Original narration voices are retained;
some spoken descriptions still need matching updates in those voices.

## What is here

Root `index.html` hosts the unified Continuous Reader (with its scripts, styles, fonts,
and static fallback in `one-token/`). Each classic or deep-dive explainer also keeps its
own folder: open its `index.html`, and read its `README.md` for controls, sources, lineage
and known limits. A file sits in `shared/` only when more than one explainer uses it.

| Path | Title | What it is | Narration | Design |
|---|---|---|---|---|
| [`index.html`](index.html) (`one-token/`) | **One Token, End to End (Unified Reader)** | One continuous twelve-stage lesson pairing Swiss's written structure with Diagram and Spatial 3D views, Present mode, and an inline Component Inspector. | 45-clip 9:41 full + 14-clip 4:38 quick summary | Unified mineral paper, Roboto Flex & Martian Mono, `shared/theme-tokens.js`, Three.js 0.160 |
| [`end-to-end-swiss/`](end-to-end-swiss/) | **One Token, End to End (Swiss)** | Classic Swiss edition: " Paris" crosses twelve stages on one line, from training data to the streamed reply. | 14 clips, 4:38 | Swiss: orthographic 3D figures, Martian Mono, Three.js r128 |
| [`end-to-end-beamline/`](end-to-end-beamline/) | **One Token, End to End (Beamline)** | Classic Beamline edition: eleven physical stations in a pale hall, with Watch and Study modes. | 45 clips, 9:41 | Beamline: Archivo, one floor track, Three.js 0.160 |
| [`journey-story/`](journey-story/) | **One Token's Journey** | Six chapters take one token from raw text to the next token through DeepSeek-V4-Pro, with 3D rooms you can orbit and inspect. | 32 clips, 6:25 (shared) | Blueprint sheets plus the shared 3D engine |
| [`journey-tour/`](journey-tour/) | **Guided Tour** | Thirty stops through the same model, with a chapter rail and a 31-component index. | 32 clips, 6:25 (shared) | Same engine as the story |
| [`shared/`](shared/) | Shared files | `theme-tokens.js`, `obs-core.html` (the shared 3D Observatory), `micro-labs.js`, `concept-map.js` (the one table mapping lesson steps to Observatory codes and Inspect panels), `concept-links.js`, and `journey-narration/`. | n/a | n/a |

### Old URLs

Earlier paths are kept as redirect stubs so shared links still work. They forward the query string and `#hash`.

| Old path | Now |
|---|---|
| `one-token/` | `index.html` (unified reader promoted to root) |
| `one-token-end-to-end/` | `end-to-end-swiss/` |
| `one-tokens-journey/`, `one-tokens-journey/one-token-journey-3d.html` | `journey-story/` |
| `one-tokens-journey/tour-v4.html` | `journey-tour/` |
| `one-tokens-journey/obs-core.html` | `shared/obs-core.html` |

Don't add anything else to those two folders.

## Run locally

Local copies of these pages can open directly from disk with their sibling folders in place. To serve all pages over HTTP from the current working tree, use any one of these:

- **VS Code:** Run and Debug → **Run app** (F5). **Run app (pull latest)** runs `git pull --ff-only` first.
- **Explorer:** double-click `start.cmd`.
- **Terminal:** `./start.ps1` (`-Pull`, `-Port 8080`, `-NoBrowser`).

The launchers stop listeners on the selected port (3000 by default) and any
other copy of this repo's `server.js`, install dependencies when needed, and open
the site. If another app uses port 3000, choose a different port with
`./start.ps1 -Port 8080`. Without Node, `python -m http.server 8000` serves the
same files at <http://localhost:8000/>.

Every page loads its bundled Three.js build first, so the 3D views work offline. If that file is missing, `shared/three-loader.js` tries cdnjs, then unpkg, then jsDelivr, each pinned to the bundled bytes with a subresource-integrity hash. The pages use system fallback fonts offline. If the GPU drops the WebGL context, the scene pauses, shows a one-line text fallback, and redraws when the context comes back.

Keys pressed inside an embedded 3D view still drive the page around it: arrows, Home, End and Escape, plus 1–6 for chapters.

### Verify

```powershell
npm ci
npm run lint
npm test
npm exec -- playwright install chromium
npm run verify:browser
```

`npm run lint` checks script syntax (including inline scripts) and runs the fact
gate. `npm test` runs the Node test suite. `npm run build` runs syntax, fact and
micro-lab checks; it does not produce a bundle.

`npm run verify:browser` starts a local server and checks the root Reader and the
classic/deep-dive views. Reader coverage includes desktop, tablet and phone
layouts; Diagram and Spatial switching; seeking; keyboard and focus behavior;
narration controls; Inspector cutaways over HTTP and `file://`; and fallbacks
without JavaScript or WebGL. Classic-view coverage includes layout and automated
axe checks, iframe keyboard bridging, Swiss playback, context recovery, and
Three.js mirror order and integrity. These checks are not a complete accessibility
audit. To run selected sections, use, for example,
`npm run verify:browser -- --only=reader,keyboard,focus`. Set
`JOURNEY_SCREENSHOTS` to keep the layout screenshots.

On Windows, run `npm run verify:warp` for Microsoft WARP software rendering.
It checks the Story router drawer (<140 draw calls) and Reader Diagram and Spatial
views (<150 each), with no drawing during the measured idle window. The latency
gate uses the median of five trial p95s. The default budget is 160 ms, and CI
sets it to 150 ms via `WARP_P95_BUDGET_MS`.

### Component labs

- **Guided Tour** — [byte-pair merges](journey-tour/index.html?rm=1&lab=bpe#stop-3), [expert routing](journey-tour/index.html?rm=1&lab=moe#stop-17), [the GB200 roofline](journey-tour/index.html?rm=1&lab=roof#stop-24), and [UTF-8 streaming](journey-tour/index.html?rm=1&lab=stream#stop-26). Each lab opens under **More detail** at its stop.
- **Story** — [the KL penalty](journey-story/index.html?rm=1&lab=kl), [causal attention](journey-story/index.html?rm=1&lab=attention), [rotary position encoding](journey-story/index.html?rm=1&lab=rope), [KV cache sizes](journey-story/index.html?rm=1&lab=kv), and [the four residual streams](journey-story/index.html?rm=1&lab=mix).
- **Beamline Study** — mechanism-focused labs appear alongside the relevant steps, including MoE routing, the roofline and UTF-8 streaming.

The [3D Observatory](shared/obs-core.html?rm=1) also opens on its own.

## Credits

- **Narration** voiced with [ElevenLabs](https://elevenlabs.io/) (`eleven_v4`), on a paid plan. Voices: Sylvie (Beamline), Jade (journey pages), and ElevenLabs voice `TYKLc7ViOIGE13dSZYlK` (Swiss).
- **3D** by [Three.js](https://threejs.org/):
  - Swiss and the shared engine use the bundled r128 build.
  - Beamline uses the bundled r160 build.
  - All three fall back to cdnjs, unpkg and jsDelivr. The upstream MIT license is in `shared/vendor/THREE-LICENSE.txt`.
- **Fonts** from [Google Fonts](https://fonts.google.com/).

## Fact sources

The lessons cite primary references including:

- The DeepSeek-V4 paper, [arXiv 2606.19348](https://arxiv.org/abs/2606.19348), and the [DeepSeek-V4-Pro Hugging Face model card and config](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro).
- [Anthropic's Claude API docs](https://platform.claude.com/docs). The check dates are 21 November 2026 for the Swiss and journey pages, and 22 November 2026 for Beamline.

Model details change. If a page disagrees with the current docs, the docs win.

## License

Source code is under the [MIT license](LICENSE). Narration audio, text and diagrams are under [CC BY 4.0](LICENSE-CONTENT.md). Third-party libraries and fonts keep their own licenses.
