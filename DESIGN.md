# Design System — One Token Explainers

## Architectural Thesis: One Unified Continuous Reader, Preserved Classic Worlds

The root entry (`index.html`) delivers one continuous illustrated lesson combining Swiss's readable twelve-stage structure with Beamline's dimensional choreography, an Atlas-style annotation discipline, a Presentation view, and an inline swap-in Component Inspector. One theme contract (`shared/theme-tokens.js`) drives both CSS custom properties and Three.js `r160` scene materials so page and 3D stage share one ground, one architectural material ramp, and one semantic color language. Preserved classic and deep-dive views remain accessible under **Other views** and share the same navigation fabric, motion curve, accessibility contract, and micro-lab inheritance layer.

| Surface | World & Polarity | Ground | Signature Accent | Display / UI / Mono |
|---|---|---|---|---|
| **Unified Reader (`index.html`, assets in `one-token/`)** | Warm mineral paper + limestone/pewter hardware (light) | `#F6F5F2` / `#FFFFFF` plates | Vermilion `#FF4A1C` (`#B8320D` ink) token; Cobalt `#1E4EC8` (`#2455D6` 3D) attention; Brass `#855D14` (`#C9973B` 3D) cache; Pine `#1C6B4C` (`#2C8C68` 3D) tools | Roboto Flex / Martian Mono (self-hosted WOFF2) |
| Classic Swiss (`end-to-end-swiss/`) | Warm archival paper (light) | `#F7F7F4` | Vermilion `#FF4A1C` (`#C2310B` ink) | Roboto Flex / Martian Mono |
| Classic Beamline (`end-to-end-beamline/`) | Pale industrial hall (light) | `#E9EBEB` | Cobalt `#2F6BFF` (`#1F4FD6` ink) | Archivo / Azeret Mono |
| Story & Tour (`journey-story/`, `journey-tour/`) | Studio parchment + Keynote + Blueprint | `#ECEAE3` / `#101720` / `#0F3358` | Warm Brass `#987237` / `#c4a065` | Bricolage Grotesque / Inter Tight / JetBrains Mono |
| 3D Observatory (`shared/obs-core.html`) | Unified architectural scale model (Warm Stone + Pewter in light/standalone, Titanium-Graphite in keynote, Monochromatic Navy in blueprint) | `#eceae3` / `#151921` / `#0F3358` | Satin Brass `#9e732b` / `#c9a15a` (Terracotta `#b85233` for backprop/faults) | Google Sans Flex / Google Sans Code (Inter Tight in embed) |

## Shared Contracts

- **Single theme source (`shared/theme-tokens.js`):** Defines the unified reader's ground (`#F6F5F2`), plates (`#FFFFFF`), inset (`#ECEAE3`), warm architectural stone/pewter ramp (`#EFECE6` → `#8C877E`, silhouette `#5E6268`), Vermilion token (`#FF4A1C` / `#B8320D` ink), Cobalt attention (`#1E4EC8` ink / `0x2455D6` 3D), Brass cache (`#855D14` ink / `0xC9973B` 3D), Pine tool (`#1C6B4C` ink / `0x2C8C68` 3D), and Terracotta fault (`#9E3E22` ink / `0xB85233` 3D) tokens once for both CSS custom properties and WebGL materials in `one-token/scene-diagram.js` and `one-token/scene-spatial.js`.
- **Single WebGL context & swap-in Inspector (`one-token/scene-host.js`, `one-token/inspector.js`):** Diagram and Spatial representations share one `WebGLRenderer` with on-demand idle halting (`0` idle RAF frames) and static SVG fallback (`one-token/lifecycle.svg`). Opening the Component Inspector pauses the main scene host, mounts `shared/micro-labs.js` inline, and optionally lazy-loads `shared/obs-core.html?embed=1` without stacking active WebGL render loops; closing restores scroll position and focus.
- **Cross-page fabric (`shared/suite-theme.css`):** Opts participating pages into `@view-transition { navigation: auto; }` (disabled under `prefers-reduced-motion: reduce`), defines `--suite-ease: cubic-bezier(0.16, 1, 0.3, 1)`, and styles the quiet suite home anchor, `Swiss | Beamline` stage-synced switcher, return chip (`← Back to …`), and quiet `"Inspect component in 3D →"` bridge links.
- **Concept deep-linking (`shared/concept-links.js`):** Maps 7 canonical concepts (`tokenization`, `mhc-residual`, `csa-hca-kv` / alias `kv-cache`, `moe-router`, `prefill-decode`, `utf8-sse`, `mcp-loop`) across the classic explainers using explicit `file://`-safe `index.html` URLs and restores exact reading position via return-chip query params (`from`, `pos`). `one-token/index.html` redirects cleanly to `../index.html` while preserving query and hash parameters.
- **Micro-lab inheritance (`shared/micro-labs.css`):** Inherits host `--sans`, `--mono`, `--c-acc`, and control radius tokens so every interactive probe looks native in the unified Reader Inspector, Beamline Study, Story, Tour, and Observatory.
- **Transitions:**
  - Unified Reader switches Diagram ↔ Spatial via a bounded cross-fade at the same canonical stop, preserving active stage, token form, and reading position.
  - Story 3D Expand uses FLIP geometry scaling (`380ms var(--suite-ease)`) synced with `obs-core` camera flight.
  - Tour chapter skin changes interpolate smoothly via `applySkinMix()` instead of hard-cutting backdrops.
  - Classic Swiss stays independent of `micro-labs.js` and `obs-file-bridge.js`, never stacking a second WebGL context.
- **Epistemic hygiene:** Every counterfactual failure mode, hardware EP All-to-All dispatch estimate, sampled activation stripe, and causal steering graph is explicitly labeled illustrative and kept distinct from documented Anthropic API and DeepSeek-V4-Pro facts.
