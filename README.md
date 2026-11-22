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

Open [the router at Tour stop 17](journey-tour/index.html?rm=1&lab=moe#stop-17), [attention in Story](journey-story/index.html?rm=1&lab=attention), or [the Beamline Study sampling probe](end-to-end-beamline/index.html?study=1&lab=sample). Local copies of these pages can open directly from disk with their sibling folders in place. To serve all pages over HTTP, run this from the repository root.

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000/>.

Story, Tour, the Observatory and Beamline bundle their 3D renderer. Swiss uses a CDN. The pages use system fallback fonts offline.

## Credits

- **Narration** voiced with [ElevenLabs](https://elevenlabs.io/) (`eleven_v4`), on a paid plan. Voices: Sylvie (Beamline), Jade (journey pages), and ElevenLabs voice `TYKLc7ViOIGE13dSZYlK` (Swiss).
- **3D** by [Three.js](https://threejs.org/):
  - The Swiss page uses r128 from cdnjs, with unpkg and jsDelivr as fallbacks.
  - The shared engine uses the bundled r128 build.
  - Beamline uses the bundled r160 build. The upstream MIT license is in `shared/vendor/THREE-LICENSE.txt`.
- **Fonts** from [Google Fonts](https://fonts.google.com/).

## Fact sources

Every displayed claim was checked against:

- The DeepSeek-V4 paper, [arXiv 2606.19348](https://arxiv.org/abs/2606.19348), and the [DeepSeek-V4-Pro Hugging Face model card and config](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro).
- [Anthropic's Claude API docs](https://platform.claude.com/docs). The check dates are 21 November 2026 for the Swiss and journey pages, and 22 November 2026 for Beamline.

Model details change. If a page disagrees with the current docs, the docs win.

## Licence

Source code is under the [MIT licence](LICENSE). Narration audio, text and diagrams are under [CC BY 4.0](LICENSE-CONTENT.md). Third-party libraries and fonts keep their own licences.
