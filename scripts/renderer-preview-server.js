#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');

const projectRoot = process.cwd();
const previewRoot = path.join(
  projectRoot,
  'tools',
  'message-rendering-preview',
);
const port = Number(
  process.env.PORT || process.env.RENDERER_PREVIEW_PORT || 4174,
);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const resolved = path.resolve(root, decoded.replace(/^\/+/, ''));
  if (!resolved.startsWith(path.resolve(root))) {
    return undefined;
  }
  return resolved;
}

function resolveFile(urlPath) {
  if (urlPath === '/' || urlPath === '/index.html') {
    return path.join(previewRoot, 'index.html');
  }

  if (urlPath.startsWith('/vendor/marked/')) {
    return safeJoin(
      path.join(projectRoot, 'node_modules', 'marked', 'lib'),
      urlPath.replace('/vendor/marked/', ''),
    );
  }

  if (urlPath.startsWith('/vendor/katex/')) {
    return safeJoin(
      path.join(projectRoot, 'node_modules', 'katex', 'dist'),
      urlPath.replace('/vendor/katex/', ''),
    );
  }

  return safeJoin(previewRoot, urlPath);
}

const server = http.createServer((req, res) => {
  const filePath = resolveFile(req.url || '/');
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, error.code === 'ENOENT' ? 404 : 500, error.message);
      return;
    }

    const contentType =
      mimeTypes[path.extname(filePath).toLowerCase()] ||
      'application/octet-stream';
    send(res, 200, content, contentType);
  });
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Renderer preview running at ${url}`);
});
