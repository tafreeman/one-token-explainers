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
The root entry (`index.html`) opens directly into one unified Continuous Reader
so learners do not have to choose a format before starting the lesson.

These are learning goals, not measured learning gains. The unified Continuous
Reader exposes the complete twelve-stage written lesson without mandatory
stage-level disclosure controls, synchronized beside a single persistent 3D
figure that switches between **Diagram** (Swiss wireframe assemblies) and
**Spatial** (Beamline hall choreography) at the exact step being read, plus a
**Present** mode for guided walkthroughs and an inline **Component Inspector**
for micro-labs and 3D Observatory cutaways.

Opening detail preserves the current scene and reading position until
navigation resumes; reduced motion and static fallbacks retain the same
controls and lesson content. The earlier standalone formats remain accessible
from the quiet **Other views** menu for deep-dive study or comparison.

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

The root entry (`index.html`) is the unified Continuous Reader (`one-token/`
holds its assets and a compatibility redirect at `one-token/index.html`). The
repo also preserves the separate formats under the **Other views** menu:

- **One Token, End to End (`index.html`):** the unified twelve-stage Continuous
  Reader with synchronized Diagram/Spatial 3D views, Present mode, guided
  narration (9:41 full walkthrough + optional 4:38 quick summary), and an
  inline Component Inspector.
- **One Token, End to End (Swiss):** the classic twelve-stage editorial plate
  explanation.
- **One Token, End to End (Beamline):** the classic physical-stations hall with
  Watch and Study modes.
- **One Token's Journey:** a chapter-based explanation with inspectable 3D rooms.
- **Guided Tour:** a stop-based route through the model with deeper component
  references.
- **3D Observatory:** the shared architectural cutaway scene, available both
  inside the Component Inspector and as a standalone page.

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
2. Start directly in the unified lesson without mandatory expansion, while keeping the classic and deep-dive formats discoverable under **Other views**.
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
