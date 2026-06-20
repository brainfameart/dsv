// ── Import map injector ────────────────────────────────────────────────────────
// If the project has an importmap.json and the HTML doesn't already have one,
// inject it as <script type="importmap"> before the first <script> tag.
function injectImportMap(html, files) {
    // Already has an importmap — leave it alone
    if (/type\s*=\s*["']importmap["']/.test(html)) return html;

    const mapFile = files.find(f => f.name === 'importmap.json');
    if (!mapFile) return html;

    try {
        JSON.parse(mapFile.content); // validate JSON
    } catch {
        return html; // malformed — skip
    }

    const tag = `<script type="importmap">\n${mapFile.content}\n<\/script>`;
    // Inject before first <script or </head>
    if (html.includes('</head>')) return html.replace('</head>', tag + '\n</head>');
    if (html.includes('<script')) return html.replace('<script', tag + '\n<script');
    return tag + html;
}

// js/runner.js — Project runner
// Strategy 0 (best):      Node.js server — files get real HTTP URLs, all relative
//   ES module imports resolve natively. No blob: or SW scope issues.
// Strategy 1 (fallback):  Service Worker virtual server — relative imports resolve
//   natively because every file has a real URL under /__nebula__/preview/.
// Strategy 2 (last resort): Blob bundler — rewrites import specifiers to blob: URLs.

import { dom, state }         from './state.js';
import { logToConsole }       from './ui.js';
import { saveCurrentProject } from './projects.js';
import { activateProjectInSW, isSwAvailable } from './sw-bridge.js';
import { buildWithServer, isServerRunnerAvailable } from './server-runner.js';

// ── Path resolver ──────────────────────────────────────────────────────────────
function resolvePath(base, rel) {
    const segs = base.includes('/') ? base.split('/').slice(0, -1) : [];
    for (const p of rel.split('/')) {
        if (p === '.' || p === '') continue;
        if (p === '..') segs.pop();
        else            segs.push(p);
    }
    return segs.join('/');
}

// ── Module detection ───────────────────────────────────────────────────────────
function detectStrategy(f) {
    if (!f.name.endsWith('.js')) return f.strategy || 'classic';
    if (/^\s*(import\s|export\s)/m.test(f.content || '')) return 'module';
    return 'classic';
}

function isModule(f) {
    return (f.strategy || detectStrategy(f)) === 'module';
}

// ── Levenshtein distance for "did you mean" ────────────────────────────────────
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
}

function closestFile(target, fileNames) {
    let best = null, bestDist = Infinity;
    for (const name of fileNames) {
        // Compare just the base filename portion
        const base = name.split('/').pop();
        const tBase = target.split('/').pop();
        const dist = levenshtein(tBase.toLowerCase(), base.toLowerCase());
        if (dist < bestDist) { bestDist = dist; best = name; }
    }
    // Only suggest if distance is small (likely typo)
    return bestDist <= 3 ? best : null;
}

// ── Pre-run checks ─────────────────────────────────────────────────────────────
// 1. Auto-update strategy on every JS file by scanning its content
// 2. Warn about script src references that don't resolve to a known file
function preRunChecks(allFiles) {
    const files   = allFiles.filter(f => f.type === 'file');
    const fileMap = new Map(files.map(f => [f.name, f]));
    const jsNames = files.filter(f => f.name.endsWith('.js')).map(f => f.name);

    // 1. Auto-detect and update strategy
    let updated = 0;
    for (const f of files) {
        if (!f.name.endsWith('.js')) continue;
        const detected = detectStrategy(f);
        if (f.strategy !== detected) {
            f.strategy = detected;
            updated++;
        }
    }
    if (updated > 0) {
        logToConsole('info', `⚙ Auto-detected script type for ${updated} file${updated > 1 ? 's' : ''}.`);
        // Sync strategy selector if currently open file was updated
        const active = state.activeFileName;
        if (active && dom.strategy) {
            const af = fileMap.get(active);
            if (af) dom.strategy.value = af.strategy || 'classic';
        }
    }

    // 2. Check HTML for script src references
    const index = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
    if (!index) return;

    const html = index.content || '';
    const srcRe = /<script\b[^>]+\bsrc\s*=\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = srcRe.exec(html)) !== null) {
        const src = m[1];
        if (/^(https?:|\/\/|blob:|data:)/.test(src)) continue; // external — skip
        const resolved = resolvePath('index.html', src);
        if (!fileMap.has(resolved)) {
            const suggestion = closestFile(resolved, jsNames);
            const hint = suggestion
                ? ` — did you mean "${suggestion}"?`
                : '';
            logToConsole('warn', `⚠ Script not found: "${src}"${hint}`);
        }
    }

    // 3. Check for ES module imports referencing missing files
    for (const f of files) {
        if (!f.name.endsWith('.js')) continue;
        const content = f.content || '';
        const importRe = /\bfrom\s*['"](\.[^'"]+)['"]/g;
        let im;
        while ((im = importRe.exec(content)) !== null) {
            const spec = im[1];
            const resolved = resolvePath(f.name, spec);
            const withJs = resolved.endsWith('.js') ? resolved : resolved + '.js';
            if (!fileMap.has(resolved) && !fileMap.has(withJs)) {
                const suggestion = closestFile(resolved, jsNames);
                const hint = suggestion ? ` — did you mean "${suggestion}"?` : '';
                logToConsole('warn', `⚠ Import not found in "${f.name}": "${spec}"${hint}`);
            }
        }
    }
}

// Console bridge injected into every preview HTML
const CONSOLE_BRIDGE = `<script>
window.onerror = function(message, url, line, col, error) {
    let f = url || '';
    if (f.includes('nebula://')) f = f.split('nebula://')[1];
    window.parent.postMessage({ type: 'error', msg: message + (error ? '\\n' + error.stack : ''), file: f, line: line }, '*');
};
const _l = console.log, _w = console.warn, _e = console.error;
console.log   = function() { const a=[...arguments]; window.parent.postMessage({type:'log',  msg:a.map(String).join(' ')}, '*'); _l.apply(console,a); };
console.warn  = function() { const a=[...arguments]; window.parent.postMessage({type:'warn', msg:a.map(String).join(' ')}, '*'); _w.apply(console,a); };
console.error = function() { const a=[...arguments]; window.parent.postMessage({type:'error',msg:a.map(String).join(' ')}, '*'); _e.apply(console,a); };
<\/script>`;

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 1 — Service Worker runner
// ══════════════════════════════════════════════════════════════════════════════
async function buildWithSW(allFiles) {
    const files = allFiles.filter(f => f.type === 'file');
    const index = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
    if (!index) return null;

    const indexContent   = injectImportMap(index.content, files);
    const patchedContent = indexContent.includes('</body>')
        ? indexContent.replace('</body>', CONSOLE_BRIDGE + '\n</body>')
        : indexContent + CONSOLE_BRIDGE;

    const patchedFiles = files.map(f =>
        f.name === index.name ? { ...f, content: patchedContent } : f
    );

    return await activateProjectInSW(patchedFiles);
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 2 — Blob bundler (fallback)
// ══════════════════════════════════════════════════════════════════════════════
export function buildProjectHtml(allFiles) {
    const files   = allFiles.filter(f => f.type === 'file');
    const fileMap = {};
    files.forEach(f => { fileMap[f.name] = f; });

    const urlMap = {};
    files.forEach(f => {
        if (f.name.endsWith('.js') || f.name.endsWith('.html')) return;
        if (f.isBinary) {
            try {
                const byteString = atob(f.content.split(',')[1]);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                const mime = f.content.split(';')[0].split(':')[1];
                urlMap[f.name] = URL.createObjectURL(new Blob([ab], { type: mime }));
            } catch (e) { /* skip */ }
        } else {
            const type = f.name.endsWith('.css') ? 'text/css' : 'text/plain';
            urlMap[f.name] = URL.createObjectURL(new Blob([f.content], { type }));
        }
    });

    const moduleUrlMap = {};
    const processing   = new Set();
    const processed    = new Set();

    function resolveImportPath(fromFile, importPath) {
        if (!importPath.startsWith('./') && !importPath.startsWith('../')) return null;
        return resolvePath(fromFile, importPath);
    }

    function processModule(filePath) {
        if (processed.has(filePath))  return moduleUrlMap[filePath];
        if (processing.has(filePath)) return moduleUrlMap[filePath] || null;
        processing.add(filePath);
        const f = fileMap[filePath];
        if (!f) { processing.delete(filePath); return null; }
        let code = f.content || '';
        function rewriteSpecifier(spec) {
            const abs = resolveImportPath(filePath, spec);
            if (!abs) return spec;
            return processModule(abs) || spec;
        }
        code = code.replace(/\b(from\s*)(['"])(\.\.?\/[^"']+)\2/g,  (m, pre, q, s) => `${pre}${q}${rewriteSpecifier(s)}${q}`);
        code = code.replace(/\bimport\s*(['"])(\.\.?\/[^"']+)\1/g,  (m, q, s) => `import ${q}${rewriteSpecifier(s)}${q}`);
        code += `\n//# sourceURL=nebula://${filePath}`;
        const blobUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        moduleUrlMap[filePath] = blobUrl;
        processing.delete(filePath);
        processed.add(filePath);
        return blobUrl;
    }

    files.forEach(f => {
        if (!f.name.endsWith('.js')) return;
        if (isModule(f)) {
            processModule(f.name);
        } else {
            const code = (f.content || '') + `\n//# sourceURL=nebula://${f.name}`;
            moduleUrlMap[f.name] = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
            processed.add(f.name);
        }
    });

    const index = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
    if (!index) return null;

    let html = injectImportMap(index.content || '', files);

    html = html.replace(/(<link\b[^>]*?\bhref\s*=\s*)(['"])([^"']+)\2([^>]*>)/g, (match, pre, q, path, post) => {
        if (/^(https?:|\/\/|data:|blob:)/.test(path)) return match;
        const abs = resolvePath('index.html', path);
        return urlMap[abs] ? `${pre}${q}${urlMap[abs]}${q}${post}` : match;
    });

    html = html.replace(/<script(\b[^>]*)>/g, (match, attrs) => {
        const typeMatch  = attrs.match(/\btype\s*=\s*['"]([^'"]+)['"]/i);
        const scriptType = typeMatch ? typeMatch[1].toLowerCase() : '';
        if (scriptType && !['module','text/javascript','application/javascript'].includes(scriptType)) return match;
        const srcMatch = attrs.match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i);
        if (!srcMatch) return match;
        const src = srcMatch[1];
        if (/^(https?:|\/\/|blob:|data:)/.test(src)) return match;
        const abs     = resolvePath('index.html', src);
        const blobUrl = moduleUrlMap[abs];
        if (!blobUrl) return match;
        const f = fileMap[abs];
        let newAttrs = attrs.replace(/\bsrc\s*=\s*['"][^'"]*['"]/i, '').replace(/\btype\s*=\s*['"][^'"]*['"]/i, '').trim();
        const finalType = isModule(f) ? 'module' : (scriptType || 'text/javascript');
        return `<script type="${finalType}"${newAttrs ? ' ' + newAttrs : ''} src="${blobUrl}">`;
    });

    html = html.replace(/(<(?:img|audio|video|source)\b[^>]*?\bsrc\s*=\s*)(['"])([^"']+)\2/g, (match, pre, q, path) => {
        if (/^(https?:|\/\/|data:|blob:)/.test(path)) return match;
        const abs = resolvePath('index.html', path);
        return urlMap[abs] ? `${pre}${q}${urlMap[abs]}${q}` : match;
    });

    let injections = CONSOLE_BRIDGE;

    const referencedStyles = new Set();
    (index.content || '').replace(/href\s*=\s*['"]([^'"]+)['"]/g, (_, h) => referencedStyles.add(resolvePath('index.html', h)));
    files.forEach(f => {
        if (!f.name.endsWith('.css') || referencedStyles.has(f.name)) return;
        const cssContent = f.content.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (m, p) => {
            const abs = resolvePath(f.name, p);
            return urlMap[abs] ? `url('${urlMap[abs]}')` : m;
        });
        injections += `<style>/* ${f.name} */\n${cssContent}</style>`;
    });

    const importedModules = new Set();
    files.filter(f => f.name.endsWith('.js')).forEach(f => {
        const content = f.content || '';
        let m;
        const fromRe = /\bfrom\s*['"](\.\.?\/[^'"]+)['"]/g;
        const sideRe = /\bimport\s*['"](\.\.?\/[^'"]+)['"]/g;
        while ((m = fromRe.exec(content)) !== null) importedModules.add(resolvePath(f.name, m[1]));
        while ((m = sideRe.exec(content)) !== null) importedModules.add(resolvePath(f.name, m[1]));
    });

    const referencedScripts = new Set();
    (index.content || '').replace(/<script[^>]+src\s*=\s*['"]([^'"]+)['"]/g, (_, s) => referencedScripts.add(resolvePath('index.html', s)));

    files.forEach(f => {
        if (!f.name.endsWith('.js')) return;
        if (referencedScripts.has(f.name) || importedModules.has(f.name)) return;
        const blobUrl = moduleUrlMap[f.name];
        if (!blobUrl) return;
        injections += `<script${isModule(f) ? ' type="module"' : ''} src="${blobUrl}"><\/script>`;
    });

    html = html.includes('</body>')
        ? html.replace('</body>', injections + '\n</body>')
        : html + injections;

    return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════
export async function runProject() {
    dom.console.innerHTML = '';
    await saveCurrentProject();

    const files = state.currentProject.files;

    // Run pre-flight checks (auto-detect strategy + missing file warnings)
    preRunChecks(files);

    let previewUrl = null;

    // Strategy 0 — Node.js server (best: real HTTP URLs, native relative imports)
    if (await isServerRunnerAvailable()) {
        logToConsole('info', '▶ Running via server (full ES module support)…');
        previewUrl = await buildWithServer(files);
        if (!previewUrl) logToConsole('warn', 'Server build failed — trying Service Worker…');
    }

    // Strategy 1 — Service Worker
    if (!previewUrl && isSwAvailable()) {
        logToConsole('info', '▶ Running via Service Worker…');
        previewUrl = await buildWithSW(files);
        if (!previewUrl) logToConsole('warn', 'SW build failed — falling back to blob runner.');
    }

    // Strategy 2 — Blob bundler (last resort)
    if (!previewUrl) {
        logToConsole('info', '▶ Running via blob bundler…');
        previewUrl = buildProjectHtml(files);
    }

    if (!previewUrl) {
        logToConsole('error', 'No HTML entry point found.');
        return;
    }

    dom.previewFrame.src = previewUrl;
    dom.previewPanel.style.width = '45%';
    if (state.monacoEditorInstance) state.monacoEditorInstance.layout();

    setTimeout(() => {
        try {
            html2canvas(dom.previewFrame.contentWindow.document.body, { width: 600, height: 400, scale: 0.5 })
                .then(c => {
                    state.currentProject.thumbnail = c.toDataURL('image/jpeg', 0.5);
                    import('./db.js').then(m => m.dbPut(state.currentProject));
                });
        } catch (e) { /* ignore */ }
    }, 1500);
}

export async function runProjectInTab(id) {
    const { dbGet } = await import('./db.js');
    const project   = await dbGet(id);
    if (!project) return alert('Project not found.');

    // Also run checks for tab runs (logs go to console before new tab opens)
    preRunChecks(project.files);

    let previewUrl = null;
    if (await isServerRunnerAvailable()) previewUrl = await buildWithServer(project.files);
    if (!previewUrl && isSwAvailable())  previewUrl = await buildWithSW(project.files);
    if (!previewUrl)                     previewUrl = buildProjectHtml(project.files);
    if (!previewUrl)                     return alert('No HTML entry point found in this project.');

    window.open(previewUrl, '_blank');
}
