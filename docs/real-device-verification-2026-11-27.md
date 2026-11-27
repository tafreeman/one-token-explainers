# Real-device verification — 2026-11-27

**Status: not yet run.** This is the protocol and the record to fill in. Every automated check so far ran in
desktop Chromium with emulated viewports (`npm run verify:browser`: 1440×900, 390×844, 844×390, 360×640, axe-core
WCAG 2.1 AA). Emulation does not exercise real touch input, mobile Safari's toolbars and safe areas, or a real
screen reader, so those results stay "unverified" in the READMEs until a row below is filled in.

## Devices

| Device | OS / browser | Assistive tech | Tester | Date | Result |
| --- | --- | --- | --- | --- | --- |
| iPhone (any, notch or Dynamic Island) | iOS Safari | VoiceOver | | | not run |
| Android phone | Android Chrome | TalkBack | | | not run |
| Windows desktop | Chrome or Edge | NVDA | | | not run |

## Pages

Use the deployed site, <https://tafreeman.github.io/one-token-explainers/>, so caching, HTTPS and the Pages paths
match what readers get.

1. Journey hub, `/`
2. Guided tour, `/journey-tour/`
3. Reader, `/one-token/`
4. Swiss, `/end-to-end-swiss/`
5. Beamline, `/end-to-end-beamline/`
6. Observatory, `/shared/obs-core.html`

## Touch pass (iOS Safari and Android Chrome)

For each page, portrait and then landscape:

- [ ] Nothing scrolls sideways, and nothing hides under the notch, the home indicator or the browser toolbars.
- [ ] Every button and lab control responds to one tap. Sliders drag without scrolling the page.
- [ ] Tour: play, mute, next and previous work, and swiping the page does not pause narration unexpectedly.
- [ ] Observatory: one-finger orbit, two-finger pinch zoom, and the stage index opens and closes. Zone headers
      never sit under the open index.
- [ ] Narration starts after the first tap (autoplay policy), and captions stay off the body text.

## Screen-reader pass (VoiceOver, TalkBack, NVDA)

- [ ] Page title and the first heading are announced, and landmarks (header, nav, main) are reachable.
- [ ] Every lab control has a name and state, for example "Break: Load-Bias Off, toggle button, not pressed".
- [ ] Changes to lab read-outs and tour cards are announced once, not repeated on every frame.
- [ ] The 3D canvas is skipped or described, and focus never gets stuck inside the Observatory iframe.
- [ ] Dialogs (All components, Text view) trap focus, and Escape or Close returns focus to the opener.

## Findings

| # | Device / AT | Page | What happened | Severity | Issue / PR |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

When every row above has a result, update the "Known limits" section of `journey-story/README.md`, which
currently says physical-phone touch and screen-reader output remain unverified.
