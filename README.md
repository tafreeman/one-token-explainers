# One Token Explainers

Scroll-driven 3D explainers that follow one token through a large language model: how the model is built, and what happens between your prompt and the reply. Standalone HTML pages with Three.js, no build step.

**Live site:** <https://tafreeman.github.io/one-token-explainers/>

## What is here

| Folder | Experience | What it is |
|---|---|---|
| [`one-token-end-to-end/`](one-token-end-to-end/) | **One Token, End to End** | "Paris" crosses twelve stages on one line, from training data to the streamed reply: how Claude Fable 5.2 is made and how it answers you. Scroll-driven 3D figures with 4:38 of narration (14 MP3s plus `manifest.json`). |
| [`one-tokens-journey/`](one-tokens-journey/) | **One Token's Journey** | A scrolling 3D story of one token through DeepSeek-V4-Pro in six chapters, with 3D rooms you can orbit and inspect. [`one-token-journey-3d.html`](one-tokens-journey/one-token-journey-3d.html) |
| [`tour-v4.html`](one-tokens-journey/tour-v4.html) | **Guided Tour** | Thirty stops through the same model, with a chapter rail and a 31-component index. [`tour-v4.html`](one-tokens-journey/tour-v4.html) |
|[`obs-core.html`](one-tokens-journey/obs-core.html) | 3D engine | [`obs-core.html`](one-tokens-journey/obs-core.html) is the shared Three.js engine the story and tour embed in an iframe (`obs-core.html?embed=1`). It also opens on its own. |

`one-tokens-journey/index.html` redirects to the scrolling story. The page filenames in that folder link to each other by name, so keep them as they are. See [`one-tokens-journey/README.md`](one-tokens-journey/README.md) for its controls, deep-link states and test notes.

## Run locally

The pages need HTTP, not `file://`: they fetch the narration manifest and embed `obs-core.html` in iframes. From the repository root:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000/>.

Three.js and the fonts load from CDNs, so you need an internet connection on first load.

## Credits

- **Narration** voiced with [ElevenLabs](https://elevenlabs.io/), on a paid plan.
- **3D** by [Three.js](https://threejs.org/) (r128), loaded from cdnjs, with unpkg and jsDelivr as fallbacks.
- **Fonts** from [Google Fonts](https://fonts.google.com/).

## Fact sources

Every displayed claim was checked against:

- The DeepSeek-V4 paper, [arXiv 2606.19348](https://arxiv.org/abs/2606.19348), and the [DeepSeek-V4-Pro Hugging Face model card and config](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro).
- [Anthropic's Claude API docs](https://platform.claude.com/docs), as of 21 November 2026.

Model details change. If a page disagrees with the current docs, the docs win.

## Licence

Source code is under the [MIT licence](LICENSE). Narration audio, text and diagrams are under [CC BY 4.0](LICENSE-CONTENT.md). Third-party libraries and fonts keep their own licences.
