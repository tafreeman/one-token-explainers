# Content, math and Reader corrections

Reviewed November 23, 2026, against main `b9a70358809b94d86592a20ee9abb3e25dc3215a`.

Three specialist subagents reviewed lifecycle wording, deep-dive wording and mathematical mechanisms. An independent code reviewer examined the resulting runtime, HTML and math changes. Findings were accepted on their supporting evidence and reproductions, not on agreement between reviewers.

## Review coverage

| Surface | Coverage |
| --- | --- |
| Reader, Swiss and Beamline | All twelve lifecycle stages, technical disclosures, equations, controls, recaps, visual labels and both narration transcripts |
| Story and Tour | All thirty stops, Story cards, both embedded stop arrays, diagrams, controls and thirty-two narration transcripts |
| Observatory | All thirty-one component records and their disclosures, sixteen showcase captions, projected and printed labels |
| Shared mechanisms | Eleven micro-labs; optimizer, activation, logit-lens and steering descriptions; seven concept labels |
| Mathematical review | BPE, UTF-8/SSE, causal softmax, RoPE, RMSNorm, mHC shapes, SwiGLU, routed gates/capacity, GRPO/KL, vocabulary projection, KV storage, caching, scheduling and roofline units |

This is source and automated behavioral review. It does not establish learning gains, physical-phone accessibility, or an end-to-end human listening review.

## Implemented corrections

- Spatial fitting resets the projection before measuring the opening scene. Portrait presentation frames the tracked token and the beat's explanatory anchors. New geometry tests cover every stop; the independent reviewer additionally sampled 101 positions per stop at three portrait plate sizes without finding clipped token corners.
- Narrated run starts at the selected recording's introduction rather than skipping the first 33 seconds of the full track.
- Claude prompt-cache explanations now require enabled caching, an eligible live prefix and a cache boundary. Fable's 512-token minimum, $0.20/MTok reads, $10/MTok five-minute writes and $8/MTok uncached input have separate labels.
- Written explanations distinguish always-enabled adaptive thinking from reasoning on every turn. Raw reasoning is not readable; encrypted signatures must be preserved in tool-loop requests.
- Serving examples distinguish common or illustrative designs from disclosed Claude architecture. Prefill processes positions in parallel within sequential layers and may be chunked. Sparse attention reads selected history; compressed cache growth is not a permanent entry for every token.
- Tokenizer vocabulary training is distinguished from applying learned merges. Segmentation and IDs remain illustrative. Image patch encoding is distinguished from the unpublished encoder layout, and the V4 training-length schedule is distinguished from YaRN configuration arithmetic.
- DeepSeek Messages-compatible examples use the documented thinking/effort fields. Deep-dive text distinguishes conditional cache reuse and sliding-window-tail recomputation, optional serving infrastructure, direct/indirect prompt injection and schema validation.
- Equations include a zero-variance GRPO guard, distinguish PPO clipping from a hard update bound, include routed scaling of 2.5, use attention-head dimensions and account for attention sinks. Illustrative circuits and activation stripes remain explicitly separate from measured model internals.

## Simulation corrections

MoE capacity now counts the actual assignments of a deterministic 24-token batch across all 384 experts. Per-expert capacity is `ceil(C × tokens × K / 384)`, and overflow is summed per expert. At K=6 with zero correction, this toy workload drops 138 of 144 assignments. This is a generic capped teaching policy, not a claim that V4 uses that dropping policy.

The roofline's dense reference is one square GEMM. EP mode uses a matched top-six SwiGLU workload, active resident FP4 expert weights, BF16 activation traffic and dispatch/combine bytes, all on a per-GPU basis. Its 5 PF/s FP4×FP8 compute ceiling is an explicit modeling assumption, rather than measured performance. At EP=64 the matched network ceiling is about 4.213 PF/s. Ideal bounds omit metadata, intermediate traffic, imbalance and overlap.

Scheduler graphics now derive their positions from the same millisecond schedule as the readout: 18 ms decode intervals, or a 338 ms interval when a 320 ms prefill chunk stalls colocated decode. Muon's spectrum helper now handles zero updates and has scale-invariance coverage.

The shared lab plus file bridge is approximately 40.9 KB. Its combined gate increased narrowly from 40,000 to 41,000 bytes to retain readable workload/assumption explanations; the micro-lab module itself remains below 40 KB.

## Narration status

The user's preferred original ElevenLabs recordings, matching captions and active manifests are retained. **Spoken corrections remain pending recording in the original voices.** The corrected written lesson should take precedence where it differs from an older spoken description. Existing test comments retain the known narration discrepancies.

Forty-six locally generated alternate clips, revised scripts, cue timings and voice metadata were preserved outside the repository at the user's request. They are not active, and are excluded from this code/content change. No original recording was discarded.

## Validation

Before changes: lint passed, 58 selected fact assertions passed, 29/29 Node tests passed and build passed. The baseline full browser and Windows WARP suites passed.

After the code/content changes and restoration of the original audio: lint and all 58 selected fact assertions passed; Node tests passed 36/36; build passed with 22/22 micro-lab tests. The full browser suite passed, including desktop/phone layouts, automated accessibility, keyboard/focus, narration, HTTP/local-file operation, static fallbacks, context recovery and pinned mirror integrity. There is no configured TypeScript/typecheck project; no typecheck pass is claimed.

Windows WARP passed on this 24-logical-CPU host: the router drawer used 85 draw calls with median-of-five p95 of 20.8 ms and zero idle frames; Reader Diagram and Spatial used 43/45 calls with median p95 of 18.0/18.0 ms, below the 100 ms local budget. These measurements are not cross-device frame-rate guarantees. Final layout captures were visually checked for the corrected phone Spatial presentation.

New regressions first reproduced the camera instability, portrait clipping, skipped narration introduction and simulation defects. BPE additionally agrees with an independent lowest-rank merge implementation across 169 phrase pairs.

## Primary evidence

- [Claude prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [thinking/signatures](https://platform.claude.com/docs/en/build-with-claude/thinking), [adaptive behavior](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost), [vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- [DeepSeek V4 report](https://arxiv.org/html/2606.19348v1), [V4-Pro configuration](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/raw/main/config.json), [reference implementation](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/raw/main/inference/model.py)
- [DeepSeek Messages compatibility](https://api-docs.deepseek.com/guides/anthropic_api/), [cache rules](https://api-docs.deepseek.com/guides/kv_cache/), [strict tool schemas](https://api-docs.deepseek.com/guides/tool_calls/)
- [NVIDIA GB200 specifications](https://www.nvidia.com/en-us/data-center/gb200-nvl72/), [vLLM chunked prefill](https://docs.vllm.ai/en/latest/configuration/optimization/#chunked-prefill)
- [Constitutional AI](https://arxiv.org/html/2212.08073v1), [deduplication study](https://arxiv.org/html/2107.06499), [byte-level BPE](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf), [causal Transformers without explicit positional encoding](https://aclanthology.org/2022.findings-emnlp.99/)
