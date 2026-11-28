#!/usr/bin/env python3
"""Extract DeepSeek's real BPE merges from ``tokenizer.json`` into shared/bpe-merges.js.

The BPE lab ("Trace a BPE merge") reads this file. It ships the first N merges of DeepSeek's own
byte-level BPE, so the lab's pieces and token IDs are the real ones. Rarer words split further than the
full model would, because merges past N are left out.

What the generated script holds (``window.DeepSeekBPE`` in a page, ``module.exports`` in node):

- ``modelId``, ``revision`` (the Hugging Face commit the tokenizer came from), ``vocabSize`` (every ID,
  special tokens included), ``mergesTotal`` and ``mergesKept`` (N);
- ``split``: the pre-tokenizer's ``Split`` regexes, translated from Oniguruma to JavaScript (flags
  ``gu``). Each is applied in order with "Isolated" behaviour: every match and every gap between matches
  becomes its own chunk. Merges never cross a chunk;
- ``bytes``: the vocab ID of each raw byte 0-255, packed like the merges. Hugging Face ByteLevel stores tokens as GPT-2
  bytes-to-unicode stand-ins (``Ġ`` is the space byte); this table maps them back to raw bytes;
- ``merges``: merge ``i`` joins two earlier token IDs into ID ``firstMergeId + i``. The extractor checks
  that this holds for every kept merge, so the IDs are DeepSeek's own. The pairs are packed into one ASCII
  string, see ``pack_ids``.

Encoding follows Hugging Face semantics: pre-tokenize, then within each chunk repeatedly merge the
adjacent pair with the lowest rank (leftmost on a tie). It is not sequential passes over the rule list.

``--golden`` also writes tools/bpe-golden.json: the token IDs that the ``tokenizers`` library gives for
GOLDEN_TEXTS on the same tokenizer cut to the first N merges. tools/bpe-merges.test.cjs checks the lab's
JavaScript encoder against it.

Requirements: Python 3.11+. ``--golden`` also needs ``tokenizers``. Download only the tokenizer files,
for example with ``huggingface_hub.hf_hub_download(repo, "tokenizer.json", revision=sha)``. The output
depends only on the inputs, so two runs on the same snapshot are byte-identical.

Usage::

    python -P tools/extract-deepseek-merges.py --tokenizer C:/tmp/deepseek-tokenizer/tokenizer.json \\
        --model-id deepseek-ai/DeepSeek-V4-Pro --revision b5968e9190ef611bbf34a7229255be88a0e937c1 \\
        --merges 10900 --golden
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

LOG = logging.getLogger("extract-deepseek-merges")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "shared" / "bpe-merges.js"
DEFAULT_GOLDEN = ROOT / "tools" / "bpe-golden.json"
DEFAULT_MERGES = 10_900  # keeps merge rank 10,852, which builds " Paris" (ID 11111)
DEFAULT_MAX_BYTES = 45_000
BYTE_COUNT = 256
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
MODEL_ID_RE = re.compile(r"^[\w.-]+/[\w.-]+$")
# Pack alphabet: printable ASCII without '"' and '\', so the packed string needs no escaping in JSON or JS.
ALPHABET = "".join(chr(c) for c in range(0x21, 0x7F) if chr(c) not in '"\\')
BASE = len(ALPHABET)
# Oniguruma escapes JavaScript lacks or reads differently; translate_regex refuses them.
ONIG_ONLY_ESCAPES = frozenset("AzZGhHRXKyOo")
JS_GROUPS = ("(?:", "(?=", "(?!", "(?<=", "(?<!")
CATEGORY_NAMES = "L Lu Ll Lt Lm Lo M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po S Sm Sc Sk So Z Zs Zl Zp C Cc Cf Co Cn"
GENERAL_CATEGORIES = frozenset(CATEGORY_NAMES.split(" "))

# Lesson phrases first, then everyday English, numbers, code, whitespace and other scripts.
GOLDEN_TEXTS: tuple[str, ...] = (
    "is in Paris.",
    " Paris",
    "the cat sat",
    " The",
    "The",
    " sat",
    " The The",
    " The cat sat on the mat.",
    "The Eiffel Tower is in Paris.",
    "What's the weather in Paris?",
    "What is the weather in Paris?",
    "The weather is nice today",
    "is in Montreal",
    " learns",
    "walking",
    "Byte-pair encoding merges frequent pairs.",
    "The quick brown fox jumps over the lazy dog.",
    "UPPERCASE lowercase MixedCase",
    "don't you're it's",
    " The café 🚀",
    "café",
    "naïve résumé façade",
    "e\u0301",
    "¿Dónde está la estación?",
    "Ünïcödé ✓ → ∑ ∞",
    "你好 東京",
    "こんにちは、世界！",  # noqa: RUF001 (fullwidth punctuation on purpose)
    "カタカナとひらがな",
    "한국어 텍스트",
    "Привет, мир!",
    "مرحبا بالعالم",
    "👩🏿‍💻 and 🇫🇷",
    "🚀",
    "1234567890",
    "3.14159 and 2,718",
    "In 2026, 1,048,576 tokens.",
    "def fib(n): return n",
    "x = E[id]  # lookup",
    "SELECT * FROM tokens WHERE id < 129280;",
    '{"text": "data"}',
    "Visit example.com/path?q=1",
    "#hashtag @mention",
    "  two leading spaces",
    "trailing spaces   ",
    "line one\nline two\n\nline four",
    "\ttabbed\tcolumns",
    "CRLF\r\nends",
    "!!!???...",
    "...and then",
    "a",
    " ",
    "",
)


@dataclass(frozen=True)
class Merges:
    """Kept merges as real vocab IDs: merge i joins pairs[i] into first_id + i."""

    first_id: int
    pairs: tuple[tuple[int, int], ...]
    total: int


def bytes_to_unicode() -> dict[int, str]:
    """GPT-2's reversible byte -> printable-character map, which Hugging Face ByteLevel uses."""
    keep = [*range(0x21, 0x7F), *range(0xA1, 0xAD), *range(0xAE, 0x100)]
    chars = list(keep)
    extra = 0
    for b in range(BYTE_COUNT):
        if b not in keep:
            keep.append(b)
            chars.append(BYTE_COUNT + extra)
            extra += 1
    return {b: chr(c) for b, c in zip(keep, chars, strict=True)}


def check_model(tok: dict[str, Any]) -> None:
    """Only a plain byte-level BPE with a no-op normalizer is supported."""
    model = tok["model"]
    if model.get("type") != "BPE":
        raise ValueError(f"model type {model.get('type')!r} is not BPE")
    for key in ("dropout", "continuing_subword_prefix", "end_of_word_suffix"):
        if model.get(key) is not None:
            raise ValueError(f"model.{key} is set; the lab does not implement it")
    if model.get("byte_fallback") or model.get("ignore_merges"):
        raise ValueError("byte_fallback / ignore_merges are not implemented")
    norm = tok.get("normalizer")
    if norm is not None and not (norm.get("type") == "Sequence" and not norm.get("normalizers")):
        raise ValueError(f"normalizer {norm!r} is not a no-op")


def translate_property(pattern: str, i: int) -> tuple[str, int]:
    """``\\p{X}`` / ``\\P{X}`` / ``\\p{^X}`` at ``i`` -> the JS spelling and the index after it."""
    if pattern[i + 2 : i + 3] != "{":
        raise ValueError(f"one-letter property at {i} in {pattern!r}")
    end = pattern.index("}", i)
    name, negate = pattern[i + 3 : end], pattern[i + 1] == "P"
    if name.startswith("^"):
        name, negate = name[1:], not negate
    if name not in GENERAL_CATEGORIES:
        raise ValueError(f"property {name!r} is not a general category; add its JS spelling")
    return ("\\P{" if negate else "\\p{") + name + "}", end + 1


def translate_regex(pattern: str) -> str:
    """Translate an Oniguruma pattern to JavaScript (flags 'gu'), refusing what JS would read differently.

    One escape-aware pass. Escapes, classes, alternation, greedy and lazy quantifiers and lookaround mean
    the same in both, so they pass through; properties are respelled. Atomic groups, possessive
    quantifiers, inline flags, nested classes and Oniguruma-only escapes raise instead.
    """
    out: list[str] = []
    i, in_class = 0, False
    while i < len(pattern):
        ch = pattern[i]
        if ch == "\\":
            nxt = pattern[i + 1 : i + 2]
            if nxt in ("p", "P"):
                spelled, i = translate_property(pattern, i)
                out.append(spelled)
                continue
            if not nxt or nxt in ONIG_ONLY_ESCAPES or (nxt == "x" and pattern[i + 2 : i + 3] == "{"):
                raise ValueError(f"escape \\{nxt} at {i} has no JS equivalent in {pattern!r}")
            out.append(pattern[i : i + 2])
            i += 2
            continue
        if in_class:
            if ch == "[" or pattern.startswith("&&", i):
                raise ValueError(f"nested class or && at {i} in {pattern!r}")
            in_class = ch != "]"
        elif ch == "[":
            if pattern.startswith(("[]", "[^]"), i):
                raise ValueError(f"leading ] in a class at {i} in {pattern!r}")
            in_class = True
        elif pattern.startswith("(?", i) and not pattern.startswith(JS_GROUPS, i):
            raise ValueError(f"group {pattern[i : i + 4]!r} at {i} has no JS equivalent")
        elif ch in "*+?}" and pattern[i + 1 : i + 2] == "+":
            raise ValueError(f"possessive quantifier at {i} in {pattern!r}")
        out.append(ch)
        i += 1
    if in_class:
        raise ValueError(f"unclosed class in {pattern!r}")
    return "".join(out)


def split_patterns(tok: dict[str, Any]) -> list[str]:
    """Split regexes from a Sequence pre-tokenizer that ends in a regex-free ByteLevel step."""
    pre = tok["pre_tokenizer"]
    steps = pre["pretokenizers"] if pre.get("type") == "Sequence" else [pre]
    *splits, last = steps
    if last.get("type") != "ByteLevel" or last.get("use_regex") or last.get("add_prefix_space"):
        raise ValueError(f"last pre-tokenizer step {last!r} is not a plain ByteLevel")
    patterns: list[str] = []
    for step in splits:
        if step.get("type") != "Split" or step.get("behavior") != "Isolated" or step.get("invert"):
            raise ValueError(f"pre-tokenizer step {step!r} is not Split/Isolated")
        if "Regex" not in step["pattern"]:
            raise ValueError(f"pre-tokenizer step {step!r} splits on a literal, not a regex")
        patterns.append(translate_regex(step["pattern"]["Regex"]))
    return patterns


def merge_pair(entry: str | Sequence[str]) -> tuple[str, str]:
    """Merges are stored as "a b" (older files) or ["a", "b"] (newer files)."""
    parts = entry.split(" ") if isinstance(entry, str) else list(entry)
    if len(parts) != 2:
        raise ValueError(f"malformed merge {entry!r}")
    return parts[0], parts[1]


def read_merges(tok: dict[str, Any], keep: int, byte_ids: list[int]) -> Merges:
    """First ``keep`` merges as (left, right) vocab IDs; checks each result is ID first_id + rank."""
    vocab: dict[str, int] = tok["model"]["vocab"]
    raw = tok["model"]["merges"]
    if not 0 < keep <= len(raw):
        raise ValueError(f"--merges {keep} outside 1..{len(raw)}")
    first_id = max(byte_ids) + 1
    if sorted(byte_ids) != list(range(first_id - BYTE_COUNT, first_id)):
        raise ValueError("byte tokens are not one contiguous ID block before the first merge")
    pairs: list[tuple[int, int]] = []
    for rank, entry in enumerate(raw[:keep]):
        left, right = merge_pair(entry)
        new_id = first_id + rank
        if vocab.get(left + right) != new_id:
            raise ValueError(f"merge {rank} ({left!r} {right!r}) does not produce ID {new_id}")
        lid, rid = vocab[left], vocab[right]
        if lid >= new_id or rid >= new_id:
            raise ValueError(f"merge {rank} uses a later token")
        pairs.append((lid, rid))
    return Merges(first_id=first_id, pairs=tuple(pairs), total=len(raw))


def pack_layout(values: Sequence[int]) -> tuple[int, int]:
    """Choose the (one, two) split that packs ``values`` into the fewest characters.

    Lead digit d < one is the value itself. one <= d < one + two starts a two-digit code worth
    one + (d - one) * BASE + next. Larger lead digits start a three-digit code worth
    one + two * BASE + ((d - one - two) * BASE + next) * BASE + last.
    """
    top = max(values)
    counts = [0] * (top + 2)
    for v in values:
        counts[v + 1] += 1
    below = counts[:]  # below[x] = how many values are < x
    for x in range(1, len(below)):
        below[x] += below[x - 1]

    def under(x: int) -> int:
        return below[min(max(x, 0), top + 1)]

    best: tuple[int, int, int] | None = None
    for one in range(BASE):
        for two in range(BASE - one):
            if one + two * BASE + (BASE - one - two) * BASE * BASE <= top:
                continue
            n1 = under(one)
            n2 = under(one + two * BASE) - n1
            size = n1 + 2 * n2 + 3 * (len(values) - n1 - n2)
            if best is None or size < best[0]:
                best = (size, one, two)
    if best is None:
        raise ValueError(f"ID {top} does not fit three base-{BASE} digits")
    return best[1], best[2]


def pack_ids(values: Sequence[int], one: int, two: int) -> str:
    """Variable-length base-BASE code over ALPHABET; see pack_layout for the digit rules."""
    out: list[str] = []
    for v in values:
        if v < one:
            out.append(ALPHABET[v])
        elif v < one + two * BASE:
            hi, lo = divmod(v - one, BASE)
            out.append(ALPHABET[one + hi] + ALPHABET[lo])
        else:
            hi, rest = divmod(v - one - two * BASE, BASE * BASE)
            mid, lo = divmod(rest, BASE)
            out.append(ALPHABET[one + two + hi] + ALPHABET[mid] + ALPHABET[lo])
    return "".join(out)


def unpack_ids(text: str, one: int, two: int) -> list[int]:
    """Inverse of pack_ids, used to self-check the output before it is written."""
    digit = {c: i for i, c in enumerate(ALPHABET)}
    out: list[int] = []
    i = 0
    while i < len(text):
        d = digit[text[i]]
        if d < one:
            out.append(d)
            i += 1
        elif d < one + two:
            out.append(one + (d - one) * BASE + digit[text[i + 1]])
            i += 2
        else:
            out.append(one + two * BASE + ((d - one - two) * BASE + digit[text[i + 1]]) * BASE + digit[text[i + 2]])
            i += 3
    return out


def vocab_size(tok: dict[str, Any], config: Path | None) -> int:
    """Every ID the model can emit: BPE vocab plus added (special) tokens; cross-checked with config."""
    ids = [*tok["model"]["vocab"].values(), *(a["id"] for a in tok.get("added_tokens", []))]
    size = max(ids) + 1
    if config is not None:
        declared = json.loads(config.read_text(encoding="utf-8")).get("vocab_size")
        if declared != size:
            raise ValueError(f"config.json vocab_size {declared} != tokenizer's {size}")
    return size


def build_payload(tok: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    check_model(tok)
    b2u = bytes_to_unicode()
    vocab: dict[str, int] = tok["model"]["vocab"]
    byte_ids = [vocab[b2u[b]] for b in range(BYTE_COUNT)]
    merges = read_merges(tok, args.merges, byte_ids)
    flat = [x for pair in merges.pairs for x in pair]
    one, two = pack_layout(flat)
    packed, packed_bytes = pack_ids(flat, one, two), pack_ids(byte_ids, one, two)
    if unpack_ids(packed, one, two) != flat or unpack_ids(packed_bytes, one, two) != byte_ids:
        raise AssertionError("pack/unpack round trip failed")
    return {
        "modelId": args.model_id,
        "revision": args.revision,
        "vocabSize": vocab_size(tok, args.config),
        "mergesTotal": merges.total,
        "mergesKept": len(merges.pairs),
        "firstMergeId": merges.first_id,
        "split": split_patterns(tok),
        "flags": "gu",
        "bytes": packed_bytes,
        "code": {"base": BASE, "one": one, "two": two},
        "merges": packed,
    }


def render_js(payload: dict[str, Any]) -> str:
    """Deterministic classic script: window.DeepSeekBPE (and module.exports for node --test)."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    p = payload
    return (
        "/* Generated by tools/extract-deepseek-merges.py; do not edit, re-run it. The first "
        f"{p['mergesKept']:,} of {p['mergesTotal']:,}\n   BPE merges of {p['modelId']} @ {p['revision'][:7]}. "
        "bytes: the IDs of raw bytes 0-255. Merge i joins\n   two earlier IDs into firstMergeId + i. "
        "Both are packed in base 92 (pack_ids in the extractor). */\n"
        "(function () {\n"
        "  'use strict';\n"
        "  const freeze = o => {\n"
        "    if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); }\n"
        "    return o;\n"
        "  };\n"
        f"  const data = freeze({body});\n"
        "  if (typeof module !== 'undefined' && module.exports) module.exports = data;\n"
        "  if (typeof window !== 'undefined') window.DeepSeekBPE = data;\n"
        "})();\n"
    )


def render_golden(tok: dict[str, Any], payload: dict[str, Any]) -> str:
    """Token IDs from the tokenizers library on the same tokenizer cut to the kept merges."""
    from tokenizers import Tokenizer

    cut = {**tok, "model": {**tok["model"], "merges": tok["model"]["merges"][: payload["mergesKept"]]}}
    reference = Tokenizer.from_str(json.dumps(cut))
    lines = [
        json.dumps({"text": text, "ids": reference.encode(text, add_special_tokens=False).ids}, ensure_ascii=False)
        for text in GOLDEN_TEXTS
    ]
    head = {k: payload[k] for k in ("modelId", "revision", "mergesKept")}
    meta = json.dumps(head, separators=(",", ":"))[1:-1]
    return "{" + meta + ',"cases":[\n' + ",\n".join(lines) + "\n]}\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else None)
    ap.add_argument("--tokenizer", type=Path, required=True, help="path to tokenizer.json")
    ap.add_argument("--config", type=Path, help="config.json, to cross-check vocab_size")
    ap.add_argument("--model-id", required=True, help="Hugging Face repo, e.g. deepseek-ai/DeepSeek-V4-Pro")
    ap.add_argument("--revision", required=True, help="40-character commit SHA the files came from")
    ap.add_argument("--merges", type=int, default=DEFAULT_MERGES, help="how many merges to keep (N)")
    ap.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES, help="refuse a larger output")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--golden", nargs="?", type=Path, const=DEFAULT_GOLDEN, help="also write the golden file")
    args = ap.parse_args(argv)
    if not MODEL_ID_RE.match(args.model_id):
        ap.error(f"--model-id {args.model_id!r} is not owner/name")
    if not REVISION_RE.match(args.revision):
        ap.error("--revision must be a full 40-character commit SHA")
    return args


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")
    args = parse_args(argv)
    tok: dict[str, Any] = json.loads(args.tokenizer.read_text(encoding="utf-8"))
    try:
        payload = build_payload(tok, args)
    except ValueError as err:
        LOG.error("%s", err)
        return 1
    js = render_js(payload)
    size = len(js.encode("utf-8"))
    if size >= args.max_bytes:
        LOG.error("%s would be %d B, over the %d B budget; lower --merges", args.out, size, args.max_bytes)
        return 1
    args.out.write_text(js, encoding="utf-8", newline="\n")
    LOG.info("wrote %s: %d of %d merges, %d B", args.out, payload["mergesKept"], payload["mergesTotal"], size)
    if args.golden is not None:
        args.golden.write_text(render_golden(tok, payload), encoding="utf-8", newline="\n")
        LOG.info("wrote %s: %d cases", args.golden, len(GOLDEN_TEXTS))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
