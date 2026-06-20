// server.js — Nebula Studio dev server
// Serves the IDE static files and provides a virtual file hosting API
// so user project files get real HTTP URLs (fixes ES module relative imports).

import express from 'express';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 5000;

// Parse large JSON bodies — projects can have many files
app.use(express.json({ limit: '50mb' }));

// ── In-memory session store ────────────────────────────────────────────────────
// sessionId → Map<filePath, { content, isBinary, mime }>
const sessions = new Map();

// Cleanup old sessions after 30 minutes
function pruneOldSessions() {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, session] of sessions.entries()) {
        if (session.createdAt < cutoff) sessions.delete(id);
    }
}
setInterval(pruneOldSessions, 5 * 60 * 1000);

// ── MIME guesser ───────────────────────────────────────────────────────────────
function guessMime(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    return {
        html: 'text/html; charset=utf-8',
        htm:  'text/html; charset=utf-8',
        css:  'text/css; charset=utf-8',
        js:   'application/javascript; charset=utf-8',
        mjs:  'application/javascript; charset=utf-8',
        json: 'application/json; charset=utf-8',
        txt:  'text/plain; charset=utf-8',
        md:   'text/markdown; charset=utf-8',
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
        wasm: 'application/wasm',
        xml:  'application/xml',
    }[ext] || 'application/octet-stream';
}

// ── API: Create a preview session ─────────────────────────────────────────────
// POST /api/nebula/session
// Body: { files: [{ name, content, isBinary }] }
// Returns: { sessionId, previewUrl }
app.post('/api/nebula/session', (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files)) {
        return res.status(400).json({ error: 'files must be an array' });
    }

    const sessionId = randomBytes(12).toString('hex');
    const fileMap   = new Map();

    for (const f of files) {
        if (f.type !== 'file' && f.type !== undefined) continue; // skip folders
        fileMap.set(f.name, f);
    }

    sessions.set(sessionId, { files: fileMap, createdAt: Date.now() });

    const previewUrl = `/preview/${sessionId}/index.html`;
    res.json({ sessionId, previewUrl });
});

// ── API: Serve a file from a session ──────────────────────────────────────────
// GET /preview/:sessionId/:filePath(*)
app.get('/preview/:sessionId/*', (req, res) => {
    const { sessionId } = req.params;
    const filePath = req.params[0] || 'index.html';

    const session = sessions.get(sessionId);
    if (!session) {
        return res.status(404).send('Session not found or expired.');
    }

    let file = session.files.get(filePath);

    // Fallback: bare directory → index.html
    if (!file && (filePath === '' || filePath.endsWith('/'))) {
        file = session.files.get('index.html') || session.files.get(filePath + 'index.html');
    }

    if (!file) {
        return res.status(404).send(`File not found in session: "${filePath}"`);
    }

    const mime = guessMime(filePath);

    if (file.isBinary) {
        // content is a data URL — decode base64 to buffer
        try {
            const base64 = file.content.split(',')[1];
            const buf = Buffer.from(base64, 'base64');
            res.setHeader('Content-Type', mime);
            return res.send(buf);
        } catch (err) {
            return res.status(500).send('Binary decode error: ' + err.message);
        }
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.send(file.content);
});

// ── Serve IDE static files ─────────────────────────────────────────────────────
app.use(express.static(__dirname, {
    index: 'index.html',
    setHeaders(res, path) {
        // Allow service worker to register at root scope
        if (path.endsWith('sw.js')) {
            res.setHeader('Service-Worker-Allowed', '/');
        }
    }
}));

// Fallback — serve index.html for any unknown route (SPA)
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nebula Studio running on port ${PORT}`);
});
