---
version: 1
slug: "one-token-index-html"
primary_target: "index.html"
related_targets: ["one-token/index.html"]
---

# Continuous Reader

## Direction contract

**Thesis** Follow one token through a continuous written lesson and a synchronized architectural figure. Readers can change representations at the sentence they are reading.

**Own world** Warm mineral paper, solid white plates, limestone and pewter hardware. Vermilion identifies the token, cobalt identifies attention, brass identifies cached state, and green identifies tool results. Roboto Flex gives the specimen its changing form. Martian Mono sets technical readouts.

**Story** Meet “ Paris” in a document. Follow its training example into the weights, then meet a fresh copy in a request. Inspect a mechanism and return to the same passage.

**First viewport** One compact masthead. The opening and primary reading action sit beside the specimen and active scene. A twelve-stage axis anchors the page. On a phone the figure and caption occupy the top of the reader.

**Form** seed: none (pinned). “Continuous Reader concept as the main experience, the Atlas's annotation discipline, and a presentation view derived from the Studio concept.”

**Finish** Unreviewed and undocumented is unfinished. Verify the reading and presentation states, normal and reduced motion, software rendering and offline access. Record the finish review and the design contract.

## Finish review (2026-11-23)

- **Promoted to root:** `index.html` is now the unified Continuous Reader; `one-token/index.html` redirects to `../index.html` while preserving query and hash fragments over HTTP and `file://`.
- **Automated & visual verification:** Passed `npm run lint` (17 inline blocks, 54/54 fact checks), `npm test` (29/29), `npm run build`, `npm run verify:browser` (0 console errors, 0 axe WCAG 2.1 AA violations across `1440×900`, `1024×768`, `390×844`, `844×390` in normal and reduced motion; Read/Present/Recap/Audio/Inspector over HTTP and `file://`; no-JS, no-WebGL, and WebGL context recovery; plus Swiss, Beamline, Story, Tour, and Observatory regressions), and `npm run verify:warp` (Diagram: 46 draws / 18.0 ms p95; Spatial: 45 draws / 18.1 ms p95; 0 idle frames).
- **Polish verified on rendered captures:** Fixed `#present` WCAG 2.5.3 accessible-name mismatch, `#runStory` stop-icon toggle, single-line 12-stage bottom rail at `1440px` and `1024px` (`>= 11px` floor), mobile Present single-row caption and Spatial `5d` camera framing, landscape phone opening spacing, `.view-switch` and `.spec`/`.recap` vertical padding, and explicit WebGL fallback/recovery copy.
- **Unverified limits:** Physical mobile touch devices and live assistive technology / screen-reader output were not tested in headless Chromium.
