# Handoff: One Token reader smoothness (2026-11-26)

Branch `fix/spatial-scroll-and-suite-nav` at `8cd4986`. All rules below come from the owner; follow them.

## Rules for this work

- Edit only files under `one-token/`. Everything in `shared/` and `journey-story/component-math.js` is read-only; other pages load it. Don't touch `suite-theme.css` or `micro-labs.css`. Don't patch three.js, its prototypes or browser globals.
- If a fix seems to need a shared file, stop and report why before adding an opt-in option.
- Before and after a change, measure each page that shares files with One Token: console errors, 4 s rAF p50/p95, draw calls and a screenshot. A new error, a p95 rise over 10% or a visual diff fails the change. Finish with `git diff --stat`.
- `_audit/page-dependencies.md` lists what every page loads. No file under `one-token/` is loaded by any other page. The reader itself is `/index.html`; `one-token/index.html` only redirects.

## Uncommitted work (needs committing)

`one-token/scene-diagram.js` and `one-token/scene-host.js` give the **Diagram** view an eased camera:

- The pose `g` follows its goal with critical damping (0.18 s, same as Spatial), so camera, token and stations glide together.
- These still cut: jumps of more than 1 stage, the opening ↔ story ↔ full-line (overview) shot changes, reduced motion, view switches, resizes, and any environment without a frame clock.
- The host crossfades cuts only. Small step changes glide without a crossfade. Opening → 1.1 and the finale overview now crossfade; before, they were hard cuts.
- Measured in Edge on the Radeon 890M (`scroll-view.cjs`, Diagram): within-lesson camera jumps over 15 units went from 5 (at 5.3, 6.1, 7.1–7.3) to 0. The 99th-percentile per-frame camera step went from 13.2 to 5.2.

Checks: lint passes, unit tests pass 69/69, and `verify:browser` passed. That browser run predates the last one-line fix (snap when `performance` is undefined), which only affects headless/vm runs. **Not rerun:** the other-page regression harness after the Diagram change. Run it before committing.

Other modified files in the tree (`end-to-end-beamline/index.html`, `end-to-end-swiss/index.html`, `index.html`, `one-token/reader.css`, `shared/concept-links.js`, `shared/suite-theme.css`) did **not** come from this session; another agent or the owner is editing them. Stage only the two files above.

## Already committed (8c53bbf and the two commits after it)

- Narration: a wheel or touch scroll pauses narration, and it resumes about 160 ms after scrolling stops, from the start of the sentence at the reading line (`reader.js` settleScroll, `playback.js` resume). Within the same step it resumes where it paused. It doesn't resume past the last step.
- Render budget is back to a 2× cap, 2.6M pixels and a 60 ms soft-frame threshold. The uncommitted 3× / 9.2M "highPower" budget was the lag on this integrated GPU.
- Spatial: each camera step is capped near the recent frame pace (`STEP_FLOOR` and related in `scene-spatial.js`), so a stalled frame no longer makes the camera leap. Post-stall camera step went from 7–10 units to about 2.
- Spatial: when the scene opens, `compileAsync` runs, then a one-time `primeDraw` renders every object once so ANGLE's deferred first-draw work happens up front (`scene-host.js`).
- The stage-glyph attributes are now written only when they change.

## Open items

1. **First-pass GPU stalls (~35–140 ms, both views).** The long-frame attribution API shows the page's own thread idle during these frames, so the time is spent in Edge's GPU process (ANGLE on D3D11). Some 100 ms stalls also appear on the second pass. They were reduced, not removed. The camera caps keep them from reading as jumps.
2. **Flaky browser check:** "1440 no-preference overhead returns from Diagram at the current canonical shot" failed 1 of 3 runs on unchanged code. It's in `tools/`, which is out of scope under the rules above, so it's reported, not fixed.
3. **Tests removed to follow the rules:** two playback unit tests for `resume()` (sentence snap, and continuing in the same step) and a `verify:browser` check that a wheel scroll resumes narration were written and passed, then reverted because they live in `tools/`. Re-add them if the owner allows `tools/` edits.
4. **Owner should confirm by eye** in Edge (Diagram view) that scrolling now glides and the opening/finale crossfades look right.

## Measurement harness (`_audit/harness/`, not part of the build)

- `deps.py <repo>` regenerates `_audit/page-dependencies.md`.
- `regress.cjs <afterRoot> <beforeRoot> <outDir>` checks the other pages before and after. For a baseline, extract HEAD to a folder (`git archive HEAD | tar -x -C <dir>`).
- `scroll-view.cjs msedge [staticRoot]` scrolls the reader twice (cold, then warm) in installed Edge and reports stalls, per-frame camera steps and jumps over 15 units. Set `VIEW=spatial` to click into Spatial; `?spatial=force` only blocks the fallback, it doesn't switch view.
- These scripts use absolute paths to this repo's `node_modules`; adjust them if the repo moves.
