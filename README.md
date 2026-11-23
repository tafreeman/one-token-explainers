# One Token Explainers

Scroll-driven 3D explainers that follow one token through a large language model: how the model is built, and what happens between your prompt and the reply. Standalone HTML pages with Three.js, no build step.

**Live site:** <https://tafreeman.github.io/one-token-explainers/>

## What is here

Each explainer has its own folder: open its `index.html`, and read its `README.md` for controls, sources, lineage and known limits. A file sits in `shared/` only when more than one explainer uses it.

| Folder | Title | What it is | Narration | Design |
|---|---|---|---|---|
| [`end-to-end-swiss/`](end-to-end-swiss/) | **One Token, End to End** | " Paris" crosses twelve stages on one line, from training data to the streamed reply: how Claude Fable 5.2 is made and how it answers you. | 14 clips, 4:38 | Swiss: orthographic 3D figures, Martian Mono, Three.js r128 |
| [`end-to-end-beamline/`](end-to-end-beamline/) | **One Token, End to End (Beamline)** | The same story drawn as eleven physical stations in a pale hall, with " Paris" as a blue token you follow from corpus to tool loop. | 45 clips, 9:41 | Beamline: Archivo, one floor track, Three.js 0.160 |
| [`journey-story/`](journey-story/) | **One Token's Journey** | Six chapters take one token from raw text to the next token through DeepSeek-V4-Pro, with 3D rooms you can orbit and inspect. | 32 clips, 6:25 (shared) | Blueprint sheets plus the shared 3D engine |
| [`journey-tour/`](journey-tour/) | **Guided Tour** | Thirty stops through the same model, with a chapter rail and a 31-component index. | 32 clips, 6:25 (shared) | Same engine as the story |
| [`shared/`](shared/) | Shared files | `obs-core.html`, the Three.js engine both journey pages embed (it also opens on its own), and `journey-narration/`, the clips both journey pages play. | n/a | n/a |

The two End to End folders are two designs of one story. The two journey pages are two ways through one model.

### Old URLs

The site's first layout is kept as redirect stubs so shared links still work. They forward the query string and `#hash`.

| Old path | Now |
|---|---|
| `one-token-end-to-end/` | `end-to-end-swiss/` |
| `one-tokens-journey/`, `one-tokens-journey/one-token-journey-3d.html` | `journey-story/` |
| `one-tokens-journey/tour-v4.html` | `journey-tour/` |
| `one-tokens-journey/obs-core.html` | `shared/obs-core.html` |

Don't add anything else to those two folders.

## Run locally

Local copies of these pages can open directly from disk with their sibling folders in place. To serve all pages over HTTP, run this from the repository root.

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000/>.

Every page loads its bundled Three.js build first, so the 3D views work offline. If that file is missing, `shared/three-loader.js` tries cdnjs, then unpkg, then jsDelivr, each pinned to the bundled bytes with a subresource-integrity hash. The pages use system fallback fonts offline. If the GPU drops the WebGL context, the scene pauses, shows a one-line text fallback, and redraws when the context comes back.

Keys pressed inside an embedded 3D view still drive the page around it: arrows, Home, End and Escape, plus 1–6 for chapters.

### Verify

```powershell
npm ci
npm run lint
npm test
npm exec -- playwright install chromium
npm run verify:browser
npm run verify:warp
```

`lint` syntax-checks the shared scripts and every inline `<script>` block, then runs the fact gate. `verify:browser` serves the site and loads Swiss, Beamline, Story, Tour and the Observatory at 1440×900 and 390×844. It checks for horizontal overflow, console errors and axe-core WCAG 2.1 AA violations, and it tests iframe keyboard bridging over HTTP and `file://`, keyboard focus order (Tab reaches the Story drawer's lab controls, the Observatory canvas shows a 3:1 focus ring, and hidden Observatory panels leave the Tab order), WebGL context loss and restore, the mirror order, and SRI rejection of altered bytes. Pass `--only=layout,keyboard,focus,context,mirrors` to run some of these. Set `JOURNEY_SCREENSHOTS` to keep the layout screenshots. `verify:warp` runs on Windows. It opens the Story router drawer under Microsoft's software renderer (WARP) and requires fewer than 90 draw calls, a camera-nudge p95 under 100 ms, and no frames during 900 ms of idle. WARP renders on the CPU, so the 100 ms budget assumes a 24-thread machine. The gate judges the median of five trials. Set `WARP_P95_BUDGET_MS` on smaller hosts; CI's 4-vCPU runner uses 150 ms.

### Component labs

- **Guided Tour** — [byte-pair merges](journey-tour/index.html?rm=1&lab=bpe#stop-3), [expert routing](journey-tour/index.html?rm=1&lab=moe#stop-17), [the B200 roofline](journey-tour/index.html?rm=1&lab=roof#stop-24), and [UTF-8 streaming](journey-tour/index.html?rm=1&lab=stream#stop-26). Each lab opens under **More detail** at its stop.
- **Story** — [the KL penalty](journey-story/index.html?rm=1&lab=kl), [causal attention](journey-story/index.html?rm=1&lab=attention), [rotary position encoding](journey-story/index.html?rm=1&lab=rope), [KV cache sizes](journey-story/index.html?rm=1&lab=kv), and [the four residual streams](journey-story/index.html?rm=1&lab=mix).
- **Beamline Study** — [the sampling contract](end-to-end-beamline/index.html?rm=1&study=1&lab=sample).

The [3D Observatory](shared/obs-core.html?rm=1) also opens on its own.

## Credits

- **Narration** voiced with [ElevenLabs](https://elevenlabs.io/) (`eleven_v4`), on a paid plan. Voices: Sylvie (Beamline), Jade (journey pages), and ElevenLabs voice `TYKLc7ViOIGE13dSZYlK` (Swiss).
- **3D** by [Three.js](https://threejs.org/):
  - Swiss and the shared engine use the bundled r128 build.
  - Beamline uses the bundled r160 build.
  - All three fall back to cdnjs, unpkg and jsDelivr. The upstream MIT license is in `shared/vendor/THREE-LICENSE.txt`.
- **Fonts** from [Google Fonts](https://fonts.google.com/).

## Fact sources

Every displayed claim was checked against:

- The DeepSeek-V4 paper, [arXiv 2606.19348](https://arxiv.org/abs/2606.19348), and the [DeepSeek-V4-Pro Hugging Face model card and config](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro).
- [Anthropic's Claude API docs](https://platform.claude.com/docs). The check dates are 21 November 2026 for the Swiss and journey pages, and 22 November 2026 for Beamline.

Model details change. If a page disagrees with the current docs, the docs win.

## Licence

Source code is under the [MIT licence](LICENSE). Narration audio, text and diagrams are under [CC BY 4.0](LICENSE-CONTENT.md). Third-party libraries and fonts keep their own licences.
