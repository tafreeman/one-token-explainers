'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../server.js');

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: urlPath },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', reject);
  });
}

test('static server serves all explainers, redirects bare dirs, and blocks private files', async () => {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();

  try {
    const rootRes = await request(port, '/');
    assert.equal(rootRes.status, 200);
    assert.match(rootRes.headers['content-type'], /text\/html/);
    assert.match(rootRes.body.toString('utf8'), /One Token Explainers/);

    for (const dir of [
      '/end-to-end-swiss',
      '/end-to-end-beamline',
      '/journey-story',
      '/journey-tour',
    ]) {
      const redir = await request(port, `${dir}?rm=1`);
      assert.equal(redir.status, 301);
      assert.equal(redir.headers.location, `${dir}/?rm=1`);

      const page = await request(port, `${dir}/`);
      assert.equal(page.status, 200);
      assert.match(page.headers['content-type'], /text\/html/);
    }

    const obs = await request(port, '/shared/obs-core.html');
    assert.equal(obs.status, 200);
    assert.match(obs.headers['content-type'], /text\/html/);

    const labs = await request(port, '/shared/micro-labs.js');
    assert.equal(labs.status, 200);

    const audio = await request(port, '/end-to-end-swiss/assets/narration/00-intro.mp3');
    assert.equal(audio.status, 200);
    assert.equal(audio.headers['accept-ranges'], 'bytes');
    assert.ok(audio.body.length > 1000);

    for (const forbidden of ['/server.js', '/package.json', '/.gitignore', '/tools/check-facts.mjs']) {
      const res = await request(port, forbidden);
      assert.equal(res.status, 404, `expected 404 for ${forbidden}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
