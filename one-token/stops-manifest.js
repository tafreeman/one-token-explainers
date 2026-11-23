(function (root) {
  'use strict';

  const tracks = root ? root.ReaderNarration : require('./narration-data.js');
  const links = root ? root.SuiteLinks : require('../shared/concept-links.js');

  const stages = [
    { name: 'Corpus', tokenForm: 'word in a document', glyphAxes: [151, 220] },
    { name: 'Tokens', tokenForm: 'token · ID 12842', glyphAxes: [56, 520] },
    { name: 'Pretrain', tokenForm: 'training target', glyphAxes: [100, 900] },
    { name: 'Post-train', tokenForm: 'part of a graded attempt', glyphAxes: [118, 700] },
    { name: 'Release', tokenForm: 'frozen into the weights', glyphAxes: [100, 620] },
    { name: 'Request', tokenForm: 'token in your prompt', glyphAxes: [132, 420] },
    { name: 'Forward pass', tokenForm: 'vector · float[7,168]', glyphAxes: [46, 860] },
    { name: 'Prefill', tokenForm: 'entry in the KV cache', glyphAxes: [78, 880] },
    { name: 'Think', tokenForm: 'context for reasoning', glyphAxes: [100, 250] },
    { name: 'Decode', tokenForm: 'copied into a tool call', glyphAxes: [68, 800] },
    { name: 'Stream', tokenForm: 'text on the wire', glyphAxes: [151, 480] },
    { name: 'Tool loop', tokenForm: 'argument, then answer', glyphAxes: [100, 720] },
  ];

  // Written step ID, title, and Beamline beat. Component stops also carry the shared slug.
  const lesson = [
    ['1.1', 'Pool the sources', '1a'],
    ['1.2', 'Remove duplicates', '1b'],
    ['1.3', 'Filter and mix', '1b'],
    ['2.1', 'Byte-pair encoding', '1c', 'tokenization'],
    ['2.2', 'A fixed vocabulary', '1c'],
    ['2.3', 'Images take another road', '1d'],
    ['3.1', 'Forward, in parallel', '2a'],
    ['3.2', 'Score the guess', '2a'],
    ['3.3', 'Adjust every weight', '2b'],
    ['3.4', 'Stretch the context', '2d'],
    ['4.1', 'Imitate', '3a'],
    ['4.2', 'Try, grade, reinforce', '3b'],
    ['4.3', 'Principles as feedback', '3c'],
    ['4.4', 'Stay near the anchor', '3c'],
    ['5.1', 'Evaluate', '3e'],
    ['5.2', 'Red-team, then set safeguards', '3e'],
    ['5.3', 'Ship with classifiers', '3f'],
    ['6.1', 'One call', '4a'],
    ['6.2', 'Rendered in a fixed order', '4b'],
    ['6.3', 'The same tokenizer', '4b'],
    ['6.4', 'Check the prefix cache', '4c'],
    ['7.1', 'Look up a vector', '5a'],
    ['7.2', 'Attend, sparsely', '5d', 'csa-hca-kv'],
    ['7.3', 'Route to 6 of 384 experts', '5e', 'moe-router'],
    ['7.4', 'Add back, sixty-one times', '5f', 'mhc-residual'],
    ['7.5', 'Score the vocabulary', '5g'],
    ['8.1', 'Parallel and compute-bound', '6a', 'prefill-decode'],
    ['8.2', 'Fill the KV cache', '6a'],
    ['8.3', 'Batched with strangers', '4d'],
    ['9.1', 'Effort sets the depth', '6b'],
    ['9.2', 'Never returned raw', '6b'],
    ['9.3', 'Reasoning picks the tool', '6b'],
    ['10.1', 'Memory-bound', '6c'],
    ['10.2', 'Sample', '6d'],
    ['10.3', 'Draft, then verify', '6c'],
    ['10.4', '“Paris”, again', '6d'],
    ['11.1', 'Detokenize', '6e', 'utf8-sse'],
    ['11.2', 'Stream', '6e'],
    ['11.3', 'Stop, with a reason', '6e'],
    ['12.1', 'Your code runs the tool', '7a'],
    ['12.2', 'A new request, a warm prefix', '7c', 'mcp-loop'],
    ['12.3', 'The answer', '7d'],
    ['12.4', 'Long sessions', '7e'],
  ];

  const stageCounts = stages.map((_, index) => lesson.filter(([id]) => id.startsWith(`${index + 1}.`)).length);
  const stops = lesson.map(([id, title, spatialBeat, conceptSlug = null]) => {
    const [stage, step] = id.split('.').map(Number);
    const { tokenForm, glyphAxes } = stages[stage - 1];
    // Swiss begins the first article at 6% of each station, with the lead before it.
    const segment = 0.94 / stageCounts[stage - 1];
    const start = stage - 1 + 0.06 + (step - 1) * segment;
    const end = step === stageCounts[stage - 1] ? stage : start + segment;
    const concept = links.resolve(conceptSlug);
    return {
      id, stage, title, tokenForm, glyphAxes, diagramPose: [start, end], spatialBeat, conceptSlug,
      ...(concept && { labId: concept.lab, obsFocus: concept.obs }),
    };
  });

  const manifest = { stages, stops, tracks };
  if (typeof module !== 'undefined' && module.exports) module.exports = manifest;
  if (root) root.ReaderManifest = manifest;
})(typeof window === 'undefined' ? null : window);
