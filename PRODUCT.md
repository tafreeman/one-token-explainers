# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Learners range from newcomers discovering how LLMs work to technical readers who
want to inspect individual mechanisms. Support multiple depths of understanding;
do not assume that every learner arrives with an engineering background or that
every learner needs only an introductory explanation.

Guided teaching and presentation are the main intended outcome. A presenter can
walk an audience through the lifecycle, while learners can pause, revisit a stage,
or open more detailed explanations and labs within the same interface.

## Product Purpose

One Token Explainers helps people understand how a large language model is built
and what happens between a prompt and a reply. It follows a token through data,
training, post-training, inference, serving, streaming, and the tool loop.

Success means a learner can explain the major stages and distinguish a public API
contract, a documented model mechanism, and an illustrative teaching example.
Let learners choose a presentation style; the Swiss route shows all written
mechanisms and specifications while the other formats emphasize different modes
of visual inspection.

These are learning goals, not measured learning gains. The root entry offers four explainer formats. Swiss exposes the complete lesson,
including code and specifications, without stage-level disclosure controls.
The separate formats remain complementary rather than consolidated.

Swiss also offers **Explore the token**: the learner moves Paris through the
existing 3D stages with an axis or arrows, then sees it in the illustrative reply.
The written route remains directly available. Opening detail preserves the current
scene and reading position until navigation resumes; reduced motion and static
fallbacks retain the same controls and lesson content.

## Positioning

The organizing device is one token followed through the lifecycle, with
complementary narrated and inspectable visual explanations. Bring that educational
range into one interface through optional deeper explanations and inspection,
starting with a simple guided account.

Do not describe the product as the only, best, or most rigorous explainer without
current, comparable evidence.

## Operating Context

The existing product is a public static website with standalone HTML pages.
Learners can use the hosted site or open local pages with their sibling assets
present. Viewing does not require a build step. An optional Express server is
available through `npm run dev`.

Swiss is one of four first-class learning interfaces. The current implementation also retains
separate formats, which are source material for further consolidation:

- **One Token, End to End (Swiss):** a twelve-stage lifecycle explanation.
- **One Token, End to End (Beamline):** the lifecycle presented as physical
  stations, with Watch and Study modes.
- **One Token's Journey:** a chapter-based explanation with inspectable 3D rooms.
- **Guided Tour:** a stop-based route through the model with deeper component
  references.
- **3D Observatory:** the shared scene, also available as a standalone page.

Narration, captions, written explanations, playback controls, component details,
and small labs provide different ways to follow and revisit the material.

## Capabilities and Constraints

- Preserve static hosting and local/offline use. Bundled Three.js builds support
  offline scenes; pinned CDN mirrors are a fallback when a bundled file is missing.
- No paid API account or model download is required to use the existing product.
  Current labs are local teaching simulations, not live frontier-model execution.
- Keep model-specific internals separate from public API behavior. The current
  lifecycle explanation combines Claude API examples with explicitly representative
  DeepSeek internals; this must not imply that Claude's architecture is disclosed.
- Identify simplifications, hypothetical examples, benchmark settings, and the
  scope and date of sourced claims. A passing fact gate checks selected assertions;
  it does not establish that every explanation is correct.
- Preserve usable written content and navigation when 3D or narration is
  unavailable. Optional inspection should add depth without becoming a prerequisite
  for following a guided explanation.

## Evidence on Hand

- The page READMEs and embedded source lists document provenance and known limits.
- `shared/journey-narration/narration-script.md` and the explainer narration assets
  provide existing guided material. Some audit corrections still require narration
  updates; do not assume that audio and corrected on-screen copy agree everywhere.
- `shared/micro-labs.js` contains the current interactive teaching examples.
- `tools/check-facts.mjs` checks selected factual claims; `tools/verify-browser.cjs`
  checks browser behavior, accessibility findings, and performance scenarios.
- `docs/audit-remediation-plan-2026-11-22.md` records the audit findings,
  implementation sequence, completed corrections, and remaining verification gaps.

The available audits and automated checks do not establish improved learning
outcomes. User research, comprehension testing, and the right depth transitions
for different learner groups remain open validation work.

## Product Principles

1. Make guided teaching understandable across a range of starting knowledge.
2. Make the four formats discoverable and keep the full written explanation accessible without mandatory expansion.
3. Preserve the boundary between documented facts and teaching models.
4. Keep essential understanding available through text and accessible controls,
   alongside narration and 3D.
5. Judge educational improvements through learner evidence as well as engineering
   checks; do not substitute feature counts or audit scores for understanding.

## Accessibility & Inclusion

Maintain keyboard navigation, visible focus, captions, readable text alternatives,
reduced-motion behavior, and layouts usable on desktop and mobile web. Native
controls should retain their expected keyboard behavior.

Automated browser and accessibility checks cover selected scenarios. Physical
phone interaction and screen-reader output remain unverified; do not claim full
accessibility conformance from those checks alone.
