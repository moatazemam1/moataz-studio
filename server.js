import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'portfolio.json');

// Credentials (Changeable via environment variables if desired)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'moataz.emam.de@gmail.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Moataz@2026';

// Ensure data folders exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Load default portfolio data if not present
let portfolioStore = {
  version: 1,
  data: null
};

if (fs.existsSync(DB_FILE)) {
  try {
    portfolioStore = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) {
    console.error('Error reading db file:', e);
  }
} else {
  const defaultsPath = path.join(PUBLIC_DIR, 'defaults.json');
  if (fs.existsSync(defaultsPath)) {
    portfolioStore.data = JSON.parse(fs.readFileSync(defaultsPath, 'utf-8'));
    fs.writeFileSync(DB_FILE, JSON.stringify(portfolioStore, null, 2));
  }
}

// Media metadata registry
const MEDIA_META_FILE = path.join(DATA_DIR, 'media.json');
let mediaList = [];
if (fs.existsSync(MEDIA_META_FILE)) {
  try {
    mediaList = JSON.parse(fs.readFileSync(MEDIA_META_FILE, 'utf-8'));
  } catch (e) {
    mediaList = [];
  }
}

function saveMediaMeta() {
  fs.writeFileSync(MEDIA_META_FILE, JSON.stringify(mediaList, null, 2));
}

// Active session tokens
const sessions = new Set();

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return cookies.auth_session && sessions.has(cookies.auth_session);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

  // Root redirects to portfolio
  if (pathname === '/') {
    pathname = '/portfolio.html';
  }

  // Admin route check
  if (pathname === '/admin' || pathname === '/admin/') {
    if (!isAuthenticated(req)) {
      res.writeHead(302, { Location: '/login.html' });
      res.end();
      return;
    }
    res.writeHead(302, { Location: '/admin-ui.html' });
    res.end();
    return;
  }

  // Admin-ui protection
  if (pathname === '/admin-ui.html') {
    if (!isAuthenticated(req)) {
      res.writeHead(302, { Location: '/login.html' });
      res.end();
      return;
    }
  }

  // API: Login
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        const matchUser = (username === ADMIN_USER || username.toLowerCase() === ADMIN_EMAIL.toLowerCase());
        const matchPass = (password === ADMIN_PASS);

        if (matchUser && matchPass) {
          const token = crypto.randomUUID();
          sessions.add(token);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
          });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'بيانات غير صالحة' }));
      }
    });
    return;
  }

  // API: Logout
  if (pathname === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    if (cookies.auth_session) sessions.delete(cookies.auth_session);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'auth_session=; Path=/; HttpOnly; Max-Age=0'
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // API: Portfolio GET & PUT
  if (pathname === '/api/portfolio') {
    const authed = isAuthenticated(req);

    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({
        data: portfolioStore.data,
        version: portfolioStore.version,
        canEdit: Boolean(authed)
      }));
      return;
    }

    if (req.method === 'PUT') {
      if (!authed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'تسجيل الدخول مطلوب للحفظ' }));
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (!payload.data || typeof payload.version !== 'number') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'بيانات غير صالحة' }));
            return;
          }

          portfolioStore.data = payload.data;
          portfolioStore.version = (payload.version || 0) + 1;
          fs.writeFileSync(DB_FILE, JSON.stringify(portfolioStore, null, 2));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ version: portfolioStore.version }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'حدث خطأ أثناء الحفظ' }));
        }
      });
      return;
    }
  }

  // API: Media List & Upload
  if (pathname === '/api/media') {
    const authed = isAuthenticated(req);

    if (req.method === 'GET') {
      if (!authed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'غير مصرح' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ files: mediaList }));
      return;
    }

    if (req.method === 'POST') {
      if (!authed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'غير مصرح' }));
        return;
      }

      const type = req.headers['content-type'] || '';
      const size = Number(req.headers['x-file-size']) || 0;
      const name = decodeURIComponent(req.headers['x-file-name'] || 'file');

      const id = crypto.randomUUID();
      const ext = path.extname(name) || (type.startsWith('video') ? '.mp4' : '.jpg');
      const filePath = path.join(UPLOADS_DIR, `${id}${ext}`);
      const fileStream = fs.createWriteStream(filePath);

      req.pipe(fileStream);

      fileStream.on('finish', () => {
        const item = {
          id,
          name,
          type,
          size: fs.statSync(filePath).size,
          created: new Date().toISOString(),
          filename: `${id}${ext}`
        };
        mediaList.unshift(item);
        saveMediaMeta();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id,
          src: `/api/media/${id}`,
          type: type.startsWith('video') ? 'video' : 'image',
          name
        }));
      });

      fileStream.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'فشل حفظ الملف' }));
      });
      return;
    }
  }

  // API: Media Serve & Delete by ID
  const mediaMatch = pathname.match(/^\/api\/media\/([a-f0-9-]+)$/);
  if (mediaMatch) {
    const id = mediaMatch[1];
    const mediaItem = mediaList.find(m => m.id === id);

    if (req.method === 'DELETE') {
      if (!isAuthenticated(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'غير مصرح' }));
        return;
      }
      if (mediaItem) {
        const filePath = path.join(UPLOADS_DIR, mediaItem.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        mediaList = mediaList.filter(m => m.id !== id);
        saveMediaMeta();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'GET' && mediaItem) {
      const filePath = path.join(UPLOADS_DIR, mediaItem.filename);
      serveStaticFile(req, res, filePath, mediaItem.type);
      return;
    }
  }

  // Static files in public directory
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (safePath.startsWith(PUBLIC_DIR) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    serveStaticFile(req, res, safePath, contentType);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

function serveStaticFile(req, res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const partialstart = parts[0];
    const partialend = parts[1];

    const start = parseInt(partialstart, 10);
    const end = partialend ? parseInt(partialend, 10) : total - 1;
    const chunksize = (end - start) + 1;

    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': contentType.startsWith('video/') ? 'public, max-age=86400' : 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Moataz Studio running at http://127.0.0.1:${PORT}`);
});
