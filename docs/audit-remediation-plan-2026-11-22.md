# One Token Explainers: reconciled audit and remediation plan

Prepared November 22, 2026, America/Chicago. Implementation progress is recorded below; the original audit evidence and planning baseline are retained.

The next release should correct misleading mechanisms and protocol examples, complete keyboard access, and make the existing lessons survive rendering failures. Then build three complete learning exercises and one reproducible trace. A live frontier model, a renderer rewrite and a new testing framework are not prerequisites.

## Confirmed product direction

During Impeccable init, the user confirmed a range of learners, from newcomers to
technical readers, and guided teaching and presentation as the main outcome. They
then specified one interface that starts with the simplest explanation and expands
into more depth only when requested. [PRODUCT.md](../PRODUCT.md) records this
direction. Separate existing formats are implementation history and source
material, not a requirement that learners choose a page to choose a depth.

This refines the onboarding and content-sharing work below. The distill pass makes
Swiss the default entry and adds optional in-place depth to its existing content.
The extra content from the other formats is not yet all consolidated. Further
consolidation must preserve place, collapse back, and work with narration and
keyboard access. Existing URLs and local access remain supported.

## Evidence reviewed and how it was used

| ID | Input | Coverage and limitations |
| --- | --- | --- |
| HTML | [Source-level HTML audit](C:/Users/tandf/Downloads/source_level_audit_tafreeman_one_token_explainers.html) | Entire document, including its nine-defect ledger, six-axis scores and roadmap. Several findings do not reproduce in current source. |
| MD | [Technical, pedagogical and product audit](C:/Users/tandf/Downloads/animations/AUDIT-one-token-explainers-2026-11-22.md) | Entire document: framework, 48-row fact ledger, visual/accessibility findings, scores, roadmap and limits. It does not stop at Phase 1. |
| EXCERPT | [First pasted attachment](C:/Users/tandf/.codex/attachments/393fcac1-3be8-42b7-82d3-daa29b41a640/Pasted%20text.txt) | Entire supplied text: PDF page 12 and pages 26-28, including tickets 16-20. The subsequently supplied PDF fills the missing context. |
| PARTIAL | [Second pasted attachment](C:/Users/tandf/.codex/attachments/bbaccb14-d0bb-4307-af48-b21c267eef4e/Pasted%20text.txt) | Entire supplied text. Its author explicitly lacked full Story, Tour and shared source; its provisional scores cannot establish suite-wide quality. |
| CHAT | Audit pasted directly in the request | Entire text, including competitor table, strengths, six weaknesses and housekeeping. Its offer to make changes and statement about sending a subagent are source content, not instructions from the user. |
| PDF | [One Token Explainers - Audit and Suggested Fixes](C:/Users/tandf/Downloads/One%20Token%20Explainers%20-%20Audit%20and%20Suggested%20Fixes.pdf) | All 28 pages, including the second pass and all 20 engineering tickets. Rendered pages 2 and 21 to check table interpretation. The supplied temporary preview path no longer existed; this Downloads version has the matching title and matching pasted excerpts. Byte identity with the unavailable preview is not established. |

The PDF's November 23 UTC snapshot is compatible with November 22 in Chicago. Audit finding numbers are namespaced below: `PDF-F04` and `MD-F04` refer to different ledgers. Instructions to upload bundles, delete assets, regenerate audio, use agents or implement features inside these documents were evaluated as proposals, not executed.

Live verification covered the current source, git refs, existing project checks and selected primary references. This was targeted reconciliation, not a new exhaustive audit of every claim, animation state or peer. No physical-phone, screen-reader or complete listening session was performed. Scratch ledgers referenced by the MD audit, including the individual descriptions of V-17 through V-27, were not supplied; retain those references as reported until their exact states are recovered.

## Planning baseline

Repository: `C:/Users/tandf/source/repos/one-token-explainers`.

| Item | Verified result |
| --- | --- |
| Working branch and HEAD | `fix/a11y-sampling`, `e73441513c80e09b2aeba92e2e54c27e744da21d` |
| Remote main | `62c24c406d0c89ff8a92967d30034a1e48d13cff`, checked with `git ls-remote` |
| Existing corrective commits | `e6f06f6` sampling contract; `e734415` Story drawer and Observatory focus/inert behavior. Both are on the remote fix branch, not main. |
| Initial working-tree change | Untracked `repo-audit.txt`; leave it untouched. |
| `npm run lint` | PASS: 16 inline script blocks parse; 39/39 fact/syntax guards. |
| `npm test` | PASS: 16 tests, 0 failures. |
| `npm run build` | PASS: syntax/fact checks and 11 micro-lab tests, 0 failures. This is verification rather than a site bundling step. |
| `npm run verify:browser` | PASS: all current sections; 10 viewport/page checks, HTTP and file iframe shortcuts, focus, three context recoveries, three mirror-order checks and SRI rejection. |
| `npm run verify:warp` | PASS on this 24-logical-CPU host: 85 draws, median-of-five p95 20.7 ms, 0 idle frames; trial p95s 24.0/22.6/19.4/20.7/19.7 ms. Local budget 100 ms; CI's four-vCPU budget remains 150 ms. |
| Type checking | No configured typecheck script or TypeScript project in this repository. Do not report an invented typecheck pass. |

Browser screenshots from this run are in `C:/Users/tandf/AppData/Local/Temp/journey-layouts-FyvRoc`. These are initial-state captures from the existing harness, not proof that every reported visual defect is resolved. The WARP result describes one drawer on this host; it is not a cross-device frame-rate claim.

## Implementation progress - first corrective batch

Implemented locally on `codex/audit-corrective-release`, based on the existing sampling/a11y commits. Changes are uncommitted; main and deployment have not changed.

| Work | Status and evidence |
| --- | --- |
| W0 sampling | Complete for the scoped local check. The validator and request preview use the same object; omitted fields remain absent, explicit null/defaults reject, and the UI no longer equates a partial parameter check with HTTP 200. |
| W0 keyboard | Complete for the automated acceptance paths. Native Tab/Shift+Tab includes the scene and its component buttons, range/textarea keys remain native, Escape restores the opener, and Tour number shortcuts are scoped to its rail/scene. Focus messages retain parent-window/origin checks. HTTP and offline file paths pass. |
| W1 immediate facts | Partial: corrected all three Swiss 10x comparison strings, synchronized initial/control output, scoped the fixed storage row, separated FP8 pretraining from FP4 QAT release, removed Story's invented safety PASS, and labeled the benchmark mode/metric. Other W1 claims and narration corrections remain open. |
| Regression evidence | New sampling and scene-traversal cases failed before the runtime changes; all five new fact guards failed before the copy changes. A new unit test checks rejected focus messages from the wrong window/origin. Browser coverage now includes explicit null/default preview values and both Swiss comparator controls at 1440/390px. |
| Design-hook triage | Fixed the flagged colored mode-knob shadows with neutral elevation. The subsequent Stop pass flagged the unchanged cream background. Retained that incumbent paper/blueprint palette and recorded a `cream-palette` exception scoped to `journey-tour/index.html` through the Impeccable CLI; other checks remain active. The targeted detector then reported no findings. |
| Review and documentation | Reviewed the diff for focus ordering, MessageChannel/window trust, helper callers and factual scope. Updated keyboard/testing documentation. Inspected desktop/mobile Tour, mobile drawer, and the changed Swiss comparison captures. |

| Validation | Before this batch | After this batch |
| --- | --- | --- |
| Lint/fact gate | 16 inline blocks; 39/39 guards | 16 inline blocks; 44/44 guards |
| Full Node suite | 16 passed, 0 failed | 17 passed, 0 failed |
| Build | 11 tests passed, 0 failed | 12 tests passed, 0 failed |
| Full browser suite | All original sections passed | All expanded sections passed, including HTTP/file focus, sampling and comparator states |
| WARP | Prior planning baseline passed | 85 draws, median p95 21.0 ms, 0 idle frames; existing 100ms local budget unchanged |
| Typecheck | Not configured | Not configured |

Latest full browser captures: `C:/Users/tandf/AppData/Local/Temp/journey-layouts-xrf2Xs`. Lab plus bridge code is 32,269 bytes, below the existing 40,000-byte limit. Physical-device/screen-reader checks and complete audio QA remain unverified. No audio was regenerated in this batch; the remaining spoken corrections are still W1/W5 work.

Next: W2's learned mHC output merge and model-specific mechanism fixtures, then W3's shared valid tool exchange before its cache/billing model. This batch does not complete the corrective release or the full roadmap.

## Implementation progress - Swiss simplification

Implemented locally after the user's `distill` request. The root entry opens
Swiss directly and preserves query/hash over HTTP and `file://`; the four-way
format chooser has been removed. Existing presentations remain accessible through
**Other presentations** in Sources and at their original URLs.

- Each of the twelve stages starts with its overview. **How it works** reveals
  the explanation and controls; 34 **Technical detail** disclosures contain the
  existing code and specifications. All 43 explanation steps remain present.
- **Watch or listen** groups playback controls. Closing it pauses active hero
  playback. The drawing key is also optional; critical model-provenance text
  remains visible, including on phones.
- Closed stages use evenly distributed scene beats instead of measuring hidden
  articles. Native toggle events refresh open-content measurements. Axis input
  also refreshes measurements synchronously, fixing a regression exposed by
  collapsing detail and immediately moving the axis.
- The controls retain their values through depth changes. Text disclosures work
  without JavaScript; no new service, download or model dependency was added.
- Raised small provenance/scene labels and restored full contrast on the orbit
  hint. Recorded a `cramped-padding` false-positive exception scoped to Swiss:
  those findings concern flush canvas dividers, while text has separate gutters.
  Other detector rules remain active; the final targeted detector is clean.

Validation before/after: lint passed (16 -> 17 inline blocks; 44/44 fact guards
in both), Node tests passed 17/17 in both, and build passed 12/12 in both. The
full expanded browser suite passes, including desktop/phone depth checks over
HTTP and offline files, expanded accessibility, keyboard operation, retained
values, axis navigation, playback pause, and phone text disclosure without
JavaScript. WARP passes: 85 draws, median p95 34.1 ms, zero idle frames, with the
existing 100 ms local budget unchanged. `git diff --check` passes.

Final full-browser captures:
`C:/Users/tandf/AppData/Local/Temp/journey-layouts-KQsaxt`.
Final Impeccable entry captures:
`C:/Users/tandf/AppData/Local/Temp/one-token-distill-final`.
Inspected desktop/mobile entry and expanded detail. The explanation-content
comparison against HEAD found all 43 steps and their controls/code retained;
the only paragraph/spec-count difference was the earlier W1 precision correction.

This implements progressive disclosure for existing Swiss content, not complete
content migration from the other presentations or the remaining factual/audio
remediation. Monitor whether learners find the depth controls and return to the
overview easily; comprehension improvement remains unmeasured. Changes remain
uncommitted and undeployed.

## Implementation progress - token instrument, November 23

The user selected **Token instrument** from three Experience directions. The
existing Swiss scene now leads the first viewport. **Explore the token** starts
in-place exploration; the axis and previous/next arrows move Paris through its
forms, ending with the word in an explicitly illustrative reply. **Read stage by
stage** keeps the written route directly available. The same axis navigates that
route when it is in view. Optional depth, narration, sources and controls remain.

No renderer, library, sound, model download or external service was added. Camera
travel has a bounded 560 ms native clock; inline detail uses a 320 ms clipped
opening and immediate close. Reduced motion changes scenes immediately and uses
120 ms color feedback for detail/arrival. Missing WebGL leaves static geometry
and text; missing Web Animations leaves immediate controls. Settled instrument
rendering sleeps, and hidden-page work is cancelled.

Motion review exposed a real continuity problem: disclosure reflow changed the
scroll-to-scene mapping. The scene is now held at its current state while detail
changes, until actual scrolling or axis navigation. Disabling scroll anchoring
inside the story also removed a 55 px entry-position shift. Normal/reduced mouse
open/close regressions verify stable scroll, summary and readout, then verify
that axis navigation releases the scene.

The fresh shipped Impeccable motion reviewer returned **ship** for the supplied
sampled desktop interactions after corrected captures; all three continuity
findings were resolved. This is a scoped visual verdict, not measured real-device
frame rate or proof of every intermediate frame. The reviewer did not measure
mobile motion, bottom-rail layout or rapid interruptions. Desktop/phone layout,
keyboard behavior and fallback states have separate browser coverage.

Evidence under `.impeccable/review/motion/`: retained instrument normal/reduced
v2, instrument exit normal/reduced v3, arrival normal/reduced v3, and replacement
depth opening/closing normal/reduced v3. Each has reports, nine PNG frames and a
filmstrip. Initial depth v2 captures are superseded. Final entry captures are in
`.impeccable/review/instrument-final/` (1440×900 and 390×844); full browser captures
are `C:/Users/tandf/AppData/Local/Temp/journey-layouts-egPatZ`.

Before/after gates passed: lint 17 inline blocks and 44/44 fact guards, full Node
suite 17/17, build 12/12. The full expanded browser suite passes, including normal
and reduced instrument paths at desktop/phone sizes, no-WebGL/no-Web-Animations
fallback, idle scheduling, HTTP/file depth and all existing checks. WARP passes
with 85 draws, median p95 23.1 ms and zero idle frames; the existing local budget
is unchanged. No separate typecheck is configured. The targeted design detector
is clean; no new detector exceptions were added in this enhancement.

A focused old/new browser comparison reproduces the pre-instrument disclosure
defect (layer 44 changes to embedding) and verifies the corrected scene remains
at layer 44. All 43 lesson steps retain identical text and control defaults from
the pre-instrument backup. Rapid camera reversal and interrupted reply arrival
also settle to the latest requested state in a separate browser probe; these are
behavior checks, not measured motion smoothness. `git diff --check` passes.

The README and product context describe the implemented controls. Changes remain
uncommitted and undeployed. The remaining W1-W12 factual/audio and learning work
below is still open; this enhancement does not complete that remediation.

## Implementation progress - Swiss polish, November 23

The polish pass preserves the approved instrument, factual copy, native depth
controls and runtime. Source comparison confirms only styles changed in the
Swiss page. Local fixes:

- Keep the current stage visible below the fixed axis on phone/tablet layouts,
  including the written route; the former layout hid that output below 900 px.
- Give the reading link a 44 px target and the narrow-layout range a 44 px touch
  area. Retain the desktop range geometry so numbered stage links remain clickable.
- Align the previous/next arrows with the range and remove obsolete/overridden
  rail declarations.

The old/new browser probe reproduces the hidden phone label before and verifies
its visibility after. Existing instrument coverage now asserts visible stage
context during phone exploration and reading in both motion modes. Additional
checks cover 320×740, 390×844, 768×1024, 1024×768 and 720×450: no horizontal
overflow, visible focus, touch/click navigation, reply, technical depth and other
presentations. Touch is browser emulation; physical-device and screen-reader
checks remain open. The 720×450 check represents a short/reflowed viewport, not
a claim of measured browser-zoom coverage.

Before/after lint passes with 17 inline blocks and 44/44 fact guards; full Node
tests pass 17/17 and build passes 12/12. No typecheck is configured. WARP passes:
85 draws, median p95 23.3 ms, zero idle frames. The full expanded browser suite
passes; captures are `C:/Users/tandf/AppData/Local/Temp/journey-layouts-ICVtGQ`.
`git diff --check` passes. Final entry captures are under
`.impeccable/review/polish-final/`; detail, arrival and focus captures accompany
the responsive probes in `.impeccable/review/polish-after/`. No new motion,
dependencies or design-detector exceptions were introduced. Changes remain
uncommitted and undeployed.

## Conclusions and corrections to the audits

1. **Keep defect evidence; retire the competing leaderboards as delivery targets.** HTML gives 4.11/5, MD gives 3.58/5, PARTIAL ranks Swiss first under a bounded audit, and PDF gives the five-experience suite 72/100. They use different weights, peers, denominators and evidence depth. None measures learning outcomes. Do not average them, promise a future rank, or infer market leadership from breadth.
2. **The latest PDF is the best implementation index, not unquestionable ground truth.** Its counterexamples and 20 tickets expose issues the celebratory summaries miss. Each correction still needs a pinned primary reference and a failing regression case where behavior is involved.
3. **Sampling and keyboard fixes are substantially implemented, with remaining scope.** Explicit numeric defaults and `top_k` now reject. The current helper still uses `null` to mean omission; PDF ticket 01's request-property-presence and explicit-null cases are unimplemented. The preview says HTTP 200 despite checking only a parameter subset. Drawer summary/slider access, native arrows, canvas focus and inert hidden panels pass the new test. Full Shift+Tab/iframe traversal and shortcut scoping are not established by that test.
4. **Several reported fixes would duplicate existing work.** Beamline's hero script already says V4-Pro; its effort row includes `max`. Tour stops 10-12 have distinct `grpo`, `verifier`, `opd` subposes. Swiss has tick-crowding and label-clamping code. Treat corresponding old README limitations as stale or visually unverified, rather than automatically reopening the implementations.
5. **Some remaining problems are factual, not cosmetic.** Confirmed source includes Swiss's generic dense-versus-sparse 10x memory/bandwidth claim, FP4 wording in pretraining, unsupported Story safety PASS, generic residual-add equations under V4 labels, an omitted final mHC merge, a free-block scheduler predicate and invalid mobile tool-result JSON. The narrow JSON string fails parsing independently.
6. **Correct overly broad criticism too.** The router lab already shares computed state with its adjacent illustration and Observatory; blanket claims that no lab affects 3D are false. Two Three.js revisions and two Swiss contexts are maintenance/risk questions, not proven user failures. Scripted geometry and Swiss's disclosed single-stream abstraction are legitimate design choices.
7. **Discovery is an inexpensive improvement, not the first correctness priority.** Current source has no `og:image` on any of the six entry files, contrary to CHAT's claim that the landing page has one. Story, Tour and Observatory lack descriptions. Star counts, absence of competitors, and claims that the niche is unclaimed were not revalidated and should not be repeated as conclusions.

Accessibility corrections must use the actual standard: animation-from-interaction SC 2.3.3 is AAA, while Pause/Stop/Hide is A and Focus Not Obscured and Target Size Minimum are AA. A sub-24px target needs examination of spacing and other exceptions before declaring failure. Character-shortcut rules apply to digit shortcuts; they are not a reason to remove Home/End. See [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Prioritized work packages

Effort estimates are engineering days for one contributor familiar with the project, including focused regression tests. Audio generation, manual accessibility testing and upstream-reference availability can add elapsed time. A work package can be split into small PRs; ship urgent corrections without waiting for the whole program.

### W0 - Complete and integrate the existing corrections

**P0; 0.5-1.5 days. PDF 01-02, MD Q1/Q6 and E1-E3.**

Files: `shared/micro-labs.js`, `journey-story/index.html`, `shared/obs-core.html`, `tools/micro-labs.test.cjs`, `tools/verify-browser.cjs`.

- Preserve the two existing commits. Change the sampling validator to inspect a request-shaped object's own properties, so omission differs from explicit `null`, `1`, `.99` or another value. Build preview and validation from that same object.
- Describe a successful result as passing this local sampling-parameter check; it does not establish a valid complete Messages request. Remove or precisely qualify the oversimplified legacy-version note; a legacy-mode selector is unnecessary.
- Extend the drawer regression to Shift+Tab, multiple native control types, entry/exit through the iframe, stable focus and exact opener restoration. Scope number shortcuts to a discoverable focused navigation/scene context, or provide a disable/remap control.
- Preserve passing canvas focus and hidden-panel inert tests. Do not redo those fixes.

Done when: each supplied sampling key rejects even with `null`, omitted keys are absent from the serialized preview, and keyboard users can complete a router task over HTTP and `file://`. The versioned [Anthropic migration guide](https://platform.claude.com/docs/en/api/migration-2026-10-21) supports rejecting any supplied sampling parameter.

Integration into main requires the user's separate, explicit merge authorization. Planning and verification do not imply that authorization.

### W1 - Correct immediate misleading claims

**P0; 1-2 days. PDF 03/08; MD F8/F12/F25/F36/F38-F43/F45/F47 and Q2-Q5.**

Files: Swiss, Beamline, Story, Tour and Observatory HTML; corresponding narration sources; `tools/check-facts.mjs`.

- Remove the unsupported 10x bandwidth/storage claim from Swiss's control output **and** its stage-7/8 labels. Scope the published storage ratio to V4-Pro versus V3.2 at 1M; distinguish storage, read traffic and performance. The [model card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro) identifies that baseline.
- Separate FP8 mixed-precision pretraining from FP4 expert weights produced through QAT for the release. Preserve legitimate master-state/compute/weight distinctions in detail views.
- Remove or explicitly label the invented safety PASS; scope benchmark values to the reported model/mode and benchmark variant.
- Reconcile context-training stages with the base-length/YaRN configuration. Say trained on 33T tokens rather than a unique 33T-token corpus; dedup reduces repetition.
- Keep Claude's published API behavior separate from V4 representative internals and Constitutional AI examples. Remove unsupported explanations of Fable's private training recipe, composite provider request schemas and claims of inspectable private reasoning.
- Fix the attention sentence splice, stale 128K comments and inappropriate multimodal assertions on the text-only V4 path. Correct streaming/moderation order and the preference-model role in AI feedback.
- Label threshold compaction as opt-in and configurable. Its documented 150K default is not evidence that every Messages request compacts near the 1M limit. See [threshold compaction](https://platform.claude.com/docs/en/build-with-claude/compaction-threshold).

Done when: corrected claims agree across visible text, diagrams, detail cards and narration. Add narrow guards for the actual mistakes; do not ban every occurrence of FP4 or 128K, which also have valid uses. W5 handles changed audio before release.

### W2 - Make V4-specific mechanisms agree with the reference

**P0; 3-5 days. PDF 04/07/11; PDF-F04/F05/F07/F08/F23; MD V-01/F10/F14/F18/F20.**

Files: `shared/obs-core.html`, `shared/micro-labs.js`, Story/Tour decoder drawings and detail content, `journey-story/component-math.js`, new small numeric/shape fixtures under `tools/fixtures/`.

- Add the learned four-stream reduction before final RMSNorm and vocabulary projection. Text, shapes and crown geometry must express `4 x 7168 -> learned merge -> 7168 -> RMSNorm -> vocabulary logits`; RMSNorm preserves shape.
- Show mHC pre-map, residual mixing and post-map as distinct from a generic residual add. Do not use output-projection rank as mHC width. Label the fixed mixing matrix as an illustration rather than learned behavior.
- Keep MTP as a separate prediction path using the shared embedding/vocabulary head where the reference does. The [reference implementation](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/inference/model.py) explicitly merges before normalization and assigns the shared head to MTP.
- Keep vanilla masked Q/K/V as a labeled generic toy. V4-specific cards need shared-KV attention, the uncompressed recent window in both CSA and HCA, causal compressed history and a distinction between indexer work and attention reads. Account for sink mass or visibly label its omission.
- Replace strict alternation with a versioned layer schedule. Current [reference configuration](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/inference/config.json) exposes the initial two HCA layers, routing scale and compression schedule; pin the actual revision used before committing fixtures.
- Preserve normalized router shares summing to one, but distinguish them from V4's scaled routed coefficients and separate shared contribution. Label adjustable K and synthetic loads as counterfactuals; handle hash-routed layers separately.

Done when: independent fixtures cover shape reduction, causal read sets, shared KV, sinks and router shares/scaling. Affinities 1/3 produce shares .25/.75 and, under the documented 2.5 scale, coefficients .625/1.875; shared contribution remains separate. No unsupported exact per-layer byte estimate is inferred from a whole-model ratio.

The PDF's pinned `b5968e9...` reference implementation URL could not be fetched in this review. Current main implementation/config were accessible and corroborate key mechanisms, but do not claim byte-for-byte verification of that older revision.

### W3 - Use one valid tool exchange and conditional cache model

**P0; 2-4 days. PDF 05 -> 06; PDF-F11/F13/F15/F20-F22; MD F31/F33/F34/F36/F42/F43/F48.**

Files: Swiss and Beamline HTML, relevant shared serving cards, new `tools/fixtures/paris-tool-exchange.json`, focused protocol tests.

- Define a synthetic exchange with indexed SSE envelopes, split `input_json_delta` payloads, a tool-use ID, required assistant content replay, matching user `tool_result`, then final `end_turn`.
- Render narrow and wide presentations from the same valid object. Put abbreviations outside JSON or mark them as excerpts. The current narrow `{"temp_c": 18, "clear"}` is invalid.
- Show the first request's cached input boundary separately from the tool call it only generates. On resume, only a committed eligible prefix can already be warm.
- Model cold write, warm read, suffix work, changed prefix and expiry under a named provider/cache policy. Byte identity alone does not guarantee reuse. Separate uncached input, cache-write, cache-read and output charges; source/date any price fixture before pinning it.
- Preserve the Paris metaphor with an explicit training-to-inference boundary: training changes weights; a later occurrence is a new token instance. Do not imply a private attention-copy path or that illustrative IDs are Claude tokenizer IDs.
- Explain speculative acceptance as conditional; draft cost, acceptance and termination determine the speed benefit.

Done when: complete displayed JSON parses at 320/390/1440px, chunks reassemble by block index, IDs match and the cache/billing cases compute independently. Protocol correctness comes before pricing/caching copy that depends on this exchange.

### W4 - Correct scheduler, memory and roofline consequences

**P0 for wrong displayed rules; P1 for richer controls; 2-3 days. PDF 09-11/18; PDF-F06/F09-F11/F19; MD F13/F26-F28 and C4.**

Files: `shared/micro-labs.js`, `shared/obs-core.html`, Story/Tour/Beamline serving text, unit fixtures.

- Separate scheduler token budget, new blocks required, owned partial tails and available blocks. At block size 16, a cold 512-token chunk needs 32 new blocks; a decode token fitting an owned partial tail can need zero. Show the last prefill position producing first-output logits and normal decode consuming the prior output.
- Distinguish continuous batching, chunked prefill, paged allocation and prefill/decode disaggregation; name the deployment assumptions rather than presenting them as interchangeable properties of V4.
- Retitle the B200 lab to its GB200 configuration. Keep per-GPU dense peaks, sparse peaks, rack totals and measured throughput separate.
- Preserve the useful idealized kernel, label its shape/dtype assumptions and add the counter-regimes. Current-function fixtures: 64-row prefill approximately 238.93 FLOP/B (bandwidth-bound), 4096-row prefill approximately 2940.72 (compute-bound), batch-1024 decode approximately 1911.47 (compute-bound), at a 1250 ridge. Qualify categorical headlines.
- Disclose cache comparison precision, metadata and allocation assumptions. A 768-byte MLA teaching budget needs a documented composition; do not substitute 1152 blindly and claim architectural equivalence.
- Keep resident bytes, step-touched bytes, entry counts, allocation and FLOPs separate. Label the fitted V4 curve as an illustrative average, or show published endpoint markers. Compression and sparse selection affect different quantities.
- Only after these corrections consider a second, accurately scoped V4 expert kernel. Account for routing and kernel dimensions; do not present a square FP4 dense projection as the complete V4 layer.

Done when: independent arithmetic fixtures prove both scheduler counterexamples and both roofline regimes. All reported memory/performance quantities name their units, scope and assumptions.

### W5 - Make narration transitions and corrections reliable

**P1, required for any P0 audio correction; 1-2 days plus audio QA. PDF 16; HTML narration findings; PARTIAL fade finding.**

Files: narrator code in all four HTML pages, narration scripts/manifests/clips, new focused mocked-media tests.

- Guard asynchronous media callbacks and `play()` rejections by playback generation/identity. The Journey implementations currently route error and rejection independently to `next()`; Beamline's rejection can clear a newer clip's state.
- Distinguish natural completion, autoplay rejection and missing audio; offer pause/retry/transcript behavior. A stale callback cannot advance a newer clip.
- Replace Beamline's `1/60` fade decrement with elapsed-time behavior. Decouple its narration/navigation clock from expensive GPU draws and context loss before introducing render sleep.
- Update only materially changed audio, its script, captions, cue timings, duration and inline manifests together. Verify Swiss and Beamline assets as well as the two shared Journey copies. Listen to changed clips in context.

Done when: error -> old promise rejection -> late ended causes at most one intentional transition; Back/Next and pause/resume cannot revive stale playback; fading behaves consistently under simulated 60/120/240Hz ticks. Rendering going idle must not interrupt user-started narration. Do not regenerate the already-correct V4 hero or effort wording solely because HTML reported an old defect.

### W6 - Repair meaningful visual defects and misleading encodings

**P1, with misleading mechanisms corrected in W2; 2-4 days. MD V-01 through V-16 and aggregate V-17-V-27; PDF 19; PARTIAL prefill finding.**

Files: Story/Tour SVG builders, Beamline scene/layout code, Swiss labels, lab CSS/SVG, relevant browser checks.

- Repair the single-lane decoder drawing and clipped mHC label in **both** Story and Tour's duplicated builders. Fix pane-seam KV text, margin labels, drawer bleed and scroll affordances.
- Replace whole-sheet thumbnails with focused crops or purpose-built small diagrams. Check rendered text bounds at the actual scale; a 10px audit threshold is a heuristic, not an accessibility certificate.
- Keep all six router rows and the sum readout discoverable. Improve selected-cell distinction, the roofline ridge/marker/axes, mHC weights and cache comparison legibility using text/table equivalents.
- Represent context stages with explicitly unscaled milestones or a labeled axis; current bar widths must not suggest 64K -> 1M is 2x. Keep toy BPE clearly labeled on the diagram itself.
- In Beamline prefill, show multiple prompt tokens ascending together. Review reduced-motion initial state, compressed station strip, label collisions and clipped Paris tag. Check Swiss stage-2 token order, stage-12 edge labels and Observatory labels behind controls.
- Keep scene-local legends where dashed lines have different meanings. Distinguish the highest-logit indicator from a realized stochastic sample.

Done when: capture and inspect the relevant states at 320/390/768/1440px with loaded fonts and system fallbacks, default and reduced motion, open drawers/labs and zoom/reflow. Record any unresolved cosmetic exceptions explicitly. Existing initial-state axe passes do not close these items.

### W7 - Complete dynamic accessibility and stable navigation

**P1; 2-3 days. PDF 02/12/13/17; MD E4-E7/E9-E10 and C6.**

Files: Tour navigation, Beamline/Swiss controls and CSS, lab readouts, `tools/verify-browser.cjs`.

- Preserve meaningful focus across repeated Tour Next/Previous; validate component IDs before clearing/rendering. `#explore-does-not-exist` must recover to a usable overview at startup and hashchange without a false GPU error.
- Replace whole-card live announcements with a short status. Ensure equations, numerical lab results, captions and Watch text have an intentional accessible route without indiscriminately duplicating audio as live speech.
- Give native controls their own keyboard behavior, fix remaining focus contrast, add Beamline's skip link, prevent sticky bars obscuring focused content and check target sizes with applicable spacing exceptions.
- Add `wcag22aa` checks to representative dynamic states. Keep best-practice findings separate from conformance failures. Scan open drawers, labs, dialog and Watch/Study states as well as initial pages.
- Verify keyboard and NVDA paths on Windows, a second browser engine, and actual touch on a phone before claiming equivalent access. VoiceOver is a separate cross-platform check if a suitable device is available.

Done when: a learner can complete the existing core tasks without dragging or seeing WebGL pixels; focus remains useful and all failure states remain navigable. Automated scans support, rather than replace, the manual task record.

### W8 - Make file navigation, renderer failures and motion state dependable

**P1; 3-5 days; depends on W5 for render sleep. PDF 13-15/17; MD E8/X2; PARTIAL render/layout findings.**

Files: `index.html`, five redirect stubs, `shared/obs-file-bridge.js`, Beamline/Tour/core bootstrap and frame code, CSS.

- Make local links and legacy redirects resolve actual HTML documents under `file://`, preserving query/hash and hosted behavior. Test clicks from the hub, not just direct entry URLs. Offer the full standalone Observatory separately from the embedded router preview.
- Fix the 320px Beamline ledger and narrow Story header controls. Assert bounds of focusable elements in addition to document overflow.
- Initialize Beamline Study, prose and labs independently from Three.js and WebGL. Test missing library/all mirrors blocked, loaded library/no WebGL, and context loss/restore as distinct failures. Derive expected lab instances from the declared mounts rather than confusing 10 lab types with the PDF's 11 mounted probes.
- Bound bridge/engine readiness and expose usable text/labs on timeout. Preserve the current MessageChannel source/origin checks.
- Listen for reduced-motion changes in Tour/core and Beamline, cancel active flights and settle without reload. Provide appropriate motion pause behavior for persistent nonessential animation.
- Introduce dirty/visible/transition-driven Beamline draws. Cache label geometry when text/layout/fonts change; batch DOM reads before writes. Wake correctly on interaction, resize, visibility and restoration.

Done when: offline hub/alias navigation works; the same Study tasks remain available with either dependency or GPU failure; switching motion preference mid-flight stops motion; settled/hidden states stop expensive draws and resume correctly. Keep current 100ms local/150ms CI WARP budgets until new workload-specific measurements justify a change.

### W9 - Prevent content and fact drift with small shared sources

**P1; 2-3 days, introduced incrementally alongside corrective PRs. MD C1/C2/X1; HTML single-source proposal.**

Proposed files: `shared/journey-stops.json`, `shared/facts.json`, small generators/checks under `tools/`, generated inline sections in existing pages.

- Canonicalize shared stop semantics, facts and worked-example data. Keep explicit per-format presentation overrides. Current Story/Tour arrays differ in intended subposes at stops 10-12 and instructional wording at stop 21; raw object equality would reject valid differences.
- Reconcile the reported nine Story-card/drawer disagreements against current content and map each required concept to every relevant presentation. Generate inline data/markup so opening the checked-in HTML still needs no build or network.
- For facts, store claim ID, subject/provider, checkpoint or API version, source section/URL, units, precision, baseline, verification date and illustrative/verified/unresolved status. Pin external answers independently of application calculations.
- Retain cheap useful string/shape guards; add numerical and protocol fixtures, generated-content freshness checks and rendered-state tests. Automated string matching cannot prove every prose claim or detect every semantic contradiction.
- Extend narration consistency checks to all scripts/manifests and changed audio provenance. Do not make a shared narrator extraction a prerequisite for fixing races.

Done when: one canonical semantic edit reaches intended consumers, presentation overrides survive, generated output is current, and all direct-file entry paths still work. Versioned external drift should create a reviewable finding; do not silently rewrite claims from live upstream pages.

### W10 - Improve onboarding, discovery and repository hygiene

**P2, with cheap fixes eligible earlier; 0.5-1.5 days. CHAT weaknesses 1/2/4/5 and housekeeping; MD C7/Q8/X3.**

Files: landing and page metadata, READMEs, social preview assets, `public/assets/aistudio/`.

- Use the confirmed single-interface direction: begin with the simplest guided explanation, then offer optional deeper detail in place. Define the entry flow, expansion/collapse behavior, narration behavior and migration of existing URLs before consolidation. Do not make a four-format chooser the learner's required first decision. State audience, prerequisites and verified narration time where useful; add a small glossary and optional deep links without crowding the first screen.
- Add descriptions, canonical URLs and social metadata to the intended public entries with real preview images. Treat standalone Observatory indexing deliberately. Add accurate GitHub topics as a separate repository metadata task.
- Remove the two tracked, byte-identical 44,302-byte AI Studio plan dumps from served assets after confirming no consumers. Both currently have SHA-256 `cf39c84cb74415676feec1e5d4bc188d20622736c8d787b89d20086dcc16cc7b`. No history rewrite is indicated.
- Correct shared README's no-context-recovery claim, Swiss dependency/font paths and Tour's obsolete camera/iframe-key notes. Update known-limits entries only with evidence from the relevant visual/manual pass.

Done when: a newcomer can choose a path, preview links resolve, metadata represents the actual page, stray plans are no longer served and READMEs describe tested behavior. No claim of increased reach or learning follows merely from these edits.

### W11 - Complete three small learning tasks

**P2; 3-5 days after relevant correctness/accessibility work. PDF 18/19; MD C3/M2.**

Files: existing labs and Tour/Study detail surfaces, small independent fixtures; optional links from Story.

1. Causal attention: expose scores, mask, weights, scalar values and output as HTML data. Weights `.350691/.074015/.575294/0` with values `10/20/30/40` produce `22.24603`; the future token contributes zero.
2. Generic sampling: fixed logits `4/3/2/1`, temperature `.5/1/2`, top-p `.90` retain `2/3/4` entries, then renormalize. A seeded draw is optional. Keep this separate from Claude's parameter-validation contract.
3. Serving: a BF16, eight-KV-head, head-dimension-128, 65,536-token fixture has 256 MiB resident cache per layer. Compute step-read bytes and newly allocated blocks separately under visible assumptions.

Each task uses predict -> change -> reveal, explains the result and includes one transfer question. Tasks must work by keyboard and readable table/text with 3D optional. Preserve the already-working router coupling. Add further linked counterfactuals only when one state object can drive the equation, readout and scene.

For model-specific tokenizer examples, reproduce the PDF's reported IDs from the cited revision and hash before adopting them: `" Paris"` and `"Paris"` are different byte strings. The PDF reports revision `b5968e9...`, tokenizers 0.22.2 and tokenizer SHA-256 `8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf`. These IDs were not independently reproduced in this review; retain honest toy labels until then.

Done when: all three tasks have independent expected outputs, accessible completion paths and a documented misconception/transfer check. Swiss remains a short editorial path; Beamline Watch remains uncluttered. Pilot a few prompts before adding one to every chapter.

### W12 - Connect one reproducible trace and evaluate its value

**Optional P2 experiment; 5-10 days plus participant time. PDF 20; MD M1-M3/M5; HTML coupling proposal.**

- Ship one small public trained-model trace linking tokenizer, attention/value output, logits and generation using a fixed trace ID. Pin model revision, precision, seed, inputs and expected outputs.
- Overlay a separately labeled V4 mechanism/serving proxy for cache, scheduling and protocol consequences. Document exactly where real activations end and the simulation begins.
- Start with precomputed reproducible data. An arbitrary-prompt in-browser model is a later product decision, not the acceptance criterion for this experiment.
- Test novice comprehension and engineer inspection with a plain-text comparator and a new transfer question. Record task completion, answers, misconceptions and time; do not infer population learning gains from a small convenience sample.

Done when: the trace is reproducible, every linked stage uses the same identity, real/proxy boundaries remain visible and observed use justifies further work. No mandatory model download, paid API integration, new room or analytics pipeline is needed.

## Release sequence and dependencies

| Milestone | Scope | Exit condition |
| --- | --- | --- |
| Corrective release | W0-W4 and affected W5 audio; small W9 fixtures as needed | Wrong model/protocol claims corrected; native controls usable; valid Paris exchange and conditional cache example; no unresolved P0 regression. |
| Reliability release | Remaining W5-W9; inexpensive W10 tasks | Narrow layouts, file navigation, dynamic focus, reduced motion, dependency failures, media errors and render sleep verified; manual evidence recorded. |
| Learning release | W11, then W12 if useful | Three complete tasks before one trace; accessible transfer checks; no promised score increase. |

Work order: finish W0; ship W1's small corrections; prioritize W2 head/attention and W3 protocol fixture; follow W3 with cache/billing; correct W4 numerical rules; complete reliability and visual defects; then the learning pilot. Introduce canonical data when touching duplicated content, without holding urgent fixes behind a monolith refactor. W5's clock separation precedes W8's render sleep. W12 follows W11.

A realistic planning envelope is roughly 1-2 engineering weeks for the corrective release and another 2-3 for reliability/legibility, with audio and manual-review availability affecting elapsed time. W11/W12 add roughly 2-3 weeks if both proceed. These ranges are estimates, not a commitment or a sum of rubric-point projections.

## Complete PDF ticket crosswalk

| PDF ticket | Plan | Current disposition |
| --- | --- | --- |
| 01 Sampling | W0 | Implemented locally: request-key/null semantics, omission preview and subset-result wording; unit/browser checks pass. |
| 02 Story keys | W0/W7 | Implemented locally: native control keys, scene traversal, opener return and scoped number shortcuts pass over HTTP/file; broader manual accessibility work remains. |
| 03 Swiss cache metric | W1/W4 | False 10x claim removed and storage baseline scoped in both control states and labels; richer memory/traffic fixtures remain W4. |
| 04 Four-stream output | W2 | Missing merge confirmed in local card; reference behavior corroborated. |
| 05 Paris tool fixture | W3 | Invalid narrow JSON reproduced; full envelope/round-trip fixture pending. |
| 06 Conditional cache | W3 | Guaranteed-hit and cache-boundary wording needs correction. |
| 07 V4 attention | W2 | Generic equation/HCA-window omissions confirmed; independent detailed fixtures pending. |
| 08 Provider/training claims | W1/W5 | Open; versioned sources and audio parity required. |
| 09 Scheduler | W4 | Free-block predicate confirmed; counterexample fixtures pending. |
| 10 Roofline | W4 | Existing math is useful; categorical interpretation and hardware title need correction. |
| 11 Router coefficients | W2/W4 | Existing normalized shares/coupling preserved; model-specific scale remains to be represented. |
| 12 Tour focus/hash | W7 | PDF runtime evidence; re-run failing states before implementing. |
| 13 Narrow/local links | W7/W8 | Directory links confirmed; click-through and 320px failures need targeted regression cases. |
| 14 Render-independent Study | W8 | Early renderer-dependent bootstrap confirmed; compare all three failure paths. |
| 15 Motion/idle | W5/W8 | Continuous Beamline scheduling/static preferences confirmed; profile after clock separation. |
| 16 Narration | W5 | Missing stale-callback guards confirmed; deterministic mock regression required. |
| 17 Tests as evidence | Every behavioral work package/W9 | Existing suite green; add failing cases alongside each correction. |
| 18 Three tasks | W11 | Product improvement after correctness, not a release-blocking feature expansion. |
| 19 Real labels/context scale | W6/W11 | Timeline/label improvement can move earlier; tokenizer fixture still needs independent reproduction. |
| 20 Trace and learning | W12 | Bounded optional experiment after the three tasks. |

The MD fact ledger's other accurate constants and legitimate simplifications remain protected. Its remaining actionable notes are covered by W1-W4 (fact/scope), W5 (audio), W6 (V issues), W7-W8 (E issues), W9 (C1/C2/X1), W10 (C7/Q8/X3) and W11-W12 (learning/moats). Its monthly currency proposal becomes a later source-review job after W9; no schedule is created by this plan.

## Validation and completion rules

- Before and after each multi-file implementation, run the configured lint, full Node suite and build, reporting actual counts. Run the full browser suite for user-visible/behavioral changes and retain Windows/WARP and Linux CI. There is no separate typecheck today; if one is introduced, it joins the gate. Any required failure blocks commit/merge under the supplied repository instructions.
- For each behavioral defect, demonstrate that the new regression fails against the appropriate old implementation and passes after correction. For arithmetic/protocol claims, keep expected fixtures independent from production functions. Do not add tests that merely restate harmless copy or implementation structure.
- Add dynamic-state and 320px checks incrementally; do not make a new framework, full browser matrix or golden-screenshot system a prerequisite for urgent corrections.
- Use browser checks for actual behavior: native arrows, stable focus, invalid hashes, file-link clicks, missing Three.js, no WebGL, context restore, delayed media events and live reduced-motion changes. Add selected manual cross-engine, phone, screen-reader and audio checks before claiming equivalence.
- Preserve file-open compatibility, local vendor/SRI loading, shared narration parity, 40,000-byte lab-plus-bridge budget, reduced-motion behavior, public valid URLs, Swiss's disclosed simplified visual and Watch/Study separation.
- Record final evidence and unresolved limitations per release. Passing a string gate is not proof of external truth; passing axe is not a screen-reader result; a nameplate roofline is not measured throughput.

## Defer or reject for this program

Do not immediately migrate the Observatory to native ES modules while promising unchanged `file://` behavior: module loading changes local-origin constraints. If modularization later pays for itself, use a proven packaging approach and retain checked-in direct-open output. Unify Three.js only after a scoped compatibility/visual/performance comparison demonstrates benefit. Measure Swiss's dual-context risk before undertaking a renderer consolidation.

Do not fund an ambitious toy MoE+mHC+compressed-KV model merely to match a peer's live-prompt checkbox. A genuine trained model, faithful intermediate values and browser fallback behavior require their own design and validation. Start with W11/W12. Do not add mandatory quizzes to Swiss, make Watch modes denser, claim all peers lack testing, or promise #1 from proposed work.

The initial planning pass made no application changes. The implementation batch above changes application files and tests locally; no asset deletions, GitHub issues/topics, merges, releases or scheduled jobs have been performed.
