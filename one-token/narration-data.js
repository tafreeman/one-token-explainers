/* Offline copies of Beamline's inline narration-data and Swiss's narration manifest.
   Cue times preserve the recordings; factual caption corrections are listed in reader-manifest tests.
   Spoken MP3s retain their original wording. Three reader-only clips (3f-classifiers, 6b-tool,
   6c-draft) were recorded later in the same voice (Sylvie, eleven_v4) for stops 5.3, 9.3 and 10.3,
   whose original audio described a different mechanism. */
(function (root) {
  'use strict';

  const tracks = {
    full: [
      {"id": "hero", "src": "../end-to-end-beamline/assets/narration/hero.mp3", "dur": 21.034, "cues": [{"t": 0, "s": "One token, end to end."}, {"t": 1.48, "s": "This is one beamline."}, {"t": 3.52, "s": "A single token, Paris, enters on the left as raw text and leaves on the right as a streamed reply from Claude Fable five point two."}, {"t": 13.36, "s": "Where Anthropic doesn't publish the internals, the drawing uses DeepSeek V4 Pro as a representative design, and says so."}], "stepId": "1.1"},
      {"id": "p1", "src": "../end-to-end-beamline/assets/narration/p1.mp3", "dur": 12.152, "cues": [{"t": 0, "s": "Part one: make the data."}, {"t": 2.8, "s": "Months before your request, trillions of tokens of text, code and images are gathered, cleaned, and cut into pieces from a fixed vocabulary."}], "stepId": "1.1"},
      {"id": "1a", "src": "../end-to-end-beamline/assets/narration/1a.mp3", "dur": 17.351, "cues": [{"t": 0, "s": "Many sources become one stream: public web pages, licensed data, labeled examples, data from users who opted in, and data Anthropic generates itself."}, {"t": 11.76, "s": "Our token starts here, inside a web page that says the Eiffel Tower is in Paris."}], "stepId": "1.1"},
      {"id": "1b", "src": "../end-to-end-beamline/assets/narration/1b.mp3", "dur": 10.951, "cues": [{"t": 0, "s": "At the gate, near-duplicate documents are dropped, and classifiers remove low-quality, unsafe and private text."}, {"t": 7.867, "s": "Whatever falls into the tray never reaches training."}], "stepId": "1.2"},
      {"id": "1c", "src": "../end-to-end-beamline/assets/narration/1c.mp3", "dur": 13.746, "cues": [{"t": 0, "s": "Then the tokenizer cuts the text into pieces."}, {"t": 3.68, "s": "Common words become a single piece, and the leading space travels with the word."}, {"t": 8.32, "s": "So our token is space-Paris: one piece, one integer ID."}], "stepId": "2.1"},
      {"id": "1d", "src": "../end-to-end-beamline/assets/narration/1d.mp3", "dur": 12.544, "cues": [{"t": 0, "s": "Images take a different road."}, {"t": 2.24, "s": "A vision encoder cuts each image into square patches and turns each patch into a vector, so images enter the model as embeddings, not token IDs."}], "stepId": "2.3"},
      {"id": "p2", "src": "../end-to-end-beamline/assets/narration/p2.mp3", "dur": 11.186, "cues": [{"t": 0, "s": "Part two: pretrain the tower."}, {"t": 2.96, "s": "A stack of sixty-one layers starts with random weights."}, {"t": 6.64, "s": "Predicting the next token, over and over, turns it into a model."}], "stepId": "3.1"},
      {"id": "2a", "src": "../end-to-end-beamline/assets/narration/2a.mp3", "dur": 13.197, "cues": [{"t": 0, "s": "At every position, the tower is asked what comes next."}, {"t": 4.32, "s": "After 'the Eiffel Tower is in', the right answer is Paris."}, {"t": 9.04, "s": "The bars on top are its scores for every entry in the vocabulary."}], "stepId": "3.1"},
      {"id": "2b", "src": "../end-to-end-beamline/assets/narration/2b.mp3", "dur": 13.824, "cues": [{"t": 0, "s": "The error flows back down as gradients, the copper rings, and every weight takes a small step."}, {"t": 6.8, "s": "This is where the training copy of Paris ends."}, {"t": 9.867, "s": "It survives only as tiny changes spread across the weights."}], "stepId": "3.3"},
      {"id": "2c", "src": "../end-to-end-beamline/assets/narration/2c.mp3", "dur": 12.309, "cues": [{"t": 0, "s": "No single chip can hold the model."}, {"t": 2.72, "s": "Layers, experts and data are split across a cluster of accelerators working in lockstep, with the math done in low precision to save memory."}], "stepId": "3.3"},
      {"id": "2d", "src": "../end-to-end-beamline/assets/narration/2d.mp3", "dur": 10.219, "cues": [{"t": 0, "s": "Context extension can be applied to a pretrained model."}, {"t": 3.68, "s": "In the representative config, position rescaling extends addressable positions from sixty-five thousand, five hundred and thirty-six to one million, forty-eight thousand, five hundred and seventy-six."}], "stepId": "3.4"},
      {"id": "p3", "src": "../end-to-end-beamline/assets/narration/p3.mp3", "dur": 13.511, "cues": [{"t": 0, "s": "Part three: tune it, test it, ship it."}, {"t": 4.08, "s": "Post-training teaches the model to follow instructions, reason, and decline harm."}, {"t": 9.6, "s": "Then evaluations decide whether it leaves the training floor."}], "stepId": "4.1"},
      {"id": "3a", "src": "../end-to-end-beamline/assets/narration/3a.mp3", "dur": 9.435, "cues": [{"t": 0, "s": "First, imitation."}, {"t": 2.28, "s": "Supervised fine-tuning shows the model worked examples of good replies, as the tower rolls forward along the line."}], "stepId": "4.1"},
      {"id": "3b", "src": "../end-to-end-beamline/assets/narration/3b.mp3", "dur": 15.182, "cues": [{"t": 0, "s": "Then, many tries."}, {"t": 2.32, "s": "For a problem with a checkable answer, the model makes a group of attempts and a verifier grades them."}, {"t": 8.56, "s": "Better-than-average attempts, the solid arcs, are reinforced."}, {"t": 12.72, "s": "The dashed ones are discouraged."}], "stepId": "4.2"},
      {"id": "3c", "src": "../end-to-end-beamline/assets/narration/3c.mp3", "dur": 14.059, "cues": [{"t": 0, "s": "For behavior no test can check, model judgments guided by a written constitution can train a preference model."}, {"t": 8.56, "s": "A KL penalty to the frozen reference model, the outline on the left, discourages drift."}], "stepId": "4.3"},
      {"id": "3d", "src": "../end-to-end-beamline/assets/narration/3d.mp3", "dur": 10.951, "cues": [{"t": 0, "s": "Reinforcement can train reasoning when answers can be verified."}, {"t": 2.64, "s": "Verified reasoning can earn reward during post-training; Fable five point two's exact training recipe is private."}], "stepId": "4.2"},
      {"id": "3e", "src": "../end-to-end-beamline/assets/narration/3e.mp3", "dur": 14.059, "cues": [{"t": 0, "s": "Before release, the model is tested for dangerous capabilities and for alignment."}, {"t": 5.6, "s": "Each lamp on the gate is one family of evaluations."}, {"t": 9.36, "s": "Anthropic's Responsible Scaling Policy ties deployment to the results."}], "stepId": "5.1"},
      {"id": "3f", "src": "../end-to-end-beamline/assets/narration/3f.mp3", "dur": 11.186, "cues": [{"t": 0, "s": "The tower that passes is the tower that serves."}, {"t": 3.68, "s": "Its weights are copied to the serving floor and frozen."}, {"t": 7.12, "s": "Nothing in it changes, however many requests it answers."}], "stepId": "5.3"},
      {"id": "p4", "src": "../end-to-end-beamline/assets/narration/p4.mp3", "dur": 12.152, "cues": [{"t": 0, "s": "Part four: your request arrives."}, {"t": 3.12, "s": "Now it's milliseconds, not months."}, {"t": 5.92, "s": "A new copy of Paris enters inside your prompt, and rides the return track from your app to the intake."}], "stepId": "6.1"},
      {"id": "4a", "src": "../end-to-end-beamline/assets/narration/4a.mp3", "dur": 14.869, "cues": [{"t": 0, "s": "You ask: what's the weather in Paris right now?"}, {"t": 3.36, "s": "Your app sends the whole conversation, the tools it offers, and a system prompt to the Messages API."}, {"t": 9.547, "s": "The API keeps no memory between calls, so every request carries everything."}], "stepId": "6.1"},
      {"id": "4b", "src": "../end-to-end-beamline/assets/narration/4b.mp3", "dur": 14.399, "cues": [{"t": 0, "s": "At the intake, everything is rendered into one sequence with the chat template, screened by input safety classifiers, and tokenized with the same vocabulary as training."}, {"t": 11.16, "s": "Paris gets the same ID it had in the corpus."}], "stepId": "6.2"},
      {"id": "4c", "src": "../end-to-end-beamline/assets/narration/4c.mp3", "dur": 10.872, "cues": [{"t": 0, "s": "With caching enabled, an eligible unchanged live prefix may be reused."}, {"t": 5.76, "s": "The doubled track is the prefix eligible for reuse."}, {"t": 8.56, "s": "On a cache hit, only the rest has to be computed."}], "stepId": "6.4"},
      {"id": "4d", "src": "../end-to-end-beamline/assets/narration/4d.mp3", "dur": 11.421, "cues": [{"t": 0, "s": "You're not alone on the tower."}, {"t": 2.04, "s": "A scheduler batches your prompt with other users' requests and re-forms the batch at every step, so new prompts join while others are mid-reply."}], "stepId": "8.3"},
      {"id": "p5", "src": "../end-to-end-beamline/assets/narration/p5.mp3", "dur": 9.906, "cues": [{"t": 0, "s": "Part five: inside one forward pass."}, {"t": 3.84, "s": "The same tower, weights frozen."}, {"t": 6.72, "s": "Here's what happens to one token on its way up."}], "stepId": "7.1"},
      {"id": "5a", "src": "../end-to-end-beamline/assets/narration/5a.mp3", "dur": 14.059, "cues": [{"t": 0, "s": "At the base, the token ID picks one row of the embedding table."}, {"t": 4.693, "s": "It's a lookup, not a calculation."}, {"t": 7.36, "s": "Out comes a vector of seven thousand, one hundred and sixty-eight numbers, and that vector rides up the tower."}], "stepId": "7.1"},
      {"id": "5b", "src": "../end-to-end-beamline/assets/narration/5b.mp3", "dur": 9.671, "cues": [{"t": 0, "s": "The vector travels the residual stream, the steel rod."}, {"t": 4, "s": "Each layer reads a copy, computes something, and adds its result back to the stream."}], "stepId": "7.4"},
      {"id": "5c", "src": "../end-to-end-beamline/assets/narration/5c.mp3", "dur": 12.231, "cues": [{"t": 0, "s": "In every layer, attention looks back."}, {"t": 3.2, "s": "Paris forms a query and scores it against the earlier tokens."}, {"t": 7.12, "s": "Thicker arcs mean more weight, and the neutral mask hides everything that comes after."}], "stepId": "7.2"},
      {"id": "5d", "src": "../end-to-end-beamline/assets/narration/5d.mp3", "dur": 14.242, "cues": [{"t": 0, "s": "At a million tokens, scoring every key is too slow."}, {"t": 4, "s": "So older keys are compressed into blocks, a small indexer picks the blocks that matter, and a sliding window keeps the most recent hundred and twenty-eight tokens exact."}], "stepId": "7.2"},
      {"id": "5e", "src": "../end-to-end-beamline/assets/narration/5e.mp3", "dur": 17.507, "cues": [{"t": 0, "s": "The other half of each layer is a mixture of experts."}, {"t": 3.84, "s": "A router sends Paris to six of three hundred and eighty-four experts, while one shared expert always runs."}, {"t": 10.96, "s": "That's why only forty-nine billion of one point six trillion parameters work on any one token."}], "stepId": "7.3"},
      {"id": "5f", "src": "../end-to-end-beamline/assets/narration/5f.mp3", "dur": 11.264, "cues": [{"t": 0, "s": "The block repeats sixty-one times, each layer with its own weights."}, {"t": 4.76, "s": "A stack, not a loop."}, {"t": 6.8, "s": "By the top, the vector carries what the model needs to predict what follows."}], "stepId": "7.4"},
      {"id": "5g", "src": "../end-to-end-beamline/assets/narration/5g.mp3", "dur": 13.119, "cues": [{"t": 0, "s": "At the top, the LM head turns the vector into one score for every entry in the vocabulary."}, {"t": 6.56, "s": "A small extra head behind it drafts the token after next, which serving can use to go faster."}], "stepId": "7.5"},
      {"id": "p6", "src": "../end-to-end-beamline/assets/narration/p6.mp3", "dur": 12.857, "cues": [{"t": 0, "s": "Part six: prefill, think, decode, stream."}, {"t": 5.04, "s": "The prompt goes up in one pass."}, {"t": 7.64, "s": "Then the model thinks, writes one token at a time, and streams the result."}], "stepId": "8.1"},
      {"id": "6a", "src": "../end-to-end-beamline/assets/narration/6a.mp3", "dur": 14.059, "cues": [{"t": 0, "s": "Prefill sends every prompt token up the tower in one parallel pass, writing each token's keys and values into the KV cache, the yellow rack."}, {"t": 10.267, "s": "The longer the prompt, the longer you wait for the first token."}], "stepId": "8.1"},
      {"id": "6b", "src": "../end-to-end-beamline/assets/narration/6b.mp3", "dur": 14.712, "cues": [{"t": 0, "s": "Fable five point two has adaptive thinking enabled on every turn."}, {"t": 3.52, "s": "Reasoning tokens are generated just like answer tokens, one at a time."}, {"t": 8.4, "s": "Raw reasoning is not returned as readable text, which is why the hollow tiles stop short of your app."}], "stepId": "9.1"},
      {"id": "6c", "src": "../end-to-end-beamline/assets/narration/6c.mp3", "dur": 14.712, "cues": [{"t": 0, "s": "Then decoding: one token per step."}, {"t": 3.76, "s": "Each new token needs its own trip up the tower, re-reading the weights and the cache."}, {"t": 9.147, "s": "The cache gains compressed state as generation continues, so earlier computation is not repeated."}], "stepId": "10.1"},
      {"id": "6d", "src": "../end-to-end-beamline/assets/narration/6d.mp3", "dur": 10.219, "cues": [{"t": 0, "s": "The sampler turns probabilities into one choice."}, {"t": 3.68, "s": "Here the model writes a tool call, and to fill in the city, it attends straight back to Paris in your prompt."}], "stepId": "10.4"},
      {"id": "6e", "src": "../end-to-end-beamline/assets/narration/6e.mp3", "dur": 11.682, "cues": [{"t": 0, "s": "Tokens can be decoded and streamed as server-sent events; output classifiers are a separate safeguard whose ordering is not set by the stream contract."}, {"t": 6.56, "s": "This reply stops because the model wants a tool, and the stop reason says so."}], "stepId": "11.2"},
      {"id": "p7", "src": "../end-to-end-beamline/assets/narration/p7.mp3", "dur": 10.219, "cues": [{"t": 0, "s": "Part seven: loop with tools."}, {"t": 3.04, "s": "The reply was a tool call."}, {"t": 5.08, "s": "Your app runs it, sends everything back, and the cache makes the second pass cheap."}], "stepId": "12.1"},
      {"id": "7a", "src": "../end-to-end-beamline/assets/narration/7a.mp3", "dur": 9.984, "cues": [{"t": 0, "s": "The model can't call your weather service."}, {"t": 2.72, "s": "Your code does, at the tool bench, and keeps the result."}, {"t": 6.64, "s": "Treat every tool result as untrusted input."}], "stepId": "12.1"},
      {"id": "7b", "src": "../end-to-end-beamline/assets/narration/7b.mp3", "dur": 10.637, "cues": [{"t": 0, "s": "Because the API keeps no state, your app sends the entire conversation again: your prompt, the model's tool call, and the tool result, the green tile."}], "stepId": "12.2"},
      {"id": "7c", "src": "../end-to-end-beamline/assets/narration/7c.mp3", "dur": 11.76, "cues": [{"t": 0, "s": "With caching enabled and an eligible live prefix, the unchanged request prefix may be reused."}, {"t": 6.48, "s": "On a cache hit, the old Paris doesn't go up the tower again."}, {"t": 9.52, "s": "Then only the new part is computed."}], "stepId": "12.2"},
      {"id": "7d", "src": "../end-to-end-beamline/assets/narration/7d.mp3", "dur": 11.421, "cues": [{"t": 0, "s": "With the weather in context, the model writes the answer: it's eighteen degrees and clear in Paris."}, {"t": 6.453, "s": "The loop ends when a reply stops with end turn, instead of tool use."}], "stepId": "12.3"},
      {"id": "7e", "src": "../end-to-end-beamline/assets/narration/7e.mp3", "dur": 9.827, "cues": [{"t": 0, "s": "Agents can loop for hours."}, {"t": 2.36, "s": "With compaction enabled, nearing a configurable threshold summarizes earlier turns into one block so the run can continue."}], "stepId": "12.4"},
      {"id": "f1", "src": "../end-to-end-beamline/assets/narration/f1.mp3", "dur": 15.835, "cues": [{"t": 0, "s": "Now, once more, end to end."}, {"t": 3.04, "s": "One token, from a web page in the corpus, up the tower in training, through the release gate, then back inside your request, through the forward pass, decode, the tool loop, and onto your screen."}], "stepId": "12.4"},
      {"id": "ledger", "src": "../end-to-end-beamline/assets/narration/ledger.mp3", "dur": 20.642, "cues": [{"t": 0, "s": "What's published, and what's drawn."}, {"t": 2.68, "s": "Anthropic publishes how Fable five point two behaves, not how it's built."}, {"t": 7.92, "s": "Where the drawing needs internals, it uses DeepSeek V4 Pro, and says so beside every number."}, {"t": 14.8, "s": "One token in a web page became a few weight updates."}, {"t": 18.267, "s": "A new copy of it came back as an answer."}], "stepId": "12.4"},
    ],
    quick: [
      {"id": "00-intro", "src": "../end-to-end-swiss/assets/narration/00-intro.mp3", "dur": 23.359, "cues": [{"t": 0, "s": "Follow one token through a frontier model."}, {"t": 3.04, "s": "The token is Paris, with its leading space."}, {"t": 6.48, "s": "It starts in the training data and ends on your screen, crossing twelve stages: how Claude Fable five point two is made, and how it answers you."}, {"t": 16.24, "s": "Where Anthropic doesn't publish the internals, the drawing uses DeepSeek V4 Pro's design, marked with an asterisk."}], "stepId": "1.1"},
      {"id": "01-corpus", "src": "../end-to-end-swiss/assets/narration/01-corpus.mp3", "dur": 23.098, "cues": [{"t": 0, "s": "Stage one: the corpus."}, {"t": 2.76, "s": "Web pages, code, books, papers and many languages are pooled into one stream."}, {"t": 9.28, "s": "Near-duplicates are dropped, classifiers filter out spam and personal data, and the mix is weighted toward code, math and careful prose."}, {"t": 18.88, "s": "Somewhere in it, a page says the Eiffel Tower is in Paris."}], "stepId": "1.1"},
      {"id": "02-tokens", "src": "../end-to-end-swiss/assets/narration/02-tokens.mp3", "dur": 22.706, "cues": [{"t": 0, "s": "Stage two: tokens."}, {"t": 2.8, "s": "The model never sees letters."}, {"t": 5.48, "s": "Byte-pair encoding merges frequent pairs of bytes until common words become single pieces, leading space included."}, {"t": 13.44, "s": "So Paris is one token, one integer ID."}, {"t": 18.48, "s": "Images take another road, as patch vectors from a vision encoder."}], "stepId": "2.1"},
      {"id": "03-pretrain", "src": "../end-to-end-swiss/assets/narration/03-pretrain.mp3", "dur": 21.112, "cues": [{"t": 0, "s": "Stage three: pretraining."}, {"t": 2.88, "s": "One objective, repeated trillions of times: predict the next token."}, {"t": 8.76, "s": "Batches flow up the tower in parallel, the loss scores the probability given to Paris, and gradients nudge every weight."}, {"t": 17.04, "s": "Then the context is stretched toward a million positions."}], "stepId": "3.1"},
      {"id": "04-post-train", "src": "../end-to-end-swiss/assets/narration/04-post-train.mp3", "dur": 21.112, "cues": [{"t": 0, "s": "Stage four: post-training."}, {"t": 2.88, "s": "Fine-tuning on curated demonstrations teaches the model to follow instructions."}, {"t": 8.08, "s": "Then it samples a group of attempts, verifiers grade them, and the better-than-average attempts are reinforced."}, {"t": 15.173, "s": "Written principles add AI feedback, and a penalty keeps the policy close to where it started."}], "stepId": "4.1"},
      {"id": "05-release", "src": "../end-to-end-swiss/assets/narration/05-release.mp3", "dur": 20.956, "cues": [{"t": 0, "s": "Stage five: release."}, {"t": 2.72, "s": "The final checkpoint is evaluated for what it can do, and for what it could be misused to do."}, {"t": 9.2, "s": "Red teams hunt for jailbreaks, safeguards scale with capability, and the results go in a system card."}, {"t": 16.4, "s": "Safety classifiers ship alongside."}, {"t": 18.907, "s": "The weights are now frozen."}], "stepId": "5.1"},
      {"id": "06-request", "src": "../end-to-end-swiss/assets/narration/06-request.mp3", "dur": 21.582, "cues": [{"t": 0, "s": "Stage six: your request."}, {"t": 3.36, "s": "Months later, you ask for the weather in Paris, with a weather tool attached."}, {"t": 8.267, "s": "The API is stateless, so every call carries the whole conversation."}, {"t": 13.36, "s": "Tools, system and messages are rendered in a fixed order, cut by the same tokenizer, and checked against the prompt cache."}], "stepId": "6.1"},
      {"id": "07-forward-pass", "src": "../end-to-end-swiss/assets/narration/07-forward-pass.mp3", "dur": 25.344, "cues": [{"t": 0, "s": "Stage seven: the forward pass."}, {"t": 3.2, "s": "This is the engine, drawn from DeepSeek V4 Pro's published design."}, {"t": 8.347, "s": "The ID picks one row of the embedding table."}, {"t": 11.867, "s": "Attention reads earlier positions sparsely."}, {"t": 14.72, "s": "A router sends the token to six of three hundred and eighty-four experts, plus a shared one."}, {"t": 20.64, "s": "That repeats sixty-one times, and the head scores the whole vocabulary."}], "stepId": "7.1"},
      {"id": "08-prefill", "src": "../end-to-end-swiss/assets/narration/08-prefill.mp3", "dur": 19.519, "cues": [{"t": 0, "s": "Stage eight: prefill."}, {"t": 2.68, "s": "Serving runs the frozen tower in two phases."}, {"t": 6.16, "s": "Prefill pushes every prompt token up at once, in one parallel pass, and each layer caches its keys and values."}, {"t": 14.64, "s": "Your request shares the hardware with other users, batched continuously."}], "stepId": "8.1"},
      {"id": "09-think", "src": "../end-to-end-swiss/assets/narration/09-think.mp3", "dur": 20.459, "cues": [{"t": 0, "s": "Stage nine: thinking."}, {"t": 2.64, "s": "On Fable five point two, thinking is always on."}, {"t": 6.8, "s": "You set an effort level, from low to max, and the model decides how much to think."}, {"t": 12.56, "s": "Raw reasoning is not returned as readable text."}, {"t": 15.6, "s": "Here, it works out that it can't know today's weather, and should call the tool."}], "stepId": "9.1"},
      {"id": "10-decode", "src": "../end-to-end-swiss/assets/narration/10-decode.mp3", "dur": 18.709, "cues": [{"t": 0, "s": "Stage ten: decode."}, {"t": 2.84, "s": "Now it's a loop: one pass up the tower for each new token, each pass reading the whole cache."}, {"t": 9.707, "s": "A cheap draft can propose the next token for the big model to verify."}, {"t": 14.107, "s": "The model writes a tool call: get weather, for the city of Paris."}], "stepId": "10.1"},
      {"id": "11-stream", "src": "../end-to-end-swiss/assets/narration/11-stream.mp3", "dur": 15.6, "cues": [{"t": 0, "s": "Stage eleven: streaming."}, {"t": 2.76, "s": "Token IDs are decoded back into text and streamed to your app as server-sent events, while generation is still running."}, {"t": 10.533, "s": "The response ends with a stop reason."}, {"t": 13.333, "s": "Here, the reason is tool use."}], "stepId": "11.1"},
      {"id": "12-tool-loop", "src": "../end-to-end-swiss/assets/narration/12-tool-loop.mp3", "dur": 18.709, "cues": [{"t": 0, "s": "Stage twelve: the tool loop."}, {"t": 3.04, "s": "Claude can't check the weather itself, so your code runs the tool and appends the result."}, {"t": 8.747, "s": "The whole conversation goes back in; with caching enabled and an eligible live prefix, its unchanged prefix may be reused."}, {"t": 13.92, "s": "Decoding resumes, the reply ends, and Paris reaches your screen."}], "stepId": "12.1"},
      {"id": "13-outro", "src": "../end-to-end-swiss/assets/narration/13-outro.mp3", "dur": 5.752, "cues": [{"t": 0, "s": "Twelve stages, one token."}, {"t": 3.04, "s": "Scroll to any stage to read it in detail."}], "stepId": "12.4"},
    ],
  };

  // Reader-only recordings in the Beamline voice. The source copies above stay byte-for-byte;
  // routes reference these by id alongside them.
  tracks.supplements = {
    full: [
      {"id": "3f-classifiers", "src": "../end-to-end-beamline/assets/narration/3f-classifiers.mp3", "dur": 9.6, "cues": [{"t": 0, "s": "Deployed models run with safety classifiers beside them."}, {"t": 3.47, "s": "On Fable five point two, a classifier can end a reply with the stop reason refusal."}], "stepId": "5.3"},
      {"id": "6b-tool", "src": "../end-to-end-beamline/assets/narration/6b-tool.mp3", "dur": 9.84, "cues": [{"t": 0, "s": "Here the reasoning works out that it can't know today's weather, so it should call get weather."}, {"t": 5.46, "s": "Every reasoning step attends over the KV cache, Paris included."}], "stepId": "9.3"},
      {"id": "6c-draft", "src": "../end-to-end-beamline/assets/narration/6c-draft.mp3", "dur": 14.4, "cues": [{"t": 0, "s": "A cheap draft can propose the next token or two, and the next pass of the big model checks them in parallel."}, {"t": 6.22, "s": "In this representative design, the draft comes from the multi-token prediction head."}, {"t": 11.59, "s": "Anthropic doesn't publish how Claude is served."}], "stepId": "10.3"},
    ],
    quick: [],
  };

  // Narrated routes follow the written lesson, independently of source clip order.
  // [clip, stepId, start, end, spatialBeat, selectable]. Part cards and recaps are
  // playable but not direct-stop destinations. Every source range is covered once.
  // A cut inside a combined cue is a documented best-fit visual boundary, not a
  // word-level transcription; the active caption remains continuous across it.
  const makeSegment = ([clip, stepId, start, end, spatialBeat = clip, selectable = true]) =>
    ({clip, stepId, start, end, spatialBeat, selectable});
  tracks.routes = {
    full: [
      ['hero', '1.1', 0, 21.034, 'hero', false],
      ['p1', '1.1', 0, 12.152, 'p1', false],
      ['1a', '1.1', 0, 17.351],
      ['1b', '1.2', 0, 3.68], // Best fit: duplicate removal, then filtering in one cue.
      ['1b', '1.3', 3.68, 10.951],
      ['1c', '2.1', 0, 8.32],
      ['1c', '2.2', 8.32, 13.746],
      ['1d', '2.3', 0, 12.544],
      ['p2', '3.1', 0, 11.186, 'p2', false],
      ['2a', '3.1', 0, 4.32],
      ['2a', '3.2', 4.32, 13.197],
      ['2b', '3.3', 0, 13.824],
      ['2c', '3.3', 0, 12.309],
      ['2d', '3.4', 0, 10.219],
      ['p3', '4.1', 0, 13.511, 'p3', false],
      ['3a', '4.1', 0, 9.435],
      ['3b', '4.2', 0, 15.182],
      ['3d', '4.2', 0, 10.951],
      ['3c', '4.3', 0, 8.56],
      ['3c', '4.4', 8.56, 14.059],
      ['3e', '5.1', 0, 9.36],
      ['3e', '5.2', 9.36, 14.059],
      ['3f', '5.3', 0, 11.186],
      ['3f-classifiers', '5.3', 0, 9.6, '3f'],
      ['p4', '6.1', 0, 12.152, 'p4', false],
      ['4a', '6.1', 0, 14.869],
      ['4b', '6.2', 0, 6.4], // Best fit: rendering, then tokenization in one cue.
      ['4b', '6.3', 6.4, 14.399],
      ['4c', '6.4', 0, 10.872],
      ['p5', '7.1', 0, 9.906, 'p5', false],
      ['5a', '7.1', 0, 14.059],
      ['5c', '7.2', 0, 12.231],
      ['5d', '7.2', 0, 14.242],
      ['5e', '7.3', 0, 17.507],
      ['5b', '7.4', 0, 9.671],
      ['5f', '7.4', 0, 11.264],
      ['5g', '7.5', 0, 13.119],
      ['p6', '8.1', 0, 12.857, 'p6', false],
      ['6a', '8.1', 0, 6], // Best fit: parallel prefill, then its KV-cache write.
      ['6a', '8.2', 6, 14.059],
      ['4d', '8.3', 0, 11.421],
      ['6b', '9.1', 0, 8.4],
      ['6b', '9.2', 8.4, 14.712],
      ['6b-tool', '9.3', 0, 9.84, '6b'], // Recorded for this stop; 6b has no tool-choice sentence.
      ['6c', '10.1', 0, 14.712], // Includes the cache-state sentence once heard at 10.3.
      ['6d', '10.2', 0, 3.68],
      ['6c-draft', '10.3', 0, 14.4, '6c'], // Recorded for this stop.
      ['6d', '10.4', 3.68, 10.219],
      ['6e', '11.1', 0, 3.2], // Best fit: detokenization, then streaming in one cue.
      ['6e', '11.2', 3.2, 6.56],
      ['6e', '11.3', 6.56, 11.682],
      ['p7', '12.1', 0, 10.219, 'p7', false],
      ['7a', '12.1', 0, 9.984],
      ['7b', '12.2', 0, 10.637],
      ['7c', '12.2', 0, 11.76],
      ['7d', '12.3', 0, 11.421],
      ['7e', '12.4', 0, 9.827],
      ['f1', '12.4', 0, 15.835, 'f1', false],
      ['ledger', '12.4', 0, 20.642, 'ledger', false],
    ].map(makeSegment),
    quick: [
      ['00-intro', '1.1', 0, 23.359, 'hero', false],
      ['01-corpus', '1.1', 0, 9.28, '1a'],
      ['01-corpus', '1.2', 9.28, 13.5, '1b'], // Best fit within filtering/mixing cue.
      ['01-corpus', '1.3', 13.5, 23.098, '1b'],
      ['02-tokens', '2.1', 0, 13.44, '1c'],
      ['02-tokens', '2.2', 13.44, 18.48, '1c'],
      ['02-tokens', '2.3', 18.48, 22.706, '1d'],
      ['03-pretrain', '3.1', 0, 8.76, '2a'],
      ['03-pretrain', '3.2', 8.76, 12.8, '2a'], // Best fit: loss, then gradients.
      ['03-pretrain', '3.3', 12.8, 17.04, '2b'],
      ['03-pretrain', '3.4', 17.04, 21.112, '2d'],
      ['04-post-train', '4.1', 0, 8.08, '3a'],
      ['04-post-train', '4.2', 8.08, 15.173, '3b'],
      ['04-post-train', '4.3', 15.173, 18, '3c'], // Best fit: principles, then anchor.
      ['04-post-train', '4.4', 18, 21.112, '3c'],
      ['05-release', '5.1', 0, 9.2, '3e'],
      ['05-release', '5.2', 9.2, 16.4, '3e'],
      ['05-release', '5.3', 16.4, 20.956, '3f'],
      ['06-request', '6.1', 0, 13.36, '4a'],
      ['06-request', '6.2', 13.36, 16, '4b'], // Three written steps share one cue.
      ['06-request', '6.3', 16, 18.8, '4b'],
      ['06-request', '6.4', 18.8, 21.582, '4c'],
      ['07-forward-pass', '7.1', 0, 11.867, '5a'],
      ['07-forward-pass', '7.2', 11.867, 14.72, '5d'],
      ['07-forward-pass', '7.3', 14.72, 20.64, '5e'],
      ['07-forward-pass', '7.4', 20.64, 22.7, '5f'], // Best fit: repeats, then LM head.
      ['07-forward-pass', '7.5', 22.7, 25.344, '5g'],
      ['08-prefill', '8.1', 0, 6.16, '6a'],
      ['08-prefill', '8.2', 6.16, 14.64, '6a'],
      ['08-prefill', '8.3', 14.64, 19.519, '4d'],
      ['09-think', '9.1', 0, 12.56, '6b'],
      ['09-think', '9.2', 12.56, 15.6, '6b'],
      ['09-think', '9.3', 15.6, 20.459, '6b'],
      ['10-decode', '10.1', 0, 6, '6c'],
      ['10-decode', '10.2', 6, 9.707, '6d'], // No sampler sentence exists in this clip.
      ['10-decode', '10.3', 9.707, 14.107, '6c'],
      ['10-decode', '10.4', 14.107, 18.709, '6d'],
      ['11-stream', '11.1', 0, 5.8, '6e'], // Best fit: detokenization, then SSE.
      ['11-stream', '11.2', 5.8, 10.533, '6e'],
      ['11-stream', '11.3', 10.533, 15.6, '6e'],
      ['12-tool-loop', '12.1', 0, 8.747, '7a'],
      ['12-tool-loop', '12.2', 8.747, 13.92, '7c'],
      ['12-tool-loop', '12.3', 13.92, 16.5, '7d'],
      ['12-tool-loop', '12.4', 16.5, 18.709, '7e'], // No long-session sentence exists.
      ['13-outro', '12.4', 0, 5.752, '7e', false],
    ].map(makeSegment),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = tracks;
  if (root) root.ReaderNarration = tracks;
})(typeof window === 'undefined' ? null : window);
