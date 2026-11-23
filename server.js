'use strict';

const express = require('express');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const PUBLIC_DIRS = [
  'one-token',
  'end-to-end-swiss',
  'end-to-end-beamline',
  'journey-story',
  'journey-tour',
  'one-token-end-to-end',
  'one-tokens-journey',
  'shared',
];

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get(['/', '/index.html'], (_req, res) => {
    res.sendFile(path.join(ROOT, 'index.html'));
  });

  for (const dir of PUBLIC_DIRS) {
    const mountPath = `/${dir}`;
    // Redirect bare directory URLs so relative assets (../shared/*, assets/*) resolve cleanly.
    app.use((req, res, next) => {
      if (req.path === mountPath) {
        const queryIdx = req.originalUrl.indexOf('?');
        const query = queryIdx >= 0 ? req.originalUrl.slice(queryIdx) : '';
        return res.redirect(301, `${mountPath}/${query}`);
      }
      next();
    });

    app.use(
      mountPath,
      express.static(path.join(ROOT, dir), {
        dotfiles: 'deny',
        index: 'index.html',
        redirect: true,
      })
    );
  }

  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Not Found');
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`One Token Explainers listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { createApp, PUBLIC_DIRS };
