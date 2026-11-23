// Syntax-checks every inline <script> in the published HTML pages without running it.
// Classic scripts are compiled with vm.Script; JSON data blocks are parsed.
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.impeccable', '.sonar', 'artifacts']);
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const JSON_TYPES = new Set(['application/json', 'application/ld+json', 'importmap']);

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...await htmlFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.html')) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

function scriptType(attrs) {
  const match = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
  return match ? match[1].toLowerCase() : 'text/javascript';
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

const failures = [];
let checked = 0;
for (const file of await htmlFiles(root)) {
  const source = await readFile(file, 'utf8');
  const rel = path.relative(root, file).split(path.sep).join('/');
  for (const match of source.matchAll(SCRIPT)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs) || !body.trim()) continue;
    const type = scriptType(attrs);
    const line = lineOf(source, match.index);
    try {
      if (JSON_TYPES.has(type)) JSON.parse(body);
      else if (type === 'module') {
        // vm.SourceTextModule needs --experimental-vm-modules; no page uses inline modules yet.
        console.warn('check-inline-scripts: skipped inline module at ' + rel + ':' + line);
        continue;
      } else if (/javascript|ecmascript/.test(type)) new vm.Script(body, {filename: rel + ':' + line});
      else continue;
      checked++;
    } catch (error) {
      failures.push(rel + ':' + line + ' (' + type + ') ' + error.message);
    }
  }
}

if (failures.length) {
  console.error('check-inline-scripts: ' + failures.length + ' failing block(s)\n' + failures.join('\n'));
  process.exit(1);
}
console.log('check-inline-scripts: ' + checked + ' inline blocks parsed');
