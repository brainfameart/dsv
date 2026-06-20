// js/find.js — Multi-file Find & Replace panel

import { state }      from './state.js';
import { loadEditor } from './editor.js';
import { setDirty }   from './ui.js';

// ── State ──────────────────────────────────────────────────────────────────────
let _results        = [];  // [{ file, lineIndex, lineText, matchStart, matchEnd }]
let _selectedIndex  = -1;

// ── Panel toggle ───────────────────────────────────────────────────────────────
export function toggleFindPanel() {
    const panel = document.getElementById('find-panel');
    const open  = panel.classList.toggle('hidden');
    if (!open) {
        // Opened — focus input
        setTimeout(() => {
            const inp = document.getElementById('find-input');
            if (inp) { inp.focus(); inp.select(); }
        }, 50);
    }
}

// ── Build regex from current inputs ───────────────────────────────────────────
function buildRegex() {
    const raw   = document.getElementById('find-input').value;
    if (!raw) return null;
    const cs    = document.getElementById('find-case').checked;
    const re    = document.getElementById('find-regex').checked;
    const wb    = document.getElementById('find-word').checked;
    let pattern = re ? raw : raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wb) pattern = `\\b${pattern}\\b`;
    try {
        return new RegExp(pattern, cs ? 'g' : 'gi');
    } catch {
        return null;
    }
}

// ── Run search ─────────────────────────────────────────────────────────────────
export function runFind() {
    const rx      = buildRegex();
    const isRegex = document.getElementById('find-regex') && document.getElementById('find-regex').checked;
    _results       = [];
    _selectedIndex = -1;

    const countEl   = document.getElementById('find-count');
    const resultsEl = document.getElementById('find-results');
    resultsEl.innerHTML = '';

    if (!rx || !state.currentProject) {
        countEl.textContent = '';
        return;
    }

    const files = (state.currentProject.files || []).filter(f => f.type === 'file' && !f.isBinary);

    for (const file of files) {
        const lines = (file.content || '').split('\n');
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            rx.lastIndex = 0;
            let m;
            while ((m = rx.exec(line)) !== null) {
                _results.push({ file: file.name, lineIndex: li, lineText: line, matchStart: m.index, matchEnd: m.index + m[0].length });
                if (!isRegex) rx.lastIndex = m.index + 1; // avoid infinite loop on zero-width
            }
        }
    }

    countEl.textContent = _results.length ? `${_results.length} match${_results.length > 1 ? 'es' : ''}` : 'No results';

    // Render results grouped by file
    const byFile = new Map();
    for (const r of _results) {
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file).push(r);
    }

    let globalIdx = 0;
    for (const [fileName, matches] of byFile) {
        // File header
        const header = document.createElement('div');
        header.className = 'text-[10px] font-bold text-indigo-400 mt-2 mb-0.5 px-1 flex items-center gap-1';
        header.innerHTML = `<span class="opacity-60">📄</span>${fileName} <span class="text-zinc-600 font-normal">(${matches.length})</span>`;
        resultsEl.appendChild(header);

        for (const r of matches) {
            const idx  = globalIdx++;
            const row  = document.createElement('div');
            row.className = 'find-result-row flex items-start gap-2 px-2 py-1 rounded cursor-pointer hover:bg-zinc-800 text-[11px] font-mono';
            row.dataset.idx = idx;

            // Line number
            const lineNum = document.createElement('span');
            lineNum.className = 'text-zinc-600 shrink-0 select-none';
            lineNum.textContent = String(r.lineIndex + 1).padStart(4, ' ');

            // Line text with highlight
            const pre  = escHtml(r.lineText.slice(0, r.matchStart));
            const match = escHtml(r.lineText.slice(r.matchStart, r.matchEnd));
            const post = escHtml(r.lineText.slice(r.matchEnd));
            const code = document.createElement('span');
            code.className = 'text-zinc-300 truncate';
            code.innerHTML = `${pre}<mark class="bg-yellow-400/30 text-yellow-200 rounded-sm">${match}</mark>${post}`;

            row.appendChild(lineNum);
            row.appendChild(code);
            row.addEventListener('click', () => jumpToResult(idx));
            resultsEl.appendChild(row);
        }
    }
}

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Jump to result ─────────────────────────────────────────────────────────────
export function jumpToResult(idx) {
    if (idx < 0 || idx >= _results.length) return;
    _selectedIndex = idx;

    // Highlight active row
    document.querySelectorAll('.find-result-row').forEach((el, i) => {
        el.classList.toggle('bg-indigo-900/40', i === idx - getRowOffset(idx));
    });

    const r = _results[idx];

    // Switch to the file
    if (state.currentProject) {
        state.activeFileName = r.file;
        loadEditor();
    }

    // Jump to the line + highlight in Monaco
    requestAnimationFrame(() => {
        const editor = state.monacoEditorInstance;
        if (!editor) return;
        const line = r.lineIndex + 1;
        editor.revealLineInCenter(line);
        editor.setSelection({
            startLineNumber: line, startColumn: r.matchStart + 1,
            endLineNumber:   line, endColumn:   r.matchEnd + 1
        });
        editor.focus();
    });
}

// Compute visual row index offset (rows are only the match rows, headers don't count)
function getRowOffset(globalIdx) {
    // count how many file headers appear before this result
    const byFile = new Map();
    let offset = 0;
    for (let i = 0; i < _results.length; i++) {
        const file = _results[i].file;
        if (!byFile.has(file)) { byFile.set(file, true); if (i <= globalIdx) offset++; }
    }
    return offset;
}

// ── Keyboard navigation inside find input ─────────────────────────────────────
export function findKeyNav(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (_results.length === 0) return;
        _selectedIndex = (_selectedIndex + 1) % _results.length;
        jumpToResult(_selectedIndex);
    }
    if (e.key === 'Escape') {
        toggleFindPanel();
    }
}

// ── Replace selected ──────────────────────────────────────────────────────────
export function doReplaceSelected() {
    if (_selectedIndex < 0 || _selectedIndex >= _results.length) return;
    const r    = _results[_selectedIndex];
    const repl = document.getElementById('replace-input').value;
    const rx   = buildRegex();
    if (!rx) return;

    const file = state.currentProject.files.find(f => f.name === r.file);
    if (!file) return;

    const lines = file.content.split('\n');
    rx.lastIndex = 0;
    lines[r.lineIndex] = lines[r.lineIndex].replace(rx, (m, ...args) => {
        // Only replace first match on this line for "replace selected"
        if (args[args.length - 2] === r.matchStart) return repl;
        return m;
    });
    file.content = lines.join('\n');
    setDirty(true);

    // Reload editor if this file is open
    if (state.activeFileName === r.file && state.monacoEditorInstance) {
        const pos = state.monacoEditorInstance.getPosition();
        state.monacoEditorInstance.setValue(file.content);
        state.monacoEditorInstance.setPosition(pos);
    }
    runFind();
}

// ── Replace all ───────────────────────────────────────────────────────────────
export function doReplaceAll() {
    const rx   = buildRegex();
    const repl = document.getElementById('replace-input').value;
    if (!rx || !state.currentProject) return;

    let count = 0;
    const affectedFiles = new Set(_results.map(r => r.file));

    for (const fileName of affectedFiles) {
        const file = state.currentProject.files.find(f => f.name === fileName);
        if (!file) continue;
        const before = file.content;
        rx.lastIndex = 0;
        file.content = file.content.replace(rx, () => { count++; return repl; });
        if (file.content !== before) setDirty(true);
    }

    // Reload editor if affected
    if (affectedFiles.has(state.activeFileName) && state.monacoEditorInstance) {
        const file = state.currentProject.files.find(f => f.name === state.activeFileName);
        if (file) state.monacoEditorInstance.setValue(file.content);
    }

    document.getElementById('find-count').textContent = `Replaced ${count} occurrence${count !== 1 ? 's' : ''}`;
    setTimeout(runFind, 300);
}
