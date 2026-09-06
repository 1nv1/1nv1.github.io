#!/usr/bin/env node
/**
 * scan-documents.js
 *
 * Scans the physical `documents/` folder at the project ROOT and regenerates
 * the `DOCUMENTS_MANIFEST` array inside `js/file-explorer.js` so the
 * explorer's virtual `/documents` folder always mirrors what is actually
 * uploaded.
 *
 * Usage (from the project root):
 *     node scripts/scan-documents.js
 *
 * After running it, review the diff and commit both `documents/*` and the
 * updated `js/file-explorer.js`.
 *
 * NOTE: size / modified columns are computed automatically from the file.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'documents');
const EXPLORER_FILE = path.join(PROJECT_ROOT, 'js', 'file-explorer.js');

// Match the manifest marker and closing.
const OPEN_MARK = 'const DOCUMENTS_MANIFEST = [';
const CLOSE_MARK = '];';

function pad(n) { return String(n).padStart(2, '0'); }

function formatModified(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatSize(bytes) {
    // Keep the same unit style used elsewhere in the app.
    return bytes;
}

function buildManifest() {
    if (!fs.existsSync(DOCS_DIR)) {
        console.error('documents/ folder not found at project root.');
        return [];
    }
    const entries = [];
    const names = fs.readdirSync(DOCS_DIR).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
        const full = path.join(DOCS_DIR, name);
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;              // skip subfolders
        if (name === '.gitignore') continue;       // never surface housekeeping files
        entries.push({
            name: name,
            size: stat.size,
            modified: formatModified(stat.mtime)
        });
    }
    return entries;
}

function replaceManifest(newEntries) {
    let src = fs.readFileSync(EXPLORER_FILE, 'utf8');
    const startIdx = src.indexOf(OPEN_MARK);
    if (startIdx === -1) {
        console.error('Could not find "' + OPEN_MARK + '" in ' + EXPLORER_FILE + '.');
        process.exit(1);
    }
    const from = startIdx + OPEN_MARK.length;
    const endIdx = src.indexOf(CLOSE_MARK, from);
    if (endIdx === -1) {
        console.error('Could not find the closing "' + CLOSE_MARK + '".');
        process.exit(1);
    }

    // Build nicely indented entries (8-space indent, matching the file).
    let body = '';
    if (newEntries.length === 0) {
        body = '\n        // (empty — no files found in documents/)\n    ' + CLOSE_MARK;
    } else {
        const lines = newEntries.map(function (e) {
            const nm = e.name.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
            return "        { name: '" + nm + "', size: " + e.size +
                ", modified: '" + e.modified + "' }";
        });
        body = '\n' + lines.join(',\n') + '\n    ' + CLOSE_MARK;
    }

    const newSrc = src.slice(0, from) + body + src.slice(endIdx + CLOSE_MARK.length);

    fs.writeFileSync(EXPLORER_FILE, newSrc, 'utf8');
    return newSrc;
}

const entries = buildManifest();

// Report what changed for a friendly diff preview later.
const oldSrc = fs.readFileSync(EXPLORER_FILE, 'utf8');
const newSrc = replaceManifest(entries);

console.log('Scanned ' + DOCS_DIR + ' -> ' + entries.length + ' file(s).\n');
entries.forEach(function (e) {
    console.log('  • ' + e.name + '  (' + e.size + ' bytes)');
});
console.log('\nUpdated ' + EXPLORER_FILE + '. The virtual /documents folder in the explorer\nnow lists the above file(s). Commit the new scan together with your files.');

