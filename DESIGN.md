# Design System — One Token Explainers

## Architectural Thesis: Shared Fabric, Distinct Worlds

Four complementary explainers share one navigation fabric, motion curve, accessibility contract, and micro-lab inheritance layer while preserving each surface's distinct visual world and display voice.

| Surface | World & Polarity | Ground | Signature Accent | Display / UI / Mono |
|---|---|---|---|---|
| Landing (`index.html`) | Editorial hub (light/dark) | `#F7F7F4` / `#0F1014` | Matches each destination card | System UI / System Mono |
| Swiss (`end-to-end-swiss/`) | Warm archival paper (light) | `#F7F7F4` | Vermilion `#FF4A1C` (`#C2310B` ink) | Roboto Flex / Martian Mono |
| Beamline (`end-to-end-beamline/`) | Pale industrial hall (light) | `#E9EBEB` | Cobalt `#2F6BFF` (`#1F4FD6` ink) | Archivo / Azeret Mono |
| Story & Tour (`journey-story/`, `journey-tour/`) | Studio parchment + Keynote + Blueprint | `#ECEAE3` / `#101720` / `#0F3358` | Warm Brass `#987237` / `#c4a065` | Bricolage Grotesque / Inter Tight / JetBrains Mono |
| 3D Observatory (`shared/obs-core.html`) | Unified architectural scale model (Warm Stone + Pewter in light/standalone, Titanium-Graphite in keynote, Monochromatic Navy in blueprint) | `#eceae3` / `#151921` / `#0F3358` | Satin Brass `#9e732b` / `#c9a15a` (Terracotta `#b85233` for backprop/faults) | Google Sans Flex / Google Sans Code (Inter Tight in embed) |

## Shared Contracts

- **Cross-page fabric (`shared/suite-theme.css`):** Opts participating pages into `@view-transition { navigation: auto; }` (disabled under `prefers-reduced-motion: reduce`), defines `--suite-ease: cubic-bezier(0.16, 1, 0.3, 1)`, and styles the quiet suite home anchor, `Swiss | Beamline` stage-synced switcher, return chip (`← Back to …`), and quiet `"Inspect component in 3D →"` bridge links.
- **Concept deep-linking (`shared/concept-links.js`):** Maps 7 canonical concepts (`tokenization`, `mhc-residual`, `csa-hca-kv` / alias `kv-cache`, `moe-router`, `prefill-decode`, `utf8-sse`, `mcp-loop`) across all four explainers using explicit `file://`-safe `index.html` URLs and restores exact reading position via return-chip query params (`from`, `pos`).
- **Micro-lab inheritance (`shared/micro-labs.css`):** Inherits host `--sans`, `--mono`, `--c-acc`, and control radius tokens so every interactive probe looks native in Beamline Study, Story, Tour, and Observatory.
- **Transitions:**
  - Story 3D Expand uses FLIP geometry scaling (`380ms var(--suite-ease)`) synced with `obs-core` camera flight.
  - Tour chapter skin changes interpolate smoothly via `applySkinMix()` instead of hard-cutting backdrops.
  - Swiss stays independent of `micro-labs.js` and `obs-file-bridge.js`, never stacking a second WebGL context.
- **Epistemic hygiene:** Every counterfactual failure mode, hardware EP All-to-All dispatch estimate, sampled activation stripe, and causal steering graph is explicitly labeled illustrative and kept distinct from documented Anthropic API and DeepSeek-V4-Pro facts.
