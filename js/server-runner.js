// js/server-runner.js — Strategy 0: Node.js server-based runner
// Posts project files to the Express server which gives them real HTTP URLs,
// fixing ES module relative imports that fail with blob: URLs.

const SERVER_API = '/api/nebula/session';

let serverAvailable = null; // cached: true | false | null (unknown)

// ── Probe whether the server API is reachable ─────────────────────────────────
export async function isServerRunnerAvailable() {
    if (serverAvailable !== null) return serverAvailable;
    try {
        const res = await fetch(SERVER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [] }),
        });
        serverAvailable = res.ok || res.status === 400; // 400 = API exists, just bad input
        return serverAvailable;
    } catch {
        serverAvailable = false;
        return false;
    }
}

// ── Upload files to server and return the preview URL ─────────────────────────
// Returns { previewUrl } on success, null on failure.
export async function buildWithServer(allFiles) {
    const files = allFiles.filter(f => f.type === 'file');

    try {
        const res = await fetch(SERVER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files }),
        });

        if (!res.ok) return null;

        const { previewUrl } = await res.json();
        return previewUrl || null;
    } catch {
        return null;
    }
}
