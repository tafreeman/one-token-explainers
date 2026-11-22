# One Token, End to End (Beamline)

This tells the same story as [`end-to-end-swiss/`](../end-to-end-swiss/), drawn differently. A frontier LLM is made and served along one floor track of eleven physical stations in a pale hall: corpus, tokenizer, pretraining, post-training, release gate, request, model, decode, stream, tool loop, reply. The token " Paris" rides the line as a blue tile, from a web page in the training corpus to a tool call and a streamed answer from Claude Fable 5.2.

- **Open:** <https://tafreeman.github.io/one-token-explainers/end-to-end-beamline/> · local <http://localhost:8000/end-to-end-beamline/>
- **Entry:** `index.html`
- **Controls:**
  - Scroll to advance through 45 beats in seven parts, or jump with the station strip at the bottom.
  - **Sound** speaks the beat you've settled on. **Watch** plays the narration and moves the page along.
  - "Or run it end to end" replays the whole line with the camera on the token.
- **Depends on:**
  - Three.js 0.160 as an ES module from jsDelivr (importmap).
  - Archivo and Azeret Mono from Google Fonts.
  - Nothing outside this folder.
- **Narration:**
  - 45 clips, one per `data-beat`, 9:41 in total, ElevenLabs voice Sylvie on `eleven_v4`.
  - The clips are in `assets/narration/<beat-id>.mp3`.
  - Captions and durations are inline in `<script type="application/json" id="narration-data">`, which also holds each clip's `src`.
  - `narration-script.json` is the narration text of record.
  - The build tool that synthesises clips lives outside this repo (`~/.claude/skills/training-video/assets/live/narration/build.mjs`). It embeds audio inline by default. If you regenerate clips, write them to `assets/narration/` and keep `src` pointing there.
- **Facts:**
  - Claude facts come from the [Claude API docs](https://platform.claude.com/docs), checked 22 November 2026.
  - Internals are DeepSeek-V4-Pro's published values, marked "DeepSeek‑V4 representative" beside each number. Illustrative values are marked as such. The Sources ledger at the end lists every source.
- **Lineage:**
  - Source: `Downloads\animations\llm-frontier-journey\llm-frontier-journey-fork\index.html` (11-20), published as claude.ai artifact `XsYMcJTj9gmvuayR2AtmTn`.
  - The audit (`ANIMATIONS-ANALYSIS-2026-11-21.md`) lists it as **E8** ("v1 Braun fork", "superseded by E1"). That label is wrong: Beamline is a sibling design direction, not an earlier draft of the Swiss page.
  - Added here on 2026-11-22. The steps were:
    1. Moved the inline audio out to MP3s. All 45 are byte-identical to the build's `narration/out/`.
    2. Added the site favicon.
    3. Ported the Swiss page's 2026-11-21 fact fixes, as listed below.
- **Fact fixes applied on 2026-11-22:**
  - The docs date (was 2026-11-03).
  - The tokenizer is now "introduced with Opus 4.7".
  - Sampling: *non-default* temperature, top_p and top_k values return a 400.
  - Stop reasons are framed as examples, and `pause_turn` is added.
  - The 10% KV figure now credits the sparse *and* heavily compressed layers.
  - FP8 training is kept separate from the FP4 experts that quantization-aware training produces in the released model.
  - The ledger optimizer reads Muon + AdamW.
- **Known limits:**
  - Three.js loads from one CDN, with no fallback.
  - The page needs WebGL. Without it, a note appears and every step still reads as text.
  - It hasn't had the Swiss page's multi-viewport visual audit.
