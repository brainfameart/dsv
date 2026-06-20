// js/ui.js — Generic UI helpers (loader, modals, status bar, dirty flag)

import { dom, state } from './state.js';

export function setStatus(msg, timeout = 0) {
    dom.statusMsg.innerText = msg;
    if (timeout > 0) setTimeout(() => dom.statusMsg.innerText = 'Ready', timeout);
}

export function showLoader(msg) {
    document.getElementById('loader-msg').innerText = msg;
    document.getElementById('loader').style.display = 'flex';
}

export function hideLoader() {
    document.getElementById('loader').style.display = 'none';
}

export function toggleModal(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'flex' ? 'none' : 'flex';
}

export function setDirty(s) {
    if (!state.currentProject) return;
    state.hasUnsavedChanges = s;
    dom.unsavedBadge.style.display = s ? 'inline-block' : 'none';
    dom.btnSave.classList.toggle('bg-theme',    s);
    dom.btnSave.classList.toggle('text-white',  s);
    dom.btnSave.classList.toggle('bg-zinc-800', !s);
}

export function logToConsole(type, msg, file = '', line = '') {
    const d   = document.createElement('div');
    d.className = `log-entry ${type === 'error' ? 'log-error' : (type === 'warn' ? 'log-warn' : 'log-info')}`;

    const time = document.createElement('span');
    time.className = 'opacity-50';
    time.textContent = `[${new Date().toLocaleTimeString()}] `;

    const text = document.createElement('span');
    text.textContent = msg;

    d.appendChild(time);
    d.appendChild(text);

    // Clickable file:line badge
    if (file) {
        const badge = document.createElement('span');
        badge.className = 'text-[10px] float-right text-zinc-400 hover:text-indigo-400 cursor-pointer underline underline-offset-2 transition-colors ml-2';
        badge.textContent = line ? `${file}:${line}` : file;
        badge.title = 'Click to open in editor';
        badge.addEventListener('click', () => {
            import('./editor.js').then(({ loadEditor }) => {
                // Find the file in the current project
                const proj = state.currentProject;
                if (!proj) return;
                const f = proj.files.find(f2 => f2.name === file || f2.name.endsWith('/' + file));
                if (!f) return;
                state.activeFileName = f.name;
                loadEditor();
                // Jump to line after Monaco loads
                requestAnimationFrame(() => {
                    const ed = state.monacoEditorInstance;
                    if (!ed || !line) return;
                    const ln = parseInt(line, 10);
                    if (!isNaN(ln)) {
                        ed.revealLineInCenter(ln);
                        ed.setPosition({ lineNumber: ln, column: 1 });
                        ed.focus();
                    }
                });
            });
        });
        d.insertBefore(badge, time);
    }

    dom.console.appendChild(d);
    dom.console.scrollTop = dom.console.scrollHeight;
}

export function clearConsole() {
    dom.console.innerHTML = '';
}

export function togglePreview(ext) {
    if (ext && dom.previewFrame.src) window.open(dom.previewFrame.src, '_blank');
}

export function closePreview() {
    dom.previewPanel.style.width = '0%';
    if (state.monacoEditorInstance) state.monacoEditorInstance.layout();
}

export function updateProjectStats() {
    dom.projectSizeMB.innerText = state.currentProject
        ? `${(new Blob([JSON.stringify(state.currentProject)]).size / 1024 / 1024).toFixed(2)} MB`
        : '0.00 MB';
}
