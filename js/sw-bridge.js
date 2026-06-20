// js/sw-bridge.js — Service Worker registration + file push helper

const PREVIEW_BASE = '/__nebula__/preview/';

let swRegistration = null;
let swReady        = false;

// ── Register the SW once on app boot ──────────────────────────────────────────
export async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('[Nebula SW] Service Workers not supported — falling back to blob runner.');
        return false;
    }

    try {
        swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        swReady = true;
        console.log('[Nebula SW] Registered and ready.');
        return true;
    } catch (err) {
        console.warn('[Nebula SW] Registration failed:', err.message, '— falling back to blob runner.');
        return false;
    }
}

// ── Push project files into the SW before a run ───────────────────────────────
// Returns the preview URL on success, null if SW is unavailable.
export async function activateProjectInSW(projectFiles) {
    if (!swReady) return null;

    const sw = navigator.serviceWorker.controller;
    if (!sw) {
        // SW registered but not yet controlling — wait one tick and retry
        await new Promise(r => setTimeout(r, 200));
        if (!navigator.serviceWorker.controller) return null;
    }

    const controller = navigator.serviceWorker.controller;

    await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => (e.data.ok ? resolve() : reject(new Error('SW load failed')));
        controller.postMessage(
            { type: 'NEBULA_LOAD_FILES', files: projectFiles },
            [channel.port2]
        );
    });

    return PREVIEW_BASE + 'index.html';
}

export function isSwAvailable() { return swReady; }
export const NEBULA_PREVIEW_BASE = PREVIEW_BASE;
