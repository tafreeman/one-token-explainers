#!/usr/bin/env node
// Narration parity lock. Each recorded clip's spoken text is pinned to its MP3, so a script or caption edit
// that is not re-recorded fails `check-facts` instead of shipping audio that says something else.
//
//   node tools/narration-lock.mjs           list clips whose text or audio no longer match the lock
//   node tools/narration-lock.mjs --write   re-pin after re-recording (refuses text-only changes)
//   node tools/narration-lock.mjs --write --captions-only
//                                            re-pin a caption fix that now matches what the audio already says
//
// Spoken text: Beamline's ElevenLabs script (`narration-script.json` `text`); Swiss and Journey cue lines,
// which are the captions of the recorded audio. Mirrors (inline manifests, the Reader's narration-data.js)
// are checked elsewhere in check-facts and tools/reader-manifest.test.cjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK_PATH = join(ROOT, 'tools', 'narration-lock.json');
const sha = (data) => createHash('sha256').update(data).digest('hex');
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const cueText = (cues) => cues.map((c) => c.s.trim()).join('\n');

export function snapshot() {
  const clips = [];
  const add = (track, id, text, mp3) => {
    const file = join(ROOT, mp3);
    clips.push({ track, id, spokenSha256: sha(text), audioSha256: existsSync(file) ? sha(readFileSync(file)) : 'missing' });
  };
  for (const c of json('end-to-end-beamline/narration-script.json').clips) {
    add('beamline', c.id, c.text.trim(), `end-to-end-beamline/assets/narration/${c.id}.mp3`);
  }
  for (const c of json('end-to-end-swiss/assets/narration/manifest.json').clips) {
    add('swiss', c.id, cueText(c.cues), join('end-to-end-swiss', c.src));
  }
  const journey = json('shared/journey-narration/manifest.json');
  for (const c of [...journey.clips, ...(journey.extras || [])]) {
    add('journey', c.id, cueText(c.cues), `shared/journey-narration/${c.src.split('/').pop()}`);
  }
  return clips;
}

export const readLock = () => JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
const key = (c) => `${c.track}/${c.id}`;

// Every way the current tree differs from the lock, as readable lines.
export function drift(lock = readLock(), current = snapshot()) {
  const pinned = new Map(lock.clips.map((c) => [key(c), c]));
  const now = new Map(current.map((c) => [key(c), c]));
  const out = [];
  for (const [k, c] of now) {
    const p = pinned.get(k);
    if (!p) out.push(`${k}: new clip, not in the lock`);
    else if (c.audioSha256 === 'missing') out.push(`${k}: MP3 missing`);
    else if (p.spokenSha256 !== c.spokenSha256 && p.audioSha256 === c.audioSha256) out.push(`${k}: spoken text changed but the audio was not re-recorded`);
    else if (p.spokenSha256 === c.spokenSha256 && p.audioSha256 !== c.audioSha256) out.push(`${k}: audio changed; re-pin it with --write`);
    else if (p.spokenSha256 !== c.spokenSha256) out.push(`${k}: re-recorded; re-pin it with --write`);
  }
  for (const k of pinned.keys()) if (!now.has(k)) out.push(`${k}: in the lock but no longer narrated`);
  return out;
}

function write(captionsOnly) {
  const lock = existsSync(LOCK_PATH) ? readLock() : { clips: [], pendingRerecord: {} };
  const textOnly = drift(lock).filter((line) => line.includes('not re-recorded'));
  if (textOnly.length && !captionsOnly) {
    console.error('Refusing to re-pin text that the audio does not say. Re-record these clips, or pass --captions-only\nif the new text now matches the recording:');
    for (const line of textOnly) console.error('  ' + line);
    process.exit(1);
  }
  const next = { ...lock, clips: snapshot() };
  writeFileSync(LOCK_PATH, JSON.stringify(next, null, 1) + '\n');
  console.log(`narration-lock: pinned ${next.clips.length} clips`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--write')) write(process.argv.includes('--captions-only'));
  else {
    const lines = drift();
    for (const line of lines) console.log(line);
    console.log(lines.length ? `narration-lock: ${lines.length} clip(s) differ from the lock` : 'narration-lock: every clip matches its recording');
    process.exit(lines.length ? 1 : 0);
  }
}
