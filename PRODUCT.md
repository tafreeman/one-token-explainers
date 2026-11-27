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
The root entry (`index.html`) opens directly into **One Token's Journey** as a
full-section braided centerpiece so learners do not have to choose a format
before starting: first-run visitors start in **Deep** mode with expanded lesson
cards, visible math and open labs. Each card can be collapsed without losing lab
values. Chapter-matched pooled 3D `Diagram` and
`Spatial` stages (`shared/spine-stage-pool.js`), inline micro-labs, Observatory
cutaways, and a bottom capstone launching the **Cinema 3D Flythrough**
(`journey-tour/index.html?mode=flythrough`) complete the experience. **Basic** mode
remains available for a shorter explanation. Both Journey and Reader finish
pretraining, fine-tuning and release before the new-request inference story.
The release transition distinguishes a training occurrence from a fresh prompt
occurrence of the tracked token; only learned weight changes survive training.

These are learning goals, not measured learning gains. Alongside the root
Braided *Journey* hub, the **12-Stage Continuous Reader** (`one-token/index.html`)
synchronizes the twelve-stage written lesson beside a persistent 3D figure that
switches between **Diagram** (Swiss wireframe assemblies) and **Spatial**
(Beamline hall choreography), plus **Present** mode and an inline **Component
Inspector**.

Opening detail preserves the current scene and reading position until
navigation resumes; reduced motion and static fallbacks retain the same
controls and lesson content. All six stage-synced formats and all seven hands-on
labs remain accessible from the shared **Views** menu across every surface.

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

The root entry (`index.html`) is **One Token's Journey**, the full-section
braided centerpiece (`journey-story/index.html` provides a compatibility
redirect). Every surface shares the minimalist `44px` **Views** bar linking all
six formats and seven hands-on labs:

- **One Token's Journey (`index.html`):** the root six-chapter braided
  centerpiece following `" sat"` through chapter-matched Story SVGs, pooled
  Diagram/Spatial 3D stage bands, inline micro-labs, 3D Observatory portals,
  Basic/Deep progressive disclosure, Jade narration, and the Cinema 3D
  Flythrough capstone.
- **12-Stage Reader (`one-token/index.html`):** the twelve-stage Continuous
  Reader with synchronized Diagram/Spatial 3D views, Basic/Deep toggle, Present
  mode, guided narration (9:41 full walkthrough + optional 4:38 quick summary),
  and an inline Component Inspector.
- **One Token, End to End (Swiss) (`end-to-end-swiss/index.html`):** the classic
  twelve-stage editorial plate explanation.
- **One Token, End to End (Beamline) (`end-to-end-beamline/index.html`):** the
  classic physical-stations hall with Watch and Study modes.
- **Guided Tour (`journey-tour/index.html`):** the 30-stop guided route with
  catalog and `?mode=flythrough` Cinema 3D Flythrough HUD.
- **3D Observatory (`shared/obs-core.html`):** the shared 31-assembly
  architectural cutaway scene, available both inline and standalone.

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
