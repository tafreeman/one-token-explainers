import re, sys, os, subprocess, collections, posixpath
root = sys.argv[1]
os.chdir(root)
pages = subprocess.run(['git','ls-files','*.html'],capture_output=True,text=True).stdout.split()
tag_re = re.compile(r'<(script|link|iframe|img|source|audio|video)\b[^>]*>', re.I|re.S)
attr_re = re.compile(r'\b(src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
rel_re = re.compile(r'\brel\s*=\s*["\']([^"\']+)["\']', re.I)
def norm(page, ref):
    ref = ref.split('#')[0].split('?')[0]
    if not ref or re.match(r'^(https?:|data:|mailto:|javascript:|//)', ref): return None
    base = posixpath.dirname(page)
    p = posixpath.normpath(posixpath.join(base, ref)) if not ref.startswith('/') else ref.lstrip('/')
    return p
deps = {}
ext = {}
for page in pages:
    html = open(page, encoding='utf-8', errors='replace').read()
    files = []
    remote = []
    for m in tag_re.finditer(html):
        tag = m.group(1).lower(); t = m.group(0)
        if tag == 'link':
            rel = (rel_re.search(t) or [None,''])[1].lower()
            if not any(k in rel for k in ('stylesheet','preload','modulepreload','icon')): continue
            if 'icon' in rel: continue
        if tag in ('img','source','audio','video'): continue
        for a in attr_re.finditer(t):
            raw = a.group(2)
            if re.match(r'^(https?:)?//', raw): remote.append(raw); continue
            n = norm(page, raw)
            if n and re.search(r'\.(js|mjs|css|html|woff2?)$', n): files.append((tag, n))
    deps[page] = files; ext[page] = remote
users = collections.defaultdict(set)
for page, files in deps.items():
    for _, f in files: users[f].add(page)
# JS-level local loads (import / fetch / dynamic script injection of local paths)
js_re = re.compile(r'''(?:import\s*(?:[^'"]*from\s*)?\(?\s*|src\s*=\s*|fetch\(\s*|new URL\(\s*)['"](\.{1,2}/[^'"]+\.(?:js|mjs|css|json|html))['"]''')
jsrefs = {}
for f in sorted(users):
    if f.endswith('.js') and os.path.exists(f):
        s = open(f, encoding='utf-8', errors='replace').read()
        refs = sorted({posixpath.normpath(posixpath.join(posixpath.dirname(f), r)) for r in js_re.findall(s)})
        if refs: jsrefs[f] = refs
out = ['# Page dependencies', '', 'Generated from `git ls-files \'*.html\'`; parsed `<script src>`, `<link rel=stylesheet|preload|modulepreload href>` and `<iframe src>`. Remote (CDN) URLs listed separately. A file loaded by more than one page is **shared**.', '']
out.append('## Pages'); out.append('')
for page in pages:
    out.append(f'### `{page}`'); out.append('')
    if not deps[page] and not ext[page]: out.append('- (no local scripts/styles)')
    for tag, f in deps[page]:
        shared = len(users[f]) > 1
        out.append(f'- `{f}` ({tag}){" — **shared** (" + str(len(users[f])) + " pages)" if shared else ""}{"" if os.path.exists(f) else " — missing on disk"}')
    for r in ext[page]: out.append(f'- remote: `{r}`')
    out.append('')
out.append('## Shared files (loaded by more than one page)'); out.append('')
out.append('| File | Pages |'); out.append('|---|---|')
for f in sorted(users, key=lambda k:(-len(users[k]),k)):
    if len(users[f]) > 1: out.append(f'| `{f}` | {", ".join("`"+p+"`" for p in sorted(users[f]))} |')
out.append('')
out.append('## Local files loaded from inside JavaScript (static scan)'); out.append('')
if not jsrefs: out.append('- none found')
for f, refs in jsrefs.items(): out.append(f'- `{f}` → ' + ', '.join(f'`{r}`' for r in refs))
out.append('')
out.append('## One Token reader')
out.append('')
out.append('The One Token reader is served at `/index.html` (repo root); `one-token/index.html` only redirects there. Files under `one-token/` loaded by any page other than the root reader:')
out.append('')
other = sorted({f for f in users if f.startswith('one-token/') and (users[f] - {'index.html','one-token/index.html'})})
out.append('- ' + ('none' if not other else ', '.join(f'`{f}` ({", ".join(sorted(users[f]))})' for f in other)))
os.makedirs('_audit', exist_ok=True)
open('_audit/page-dependencies.md','w',encoding='utf-8').write('\n'.join(out)+'\n')
print('\n'.join(l for l in out if l.startswith('| ') or l.startswith('- `one') or 'none' in l or l.startswith('- `shared') ))
