/**
 * Markdown Viewer — Draggable Window
 * Renders .md files as HTML using the `marked` library (loaded from CDN).
 * Can be opened programmatically or via the file explorer.
 */
(function () {
    'use strict';

    let viewerEl = null;
    let isOpen = false;

    // ── Cookie helpers ──
    function getCookie(name) {
        const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return match ? decodeURIComponent(match[2]) : null;
    }

    function setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
        document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + date.toUTCString() + '; path=/';
    }

    // ── Z-index management (shared global counter) ──
    if (typeof window.__topZ === 'undefined') {
        window.__topZ = 2000;
    }

    function bringToFront() {
        window.__topZ++;
        viewerEl.style.zIndex = window.__topZ;
    }

    // ── Build the viewer DOM ──
    function buildViewer() {
        const win = document.createElement('div');
        win.className = 'markdown-viewer';
        win.id = 'markdownViewerWindow';

        // --- Title bar ---
        const titleBar = document.createElement('div');
        titleBar.className = 'md-title-bar';

        const titleBtns = document.createElement('div');
        titleBtns.className = 'md-title-buttons';
        ['close', 'minimize'].forEach(cls => {
            const btn = document.createElement('div');
            btn.className = 'md-title-btn ' + cls;
            if (cls === 'close') btn.addEventListener('click', closeViewer);
            if (cls === 'minimize') btn.addEventListener('click', minimizeViewer);
            titleBtns.appendChild(btn);
        });

        const titleText = document.createElement('div');
        titleText.className = 'md-title-text';
        titleText.textContent = '❯ Markdown Viewer';

        titleBar.appendChild(titleBtns);
        titleBar.appendChild(titleText);

        // --- Toolbar ---
        const toolbar = document.createElement('div');
        toolbar.className = 'md-toolbar';

        const pathBar = document.createElement('div');
        pathBar.className = 'md-path-bar';
        pathBar.innerHTML = '<span class="md-file-icon">📝</span> <span class="md-file-name">No file opened</span>';
        toolbar.appendChild(pathBar);

        // --- Content area ---
        const content = document.createElement('div');
        content.className = 'md-content';

        // Show initial loading prompt
        content.innerHTML = '<div class="md-loading"><div class="spinner"></div><span>Ready to render markdown</span></div>';

        // --- Status bar ---
        const statusBar = document.createElement('div');
        statusBar.className = 'md-statusbar';
        statusBar.innerHTML = `
            <span class="md-status-left">No file loaded</span>
            <span class="md-status-right">Markdown Viewer</span>
        `;

        // Assemble
        win.appendChild(titleBar);
        win.appendChild(toolbar);
        win.appendChild(content);
        win.appendChild(statusBar);

        document.body.appendChild(win);

        viewerEl = win;

        // Make draggable
        makeDraggable(win, titleBar);

        // Bring to front on interaction
        titleBar.addEventListener('mousedown', bringToFront);
        win.addEventListener('mousedown', bringToFront);

        // Restore saved position, else default
        const saved = getCookie('mdViewerPos');
        const mdW = 780;
        const mdH = 560;
        if (saved) {
            const parts = saved.split(',');
            const savedX = parseInt(parts[0], 10);
            const savedY = parseInt(parts[1], 10);
            const clampedX = Math.max(0, Math.min(savedX, window.innerWidth - mdW));
            const clampedY = Math.max(0, Math.min(savedY, window.innerHeight - mdH));
            win.style.left = clampedX + 'px';
            win.style.top = clampedY + 'px';
        } else {
            // Offset from the bash console (left side)
            win.style.left = '200px';
            win.style.top = '60px';
            setCookie('mdViewerPos', '200,60');
        }
    }

    // ── Draggable ──
    function makeDraggable(win, handle) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        handle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.classList.contains('md-title-btn')) return;
            isDragging = true;
            handle.style.cursor = 'grabbing';

            const rect = win.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            startX = e.clientX;
            startY = e.clientY;

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDragEnd);
            e.preventDefault();
        });

        function onDrag(e) {
            if (!isDragging) return;
            let newX = initialX + (e.clientX - startX);
            let newY = initialY + (e.clientY - startY);
            const maxX = window.innerWidth - win.offsetWidth;
            const maxY = window.innerHeight - win.offsetHeight;
            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));
            win.style.left = newX + 'px';
            win.style.top = newY + 'px';
        }

        function onDragEnd() {
            isDragging = false;
            handle.style.cursor = 'grab';
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onDragEnd);

            const left = parseInt(win.style.left, 10);
            const top = parseInt(win.style.top, 10);
            if (!isNaN(left) && !isNaN(top)) {
                setCookie('mdViewerPos', left + ',' + top);
            }
        }
    }

    // ── Open / Close ──
    function openViewer(fileName, fileUrl) {
        if (!viewerEl) buildViewer();

        viewerEl.style.display = 'flex';
        viewerEl.classList.add('open');
        isOpen = true;
        bringToFront();

        // Update path bar
        const pathBar = viewerEl.querySelector('.md-path-bar .md-file-name');
        if (pathBar) pathBar.textContent = fileName || 'No file opened';

        // Show loading state
        const content = viewerEl.querySelector('.md-content');
        const statusLeft = viewerEl.querySelector('.md-status-left');
        content.innerHTML = '<div class="md-loading"><div class="spinner"></div><span>Rendering markdown…</span></div>';
        if (statusLeft) statusLeft.textContent = 'Loading…';

        if (!fileUrl) {
            content.innerHTML = '<div class="md-error"><div class="icon">📝</div><span>No file specified</span></div>';
            if (statusLeft) statusLeft.textContent = 'No file';
            return;
        }

        // Fetch and render
        fetch(fileUrl)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                return response.text();
            })
            .then(function (markdown) {
                // Check if marked is available
                if (typeof marked === 'undefined') {
                    throw new Error('Marked library not loaded');
                }
                const html = marked.parse(markdown);
                content.innerHTML = html;
                if (statusLeft) statusLeft.textContent = 'Rendered — ' + fileName;
            })
            .catch(function (err) {
                content.innerHTML = '<div class="md-error"><div class="icon">⚠️</div><span>Error: ' + err.message + '</span></div>';
                if (statusLeft) statusLeft.textContent = 'Error loading file';
                console.error('Markdown Viewer error:', err);
            });
    }

    function closeViewer() {
        if (viewerEl) {
            viewerEl.style.display = 'none';
            viewerEl.classList.remove('open');
            isOpen = false;
        }
    }

    function minimizeViewer() {
        closeViewer();
    }

    // ── Public API ──
    window.MarkdownViewer = {
        open: openViewer,
        close: closeViewer,
        isOpen: function () { return isOpen; }
    };

})();
