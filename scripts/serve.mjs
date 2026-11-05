import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const workspace = await realpath(resolve(root, '..'));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 必須是 1 到 65535 之間的整數。');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const inside = (parent, child) => {
  const part = relative(parent, child);
  return part === '' || (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part));
};
const safeSegments = path => !path.includes('\\') && !path.includes('\0') &&
  path.split('/').every(segment => !segment.startsWith('.'));

// The source allowlist comes only from the review's chapter data, never the URL.
async function sourceFiles() {
  const files = (await readdir(resolve(root, 'content'))).filter(name => /^ch\d+\.json$/.test(name));
  const allowed = new Map();
  for (const name of files) {
    const chapter = JSON.parse(await readFile(resolve(root, 'content', name), 'utf8'));
    for (const source of chapter.sources || []) {
      if (typeof source.file !== 'string' || !safeSegments(source.file) ||
          isAbsolute(source.file) || extname(source.file).toLowerCase() !== '.pdf') continue;
      const path = resolve(workspace, source.file);
      if (inside(workspace, path)) allowed.set(`/${source.file}`, path);
    }
  }
  return allowed;
}

function reply(response, method, status, message, headers = {}) {
  const body = Buffer.from(message);
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (request, response) => {
  const method = request.method || 'GET';
  if (!['GET', 'HEAD'].includes(method)) {
    reply(response, method, 405, '只接受 GET 與 HEAD 請求。', { Allow: 'GET, HEAD' });
    return;
  }
  let pathname;
  try {
    // Check the original path before URL normalization can remove '..' segments.
    pathname = decodeURIComponent((request.url || '/').split('?')[0]);
  } catch {
    reply(response, method, 400, '網址編碼不正確。');
    return;
  }
  if (!pathname.startsWith('/') || !safeSegments(pathname)) {
    reply(response, method, 403, '不允許存取這個路徑。');
    return;
  }
  if (pathname === '/' || pathname === '/Midterm_Review') {
    reply(response, method, 302, '前往複習網站。', { Location: '/Midterm_Review/' });
    return;
  }

  try {
    const isSite = pathname.startsWith('/Midterm_Review/');
    const base = isSite ? root : workspace;
    let filename;
    if (isSite) {
      filename = resolve(root, pathname.slice('/Midterm_Review/'.length) || 'index.html');
    } else {
      filename = (await sourceFiles()).get(pathname);
    }
    if (!filename || !inside(base, filename)) {
      reply(response, method, 404, '找不到檔案。');
      return;
    }
    const canonical = await realpath(filename);
    // Also reject symlinks that escape their allowed directory or reach dotfiles.
    if (!inside(base, canonical) || !safeSegments(relative(base, canonical).split(sep).join('/'))) {
      reply(response, method, 403, '不允許存取這個路徑。');
      return;
    }
    const info = await stat(canonical);
    if (!info.isFile()) {
      reply(response, method, 404, '找不到檔案。');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(canonical).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (method === 'HEAD') response.end();
    else await pipeline(createReadStream(canonical), response);
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) reply(response, method, 404, '找不到檔案。');
    else {
      console.error(`讀取檔案失敗：${error.code || error.message}`);
      reply(response, method, 500, '無法讀取檔案，請檢查教材路徑與 JSON 格式。');
    }
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`連接埠 ${port} 已被使用；可用 PORT=4174 npm start 改用其他連接埠。`);
  else console.error(`無法啟動預覽伺服器：${error.code || error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`微算機期中複習：http://127.0.0.1:${port}/Midterm_Review/`);
  console.log('僅供本機預覽，按 Ctrl+C 結束。');
});
