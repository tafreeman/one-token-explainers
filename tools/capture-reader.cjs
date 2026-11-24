'use strict';

// Capture the same seven spatial stops against any checkout URL (used for before/after evidence).
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const {createApp} = require('../server');
const {visualStops} = require('./reader-browser.cjs');

async function main() {
  const args = process.argv.slice(2);
  const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  const artifacts = value('--out') || await fs.mkdtemp(path.join(os.tmpdir(), 'reader-spatial-'));
  await fs.mkdir(artifacts, {recursive: true});
  let server;
  let url = value('--url');
  if (!url) {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
  }
  const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
  try {
    await visualStops(browser, url, artifacts, {captureOnly: args.includes('--capture-only')});
    console.log('Reader spatial captures:', artifacts);
  } finally {
    await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
