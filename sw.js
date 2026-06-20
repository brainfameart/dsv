// sw.js — Nebula Studio virtual file server
// Intercepts all fetches to /__nebula__/preview/* and serves
// the in-memory file cache that the IDE pushes before each run.

const SCOPE = '/__nebula__/preview/';

// In-memory file store: path → { content, isBinary, mime }
let fileStore = {};

// ── Message handler — IDE sends files before each run ─────────────────────────
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'NEBULA_LOAD_FILES') {
        fileStore = {};
        for (const f of e.data.files) {
            fileStore[f.name] = f;
        }
        e.ports[0] && e.ports[0].postMessage({ ok: true });
    }
    if (e.data && e.data.type === 'NEBULA_CLEAR') {
        fileStore = {};
        e.ports[0] && e.ports[0].postMessage({ ok: true });
    }
});

// ── Fetch interceptor ──────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    if (!url.pathname.startsWith(SCOPE)) return; // not our request

    e.respondWith(serveFile(url.pathname));
});

function serveFile(pathname) {
    // Strip the scope prefix to get the virtual file path
    // e.g. /__nebula__/preview/js/utils/math.js → js/utils/math.js
    let filePath = pathname.slice(SCOPE.length);

    // Remove leading slash if any
    if (filePath.startsWith('/')) filePath = filePath.slice(1);

    // Try exact match, then index.html fallback for bare directories
    let file = fileStore[filePath];
    if (!file && (filePath === '' || filePath.endsWith('/'))) {
        file = fileStore['index.html'] || fileStore[filePath + 'index.html'];
    }

    if (!file) {
        return new Response(`Nebula SW: file not found — "${filePath}"`, {
            status: 404,
            headers: { 'Content-Type': 'text/plain' }
        });
    }

    const mime = guessMime(filePath, file);

    if (file.isBinary) {
        // content is a data URL — decode to bytes
        try {
            const [header, b64] = file.content.split(',');
            const binary = atob(b64);
            const buf = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
            return new Response(buf, { status: 200, headers: { 'Content-Type': mime } });
        } catch (err) {
            return new Response('Binary decode error: ' + err.message, { status: 500 });
        }
    }

    return new Response(file.content, {
        status: 200,
        headers: { 'Content-Type': mime }
    });
}

function guessMime(path, file) {
    // If we already have a data URL, extract from it
    if (file.isBinary && file.content && file.content.startsWith('data:')) {
        const m = file.content.match(/^data:([^;,]+)/);
        if (m) return m[1];
    }
    const ext = path.split('.').pop().toLowerCase();
    return {
        html: 'text/html',
        htm:  'text/html',
        css:  'text/css',
        js:   'application/javascript',
        mjs:  'application/javascript',
        json: 'application/json',
        txt:  'text/plain',
        md:   'text/markdown',
        svg:  'image/svg+xml',
        png:  'image/png',
        jpg:  'image/jpeg',
        jpeg: 'image/jpeg',
        gif:  'image/gif',
        webp: 'image/webp',
        ico:  'image/x-icon',
        woff: 'font/woff',
        woff2:'font/woff2',
        ttf:  'font/ttf',
        otf:  'font/otf',
        mp3:  'audio/mpeg',
        wav:  'audio/wav',
        ogg:  'audio/ogg',
        mp4:  'video/mp4',
        webm: 'video/webm',
        glb:  'model/gltf-binary',
        gltf: 'model/gltf+json',
        wasm: 'application/wasm',
        xml:  'application/xml',
    }[ext] || 'application/octet-stream';
}

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
