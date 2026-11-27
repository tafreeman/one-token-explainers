#!/usr/bin/env python3
"""Extract real MoE router traces from an open model into shared/real-traces.js.

The MoE lab's "Real trace" view reads this file. It records what an open mixture-of-experts router
actually does on four short prompts, so the lab can show measured routing beside its simulated
DeepSeek-V4-Pro grid (384 experts) without conflating the two.

Default model: deepseek-ai/DeepSeek-V2-Lite (27 layers, layer 0 dense, layers 1-26 MoE with 64 routed
plus 2 shared experts, softmax router, greedy top-6, no top-k renormalisation). Fallback:
``--model allenai/OLMoE-1B-7B-0924`` (16 layers, 64 experts, top-8, no shared experts).

Both run on the native transformers classes (``trust_remote_code`` stays off), in eval mode under
``torch.no_grad()``, on CPU if no GPU is present. For each sampled layer a forward hook on the router
(``mlp.gate``) recomputes the full router softmax from the gate's own input and weight, then records:

- the top-k expert IDs, in descending gate probability;
- each chosen expert's share of the routed output, ``p_i / sum(top-k p)``, rounded to 3 decimals with
  largest-remainder rounding so the shares sum to exactly 1.000;
- ``m``, the router probability mass the top-k covers (the model's raw weights are ``share * m``);
- ``h``, the Shannon entropy of the full router distribution in bits (maximum ``log2(numRouted)``).

The hook cross-checks its top-k set against the router's own output for every token. Per-layer load
counts (tokens routed to each expert, summed over all prompts) are recorded too. The BOS token is run
through the model but left out of the traces.

Requirements: Python 3.11+, ``torch``, ``transformers`` with native ``deepseek_v2`` support (4.57 was
used), ``safetensors`` and ``huggingface_hub``. DeepSeek-V2-Lite's bf16 weights are 31.4 GB; CPU-only
extraction needs about that much free RAM and takes a few minutes. The site never loads the model: it
ships only the generated ``shared/real-traces.js``. Two runs on the same snapshot are byte-identical.

Usage::

    python tools/extract-real-traces.py --model-path C:/tmp/moe-models/deepseek-v2-lite \\
        --revision 604d5664dddd88a0433dbae533b7fe9472482de0
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F  # noqa: N812 (torch convention)
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

LOG = logging.getLogger("extract-real-traces")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "shared" / "real-traces.js"
DEFAULT_MODEL = "deepseek-ai/DeepSeek-V2-Lite"
PROMPTS: tuple[str, ...] = (
    "The cat sat on the mat",
    "The Eiffel Tower is in Paris.",
    "What's the weather in Paris?",
    "def fib(n): return n",
)
# Sampled layers per model family (0-based decoder indices; DeepSeek-V2-Lite layer 0 is dense).
DEFAULT_LAYERS: dict[str, tuple[int, ...]] = {
    "deepseek_v2": (1, 6, 13, 20, 26),
    "olmoe": (0, 4, 8, 12, 15),
}
SHARE_DECIMALS = 3
MASS_DECIMALS = 3
ENTROPY_DECIMALS = 2
MAX_BYTES = 25_000


@dataclass(frozen=True)
class RouterSpec:
    """Router facts read from the model config, never assumed."""

    model_type: str
    num_layers: int
    num_routed: int
    num_shared: int
    top_k: int
    scoring: str
    norm_top_k: bool


@dataclass
class LayerCapture:
    """Router decisions for one layer during one forward pass."""

    ids: list[list[int]] = field(default_factory=list)
    probs: list[list[float]] = field(default_factory=list)
    mass: list[float] = field(default_factory=list)
    entropy: list[float] = field(default_factory=list)


def router_spec(config: Any) -> RouterSpec:
    """Read the router geometry from a transformers config."""
    model_type = str(config.model_type)
    if model_type == "deepseek_v2":
        if getattr(config, "topk_method", "greedy") != "greedy":
            raise ValueError(f"unsupported topk_method {config.topk_method!r}; only greedy is reproduced")
        if getattr(config, "scoring_func", "softmax") != "softmax":
            raise ValueError(f"unsupported scoring_func {config.scoring_func!r}")
        return RouterSpec(
            model_type=model_type,
            num_layers=int(config.num_hidden_layers),
            num_routed=int(config.n_routed_experts),
            num_shared=int(config.n_shared_experts or 0),
            top_k=int(config.num_experts_per_tok),
            scoring="softmax",
            norm_top_k=bool(config.norm_topk_prob),
        )
    if model_type == "olmoe":
        return RouterSpec(
            model_type=model_type,
            num_layers=int(config.num_hidden_layers),
            num_routed=int(config.num_experts),
            num_shared=0,
            top_k=int(config.num_experts_per_tok),
            scoring="softmax",
            norm_top_k=bool(getattr(config, "norm_topk_prob", False)),
        )
    raise ValueError(f"unsupported model_type {model_type!r}")


def largest_remainder(values: list[float], decimals: int) -> list[float]:
    """Round non-negative values that sum to 1 so the rounded values sum to exactly 1."""
    scale = 10**decimals
    raw = [v * scale for v in values]
    floors = [math.floor(r) for r in raw]
    short = scale - sum(floors)
    order = sorted(range(len(raw)), key=lambda i: (raw[i] - floors[i], -i), reverse=True)
    for i in order[:short]:
        floors[i] += 1
    return [f / scale for f in floors]


def entropy_bits(scores: torch.Tensor) -> torch.Tensor:
    """Shannon entropy in bits of each row of a probability matrix."""
    safe = scores.clamp_min(1e-30)
    return -(scores * safe.log2()).sum(dim=-1)


def make_hook(spec: RouterSpec, layer: int, sink: dict[int, LayerCapture]) -> Any:
    """Forward hook that recomputes the router softmax and records the top-k decision."""

    def hook(module: torch.nn.Module, inputs: tuple[torch.Tensor, ...], output: Any) -> None:
        hidden = inputs[0].reshape(-1, inputs[0].shape[-1])
        weight = module.weight
        assert isinstance(weight, torch.Tensor)
        logits = F.linear(hidden.float(), weight.float())
        scores = logits.softmax(dim=-1)
        top_p, top_i = torch.topk(scores, k=spec.top_k, dim=-1, sorted=True)
        own_ids = next((t for t in (output if isinstance(output, tuple) else (output,))
                        if isinstance(t, torch.Tensor) and not t.is_floating_point()), None)
        if own_ids is not None:
            mine = torch.sort(top_i, dim=-1).values
            theirs = torch.sort(own_ids.reshape(mine.shape), dim=-1).values
            if not torch.equal(mine, theirs):
                raise RuntimeError(f"layer {layer}: recomputed top-{spec.top_k} differs from the router's own output")
        cap = sink.setdefault(layer, LayerCapture())
        cap.ids.extend(top_i.tolist())
        cap.probs.extend(top_p.tolist())
        cap.mass.extend(top_p.sum(dim=-1).tolist())
        cap.entropy.extend(entropy_bits(scores).tolist())

    return hook


def token_route(cap: LayerCapture, pos: int) -> dict[str, Any]:
    """Compact per-token, per-layer record."""
    probs = cap.probs[pos]
    mass = sum(probs)
    return {
        "e": cap.ids[pos],
        "w": largest_remainder([p / mass for p in probs], SHARE_DECIMALS),
        "m": round(cap.mass[pos], MASS_DECIMALS),
        "h": round(cap.entropy[pos], ENTROPY_DECIMALS),
    }


Traces = tuple[list[dict[str, Any]], list[list[int]]]


def trace_prompts(model: Any, tokenizer: Any, spec: RouterSpec, layers: tuple[int, ...]) -> Traces:
    """Run every prompt and collect per-token routes plus per-layer expert load."""
    load = [[0] * spec.num_routed for _ in layers]
    prompts: list[dict[str, Any]] = []
    for text in PROMPTS:
        sink: dict[int, LayerCapture] = {}
        handles = [
            model.model.layers[n].mlp.gate.register_forward_hook(make_hook(spec, n, sink)) for n in layers
        ]
        try:
            enc = tokenizer(text, return_tensors="pt", add_special_tokens=True)
            with torch.no_grad():
                model(**enc, use_cache=False)
        finally:
            for h in handles:
                h.remove()
        ids = enc["input_ids"][0].tolist()
        skip = 1 if tokenizer.bos_token_id is not None and ids and ids[0] == tokenizer.bos_token_id else 0
        tokens = [tokenizer.decode([t]) for t in ids[skip:]]
        routes = [[token_route(sink[n], pos) for n in layers] for pos in range(skip, len(ids))]
        for li, n in enumerate(layers):
            for pos in range(skip, len(ids)):
                for e in sink[n].ids[pos]:
                    load[li][e] += 1
        prompts.append({"text": text, "tokens": tokens, "routes": routes})
        LOG.info("traced %r: %d tokens", text, len(tokens))
    return prompts, load


def render_js(payload: dict[str, Any]) -> str:
    """Deterministic classic script: window.RealMoETraces (and module.exports for node --test)."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    return (
        "/* Generated by tools/extract-real-traces.py. Do not edit by hand; re-run the extractor.\n"
        f"   Measured router decisions from {payload['modelId']} @ {payload['revision'][:7]}, extracted "
        f"{payload['extractedAt']}.\n"
        f"   {payload['numRouted']} routed + {payload['numShared']} shared experts, top-{payload['topK']}. "
        "This is NOT DeepSeek-V4-Pro (384 experts); the lab labels it separately.\n"
        "   e: expert IDs by gate probability. w: share of the routed output (sums to 1).\n"
        "   m: router probability mass on the top-k (raw weight = w * m). h: router entropy, bits. */\n"
        "(function () {\n"
        "  'use strict';\n"
        "  const freeze = o => {\n"
        "    if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); }\n"
        "    return o;\n"
        "  };\n"
        f"  const data = freeze({body});\n"
        "  if (typeof module !== 'undefined' && module.exports) module.exports = data;\n"
        "  if (typeof window !== 'undefined') window.RealMoETraces = data;\n"
        "})();\n"
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--model", default=DEFAULT_MODEL, help="Hugging Face model id recorded in the output")
    p.add_argument("--model-path", type=Path, help="local snapshot directory (default: download --model)")
    p.add_argument("--revision", required=True, help="exact commit SHA of the snapshot, recorded in the output")
    p.add_argument("--layers", type=lambda s: tuple(int(x) for x in s.split(",")), help="comma-separated layer indices")
    p.add_argument("--date", help="extraction date, YYYY-MM-DD (default: today, UTC)")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args(argv)
    source = str(args.model_path) if args.model_path else args.model
    revision = None if args.model_path else args.revision
    torch.manual_seed(0)
    torch.use_deterministic_algorithms(True, warn_only=True)

    config = AutoConfig.from_pretrained(source, revision=revision, trust_remote_code=False)
    spec = router_spec(config)
    layers = args.layers or DEFAULT_LAYERS[spec.model_type]
    moe_from = int(getattr(config, "first_k_dense_replace", 0))
    bad = [n for n in layers if n < moe_from or n >= spec.num_layers]
    if bad:
        raise SystemExit(f"layers {bad} are not MoE layers (MoE layers are {moe_from}..{spec.num_layers - 1})")
    LOG.info("model %s: %s, layers %s", args.model, spec, layers)

    tokenizer = AutoTokenizer.from_pretrained(  # type: ignore[no-untyped-call]
        source, revision=revision, trust_remote_code=False
    )
    model = AutoModelForCausalLM.from_pretrained(
        source, revision=revision, trust_remote_code=False, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True,
    )
    model.eval()  # type: ignore[no-untyped-call]

    prompts, load = trace_prompts(model, tokenizer, spec, layers)
    payload = {
        "modelId": args.model,
        "revision": args.revision,
        "extractedAt": args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "numLayers": spec.num_layers,
        "numRouted": spec.num_routed,
        "numShared": spec.num_shared,
        "topK": spec.top_k,
        "scoring": spec.scoring,
        "normTopK": spec.norm_top_k,
        "layers": list(layers),
        "prompts": prompts,
        "load": load,
    }
    js = render_js(payload)
    size = len(js.encode("utf-8"))
    if size >= MAX_BYTES:
        raise SystemExit(f"{args.out} would be {size} bytes, over the {MAX_BYTES} byte budget")
    args.out.write_text(js, encoding="utf-8", newline="\n")
    LOG.info("wrote %s (%d bytes)", args.out, size)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
