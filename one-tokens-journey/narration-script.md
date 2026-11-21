# One Token's Journey: narration script (V4), draft 1

For the observatory tour (`final/tour-v4.html`, 30 stops) and the scrolling story (`final/one-token-journey-3d.html`, which uses the same 30 steps grouped into 6 chapters).

- **Voice:** Jade, British with a subtle French inflection (`tfvhQIydLdGEZP6h00c5`), on `eleven_v4`, 1 take per clip. One voice for the whole video. v2-hardened keeps its own existing voice.
- **Clips:** 32 (intro, 30 stops, outro). Each line is written to be spoken: numbers are spelled out, symbols removed, and acronyms either expanded or spaced ("K V").
- **Running example:** the sentence "The cat sat on the mat", where the token is " sat".
- **Audit (2026-11-21):** all 8 ⚑ lines were checked against the DeepSeek-V4 paper (arXiv 2606.19348), the V4-Pro config.json and model card, and DeepSeek's API docs. Six were correct as written. Lines 07 (precision) and 08 (context stages) were reworded below, and line 01 now uses V4-Pro's exact 33T so it matches v2-hardened. The ⚑ marks stay to show which lines carry audited figures.

## Intro

**00 · Intro**
Follow one token through a frontier model. The token is "sat", with its leading space, in the sentence: the cat sat on the mat. The model is DeepSeek V4 Pro, whose design is published.

## Chapter 1 · Data and tokens

**01 · Sources from everywhere** ⚑ corpus size
Chapter one: data and tokens. Web pages, code, books, math and synthetic reasoning traces are pooled into a single stream, thirty-three trillion tokens of it.

**02 · Duplicates out, quality in**
Copies are hashed and removed, so nothing is learned twice. Filters drop low-quality text and personal data, and the mix is rebalanced so no source dominates.

**03 · Byte-pair encoding cuts the sentence**
The tokenizer cuts text into pieces from a fixed vocabulary. Common words become one token, and the leading space travels with the word. So our token is "sat", space included.

**04 · Every token becomes an ID**
Rare words split into several pieces, each an integer ID, from a vocabulary of one hundred twenty-nine thousand, two hundred and eighty. Images take another road: their patches become vectors, not IDs.

## Chapter 2 · Pretraining at scale

**05 · Streams rise through the tower**
Chapter two: pretraining. Batches of sequences flow up through every layer at once, and a causal mask makes sure no position can peek at the future.

**06 · Score the guess, send gradients down**
After "the cat", the model spreads probability over the whole vocabulary. The loss measures how surprised it was by "sat". Gradients flow back down, and every weight takes a small step.

**07 · Sharded across racks, trained in FP8** ⚑ expert and dense precision
The one point six trillion parameter model is split across racks of accelerators, using several kinds of parallelism at once. It trains in eight-bit precision, and the released model stores its experts in four bits.

**08 · Then, a million-token memory** ⚑ context stages
Then the memory stretches. Pretraining lengthens the context in stages, from four thousand tokens to sixteen thousand, then sixty-four thousand, and finally one million.

## Chapter 3 · Post-training and reinforcement learning

**09 · First, specialist SFT and RL** ⚑ two-stage recipe
Chapter three: post-training. First, separate specialists for math, code, agents and instructions are trained on worked examples, and then with reinforcement learning.

**10 · Draw a group of attempts**
For a prompt with a checkable answer, the policy, which is the same tower, samples a group of attempts. The group of eight in the drawing is illustrative.

**11 · Grade against the group**
Verifiers grade code and math, and rubrics grade open-ended answers. Each score is compared with the group's average, so no separate value model is needed.

**12 · Distill specialists into one model**
Winning attempts are reinforced, with a penalty that keeps each specialist close to where it started. Then distillation merges all the specialists into one model.

## Chapter 4 · Inside the model

**13 · An ID becomes a vector**
Chapter four: inside the model. The token ID picks one row of the embedding table, a lookup, not a calculation. Out comes a vector of seven thousand, one hundred and sixty-eight numbers.

**14 · Normalize, then look back**
A normalized copy of the vector goes into attention. "Sat" can score every earlier token, while a causal mask hides the ones that come later.

**15 · Hybrid compressed attention** ⚑ attention design
To reach a million tokens, attention compresses its memory. Some layers read a sparse selection of compressed blocks plus a recent window. Others read heavily compressed summaries.

**16 · Merge via hyper-connections** ⚑ four-lane residual
Attention's output is added back to the residual stream, which here runs as four parallel lanes, mixed by learned connections that keep the signal stable through the depth of the tower.

**17 · The router picks 6 of 384**
A router scores three hundred and eighty-four experts and keeps the top six, while one shared expert always runs. That is why only forty-nine billion of the one point six trillion parameters work on each token.

**18 · Sixty-one distinct layers** ⚑ hash-routed first layers
The block repeats sixty-one times, each layer with its own weights: a stack, not a loop. The first three layers route tokens by hash instead of a learned router.

**19 · Score the whole vocabulary**
At the top, a final norm and the output head turn the vector into one score for every token in the vocabulary. A second head guesses one token further ahead.

**20 · Training: loss up top, gradients down**
In training, the top score is compared with the real next token, "on". The loss flows back down as gradients. There is no K V cache, because the whole sequence runs at once.

**21 · Inference: the same tower, frozen**
In serving, the same tower is frozen, and the pass only goes up. Each attention layer writes its compressed memory into the K V cache, and the top output goes to a sampler.

## Chapter 5 · Serving a request

**22 · Through the gate** ⚑ reasoning modes
Chapter five: serving your request. The gateway checks your key, your rate limits and your reasoning setting, screens for abuse, and routes you to a warm replica.

**23 · Disaggregated and continuously batched**
Modern engines split the work. One pool of accelerators reads prompts and another writes replies, and requests join the batch at every step instead of waiting their turn.

**24 · Prefill: read it all at once**
Prefill reads your whole prompt in one parallel pass. It is compute-bound, it fills the K V cache, "sat" included, and it sets the time to the first token.

**25 · Decode: one token per tick**
Decode writes one token per step: first hidden reasoning, then the reply. Each step streams the weights and the cache through memory, so it is memory-bound. Drafting a few tokens ahead speeds it up.

**26 · Sample, check, stream**
The sampler picks the next token, and keeps tool calls in valid JSON. Text is decoded into a buffer, checked by output guardrails, and only then streamed to you.

## Chapter 6 · Agents and the tool loop

**27 · The model stops with a tool call**
Chapter six: the tool loop. Instead of more text, the model can stop with a tool call, a name and its arguments, and hand control back to your app.

**28 · Your app or an MCP server runs it**
Your app, or an M C P server, runs the tool and keeps the result. Treat that result as untrusted input: it is where prompt injection usually arrives.

**29 · A brand-new request**
The API remembers nothing between calls, so your app sends the whole conversation again, with the tool call and its result appended.

**30 · Prefix cache: prefill only what's new**
The server recognizes the unchanged prefix, "sat" included, and reuses its cached memory. Only the new tokens are read, and decoding continues to the final answer.

## Outro

**31 · Outro**
Thirty stops, one token. From a page of training text to the answer on your screen, it is the same tower, used two ways.
