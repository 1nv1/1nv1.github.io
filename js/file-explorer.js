/**
 * File Explorer — Thunar-like GUI
 * Simulates browsing a virtual filesystem with image preview.
 * Standalone draggable window — works alongside bash console.
 * For Nelson Lombardo's portfolio site.
 */
(function () {
    'use strict';

    // ─────────────────────────────────────────────
    //  CONFIG: Define your virtual filesystem here
    // ─────────────────────────────────────────────
    const ROOT = {
        name: '/',
        type: 'dir',
        children: [
            {
                name: 'home',
                type: 'dir',
                children: [
                    {
                        name: 'nelson',
                        type: 'dir',
                        children: [
                            {
                                name: 'Pictures',
                                type: 'dir',
                                children: [
                                    {
                                        name: 'profile.jpg',
                                        type: 'image',
                                        realPath: 'img/me/profile.jpg',
                                        size: 245760,
                                        modified: '2025-01-15 14:32'
                                    },
                                    {
                                        name: 'thumb.jpg',
                                        type: 'image',
                                        realPath: 'img/me/thumb.jpg',
                                        size: 65536,
                                        modified: '2025-01-15 14:30'
                                    }
                                ]
                            },
                            {
                                name: 'Documents',
                                type: 'dir',
                                children: [
                                    {
                                        name: 'about.txt',
                                        type: 'file',
                                        size: 2048,
                                        modified: '2025-03-10 09:15'
                                    },
                                    {
                                        name: 'README.md',
                                        type: 'markdown',
                                        realPath: 'README.md',
                                        size: 1024,
                                        modified: '2025-02-28 11:00'
                                    }
                                ]
                            },
                            {
                                name: 'Projects',
                                type: 'dir',
                                children: [
                                    {
                                        name: 'cfd',
                                        type: 'dir',
                                        children: [
                                            {
                                                name: 'scalarTransport',
                                                type: 'dir',
                                                children: [
                                                    {
                                                        name: 'math.png',
                                                        type: 'image',
                                                        realPath: 'img/cfd/xcalibre/scalarTransport/math.png',
                                                        size: 131072,
                                                        modified: '2025-01-20 16:45'
                                                    }
                                                ]
                                            },
                                            {
                                                name: 'xcalibre',
                                                type: 'dir',
                                                children: []
                                            }
                                        ]
                                    },
                                    {
                                        name: 'portfolio',
                                        type: 'dir',
                                        children: []
                                    }
                                ]
                            },
                            {
                                name: 'Desktop',
                                type: 'dir',
                                children: [
                                    {
                                        name: 'linkedin.png',
                                        type: 'image',
                                        realPath: 'img/icons/linkedin.png',
                                        size: 8192,
                                        modified: '2025-01-10 10:00'
                                    }
                                ]
                            },
                            {
                                name: 'Tips',
                                type: 'dir',
                                children: [
                                    {
                                        name: 'linux',
                                        type: 'dir',
                                        children: [
                                            {
                                                name: 'xfce',
                                                type: 'dir',
                                                children: [
                                                    {
                                                        name: 'bt_sound_issues.md',
                                                        type: 'markdown',
                                                        realPath: 'tips/linux/xfce/bt_sound_issues.md',
                                                        size: 256,
                                                        modified: '2025-04-01 18:00'
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                name: 'etc',
                type: 'dir',
                children: [
                    { name: 'hostname', type: 'file', size: 32, modified: '2025-01-01 00:00' },
                    { name: 'resolv.conf', type: 'file', size: 128, modified: '2025-01-01 00:00' }
                ]
            },
            {
                name: 'usr',
                type: 'dir',
                children: [
                    {
                        name: 'share',
                        type: 'dir',
                        children: [
                            { name: 'backgrounds', type: 'dir', children: [] }
                        ]
                    }
                ]
            },
            {
                name: 'var',
                type: 'dir',
                children: [
                    { name: 'log', type: 'dir', children: [] }
                ]
            }
        ]
    };

    // ─────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────
    let currentDir = ROOT;
    let currentPath = '/';
    let historyStack = ['/'];
    let historyIndex = 0;
    let fileExplorerEl = null;
    let isOpen = false;

    // ─────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────
    function getNodeByPath(path) {
        if (path === '/') return ROOT;
        const parts = path.split('/').filter(Boolean);
        let node = ROOT;
        for (const part of parts) {
            if (!node.children) return null;
            node = node.children.find(c => c.name === part);
            if (!node) return null;
        }
        return node;
    }

    function getParentPath(path) {
        if (path === '/') return null;
        const parts = path.split('/').filter(Boolean);
        parts.pop();
        return parts.length === 0 ? '/' : '/' + parts.join('/');
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
        return size + ' ' + units[i];
    }

    // ── Cookie helpers (same cookie approach as bash-console.js) ──
    function getCookie(name) {
        const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return match ? decodeURIComponent(match[2]) : null;
    }

    function setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
        document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + date.toUTCString() + '; path=/';
    }

    // ── Open-state cookie ──
    const OPEN_COOKIE = 'fileExplorerOpen';

    function saveOpenState(open) {
        setCookie(OPEN_COOKIE, open ? '1' : '0');
    }

    function wasOpenBefore() {
        return getCookie(OPEN_COOKIE) === '1';
    }

    function mimeType(node) {
        if (node.type === 'dir') return 'Directory';
        if (node.type === 'image') return 'Image';
        if (node.type === 'markdown') return 'Markdown';
        const ext = node.name.split('.').pop().toLowerCase();
        const types = {
            'txt': 'Plain Text', 'md': 'Markdown', 'html': 'HTML',
            'css': 'Stylesheet', 'js': 'JavaScript', 'png': 'PNG Image',
            'jpg': 'JPEG Image', 'jpeg': 'JPEG Image', 'gif': 'GIF Image',
            'svg': 'SVG Image', 'ico': 'Icon', 'conf': 'Config File',
        };
        return types[ext] || 'Unknown';
    }

    function fileIcon(node) {
        if (node.type === 'dir') return '📁';
        if (node.type === 'image') return '🖼️';
        if (node.type === 'markdown') return '📝';
        const ext = node.name.split('.').pop().toLowerCase();
        const icons = { 'txt': '📄', 'md': '📝', 'html': '🌐', 'css': '🎨', 'js': '⚡', 'conf': '⚙️' };
        return icons[ext] || '📄';
    }

    // ─────────────────────────────────────────────
    //  RENDER
    // ─────────────────────────────────────────────
    function renderFileList(dirNode) {
        const listEl = fileExplorerEl.querySelector('.fe-file-list .fe-files-container');
        const statusLeft = fileExplorerEl.querySelector('.fe-statusbar-left');
        const statusRight = fileExplorerEl.querySelector('.fe-statusbar-right');
        const pathBar = fileExplorerEl.querySelector('.fe-path-bar');

        // Update path bar
        pathBar.innerHTML = '';
        if (currentPath === '/') {
            const span = document.createElement('span');
            span.textContent = '/';
            pathBar.appendChild(span);
        } else {
            const parts = currentPath.split('/').filter(Boolean);
            for (const part of parts) {
                const seg = document.createElement('span');
                seg.className = 'fe-path-current';
                seg.textContent = part;
                pathBar.appendChild(seg);
                const sep = document.createElement('span');
                sep.className = 'fe-path-sep';
                sep.textContent = '  /  ';
                pathBar.appendChild(sep);
            }
            if (pathBar.lastChild && pathBar.lastChild.className === 'fe-path-sep') {
                pathBar.removeChild(pathBar.lastChild);
            }
        }

        // Update sidebar active item
        document.querySelectorAll('.fe-sidebar-item').forEach(el => {
            const p = el.dataset.path;
            el.classList.toggle('active', p === currentPath);
        });

        // Clear list
        listEl.innerHTML = '';

        if (!dirNode || !dirNode.children || dirNode.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'fe-empty';
            empty.innerHTML = '<div class="icon">📂</div><div>This folder is empty</div>';
            listEl.appendChild(empty);
            statusLeft.textContent = '0 items';
            statusRight.textContent = '';
            return;
        }

        // Sort: directories first, then alphabetically
        const sorted = [...dirNode.children].sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name);
        });

        for (const child of sorted) {
            const row = document.createElement('div');
            row.className = 'fe-file-item';
            row.dataset.name = child.name;

            const iconCell = document.createElement('span');
            iconCell.className = 'icon';
            iconCell.textContent = fileIcon(child);
            row.appendChild(iconCell);

            const nameCell = document.createElement('span');
            nameCell.className = 'col-name';
            if (child.type === 'dir') nameCell.classList.add('dir');
            else if (child.type === 'image') nameCell.classList.add('image');
            else nameCell.classList.add('file');
            nameCell.textContent = child.name;
            row.appendChild(nameCell);

            const sizeCell = document.createElement('span');
            sizeCell.className = 'col-size';
            sizeCell.textContent = child.type === 'dir' ? '—' : formatSize(child.size || 0);
            row.appendChild(sizeCell);

            const typeCell = document.createElement('span');
            typeCell.className = 'col-type';
            typeCell.textContent = mimeType(child);
            row.appendChild(typeCell);

            const modCell = document.createElement('span');
            modCell.className = 'col-modified';
            modCell.textContent = child.modified || '—';
            row.appendChild(modCell);

            row.addEventListener('dblclick', function (e) {
                e.stopPropagation();
                if (child.type === 'dir') {
                    navigateTo(currentPath === '/' ? '/' + child.name : currentPath + '/' + child.name);
                } else if (child.type === 'image') {
                    openImagePreview(child);
                } else if (child.type === 'markdown') {
                    // Open in Markdown Viewer
                    if (window.MarkdownViewer) {
                        window.MarkdownViewer.open(child.name, child.realPath);
                    } else {
                        console.warn('MarkdownViewer not available');
                    }
                }
            });

            row.addEventListener('click', function (e) {
                listEl.querySelectorAll('.fe-file-item.selected').forEach(el => el.classList.remove('selected'));
                this.classList.add('selected');
                bringToFront();
            });

            listEl.appendChild(row);
        }

        const dirCount = sorted.filter(c => c.type === 'dir').length;
        const fileCount = sorted.filter(c => c.type !== 'dir').length;
        let statusText = '';
        if (dirCount > 0) statusText += dirCount + ' director' + (dirCount === 1 ? 'y' : 'ies');
        if (dirCount > 0 && fileCount > 0) statusText += ', ';
        if (fileCount > 0) statusText += fileCount + ' file' + (fileCount === 1 ? '' : 's');
        if (!statusText) statusText = '0 items';
        statusLeft.textContent = statusText;
        statusRight.textContent = currentPath;
    }

    function navigateTo(path) {
        const node = getNodeByPath(path);
        if (!node || node.type !== 'dir') return;
        currentDir = node;
        currentPath = path;
        if (historyIndex < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }
        historyStack.push(path);
        historyIndex = historyStack.length - 1;
        renderFileList(node);
        updateNavButtons();
    }

    function navigateBack() {
        if (historyIndex > 0) {
            historyIndex--;
            const path = historyStack[historyIndex];
            currentDir = getNodeByPath(path);
            currentPath = path;
            renderFileList(currentDir);
            updateNavButtons();
        }
    }

    function navigateForward() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            const path = historyStack[historyIndex];
            currentDir = getNodeByPath(path);
            currentPath = path;
            renderFileList(currentDir);
            updateNavButtons();
        }
    }

    function navigateUp() {
        const parent = getParentPath(currentPath);
        if (parent !== null) navigateTo(parent);
    }

    function navigateHome() {
        navigateTo('/home/nelson');
    }

    function updateNavButtons() {
        const backBtn = fileExplorerEl.querySelector('.fe-btn-back');
        const fwdBtn = fileExplorerEl.querySelector('.fe-btn-forward');
        const upBtn = fileExplorerEl.querySelector('.fe-btn-up');
        if (backBtn) backBtn.style.opacity = historyIndex > 0 ? '1' : '0.3';
        if (fwdBtn) fwdBtn.style.opacity = historyIndex < historyStack.length - 1 ? '1' : '0.3';
        if (upBtn) upBtn.style.opacity = currentPath !== '/' ? '1' : '0.3';
    }

    // ─────────────────────────────────────────────
    //  Z-INDEX MANAGEMENT (shared global counter)
    //  Both windows use window.__topZ so the last-clicked
    //  window always has the highest z-index.
    // ─────────────────────────────────────────────
    if (typeof window.__topZ === 'undefined') {
        window.__topZ = 2000;
    }

    function bringToFront() {
        window.__topZ++;
        fileExplorerEl.style.zIndex = window.__topZ;
        fileExplorerEl.classList.add('active-window');
    }

    // ─────────────────────────────────────────────
    //  IMAGE PREVIEW
    // ─────────────────────────────────────────────
    function openImagePreview(node) {
        const existing = document.querySelector('.fe-image-preview');
        if (existing) existing.remove();

        const preview = document.createElement('div');
        preview.className = 'fe-image-preview';

        const img = document.createElement('img');
        img.src = node.realPath;
        img.alt = node.name;

        const closeBtn = document.createElement('div');
        closeBtn.className = 'close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => preview.remove());

        const info = document.createElement('div');
        info.className = 'img-info';
        info.textContent = node.name + ' — ' + formatSize(node.size || 0);

        preview.appendChild(img);
        preview.appendChild(closeBtn);
        preview.appendChild(info);

        preview.addEventListener('click', function (e) {
            if (e.target === this) this.remove();
        });

        const escHandler = function (e) {
            if (e.key === 'Escape') {
                preview.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(preview);
        requestAnimationFrame(() => preview.classList.add('open'));
    }

    // ─────────────────────────────────────────────
    //  BUILD THE EXPLORER DOM
    // ─────────────────────────────────────────────
    function buildExplorer() {
        const win = document.createElement('div');
        win.className = 'file-explorer';
        win.id = 'fileExplorerWindow';

        // --- Title bar ---
        const titleBar = document.createElement('div');
        titleBar.className = 'fe-title-bar';

        const titleBtns = document.createElement('div');
        titleBtns.className = 'fe-title-buttons';
        ['close', 'minimize', 'maximize'].forEach(cls => {
            const btn = document.createElement('div');
            btn.className = 'fe-title-btn ' + cls;
            if (cls === 'close') btn.addEventListener('click', closeExplorer);
            if (cls === 'minimize') btn.addEventListener('click', minimizeExplorer);
            titleBtns.appendChild(btn);
        });

        const titleText = document.createElement('div');
        titleText.className = 'fe-title-text';
        titleText.textContent = '❯ File Explorer — nelson@portfolio';

        titleBar.appendChild(titleBtns);
        titleBar.appendChild(titleText);

        // --- Toolbar ---
        const toolbar = document.createElement('div');
        toolbar.className = 'fe-toolbar';

        const backBtn = document.createElement('button');
        backBtn.className = 'fe-toolbar-btn fe-btn-back';
        backBtn.innerHTML = '◀';
        backBtn.title = 'Back';
        backBtn.addEventListener('click', navigateBack);

        const fwdBtn = document.createElement('button');
        fwdBtn.className = 'fe-toolbar-btn fe-btn-forward';
        fwdBtn.innerHTML = '▶';
        fwdBtn.title = 'Forward';
        fwdBtn.addEventListener('click', navigateForward);

        const upBtn = document.createElement('button');
        upBtn.className = 'fe-toolbar-btn fe-btn-up';
        upBtn.innerHTML = '⬆';
        upBtn.title = 'Parent Directory';
        upBtn.addEventListener('click', navigateUp);

        const homeBtn = document.createElement('button');
        homeBtn.className = 'fe-toolbar-btn fe-btn-home';
        homeBtn.innerHTML = '🏠';
        homeBtn.title = 'Home';
        homeBtn.addEventListener('click', navigateHome);

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'fe-toolbar-btn fe-btn-refresh';
        refreshBtn.innerHTML = '⟳';
        refreshBtn.title = 'Refresh';
        refreshBtn.addEventListener('click', () => renderFileList(currentDir));

        toolbar.appendChild(backBtn);
        toolbar.appendChild(fwdBtn);
        toolbar.appendChild(upBtn);

        const sep1 = document.createElement('div');
        sep1.className = 'fe-toolbar-separator';
        toolbar.appendChild(sep1);
        toolbar.appendChild(homeBtn);

        const sep2 = document.createElement('div');
        sep2.className = 'fe-toolbar-separator';
        toolbar.appendChild(sep2);
        toolbar.appendChild(refreshBtn);

        const pathBar = document.createElement('div');
        pathBar.className = 'fe-path-bar';
        toolbar.appendChild(pathBar);

        // --- Content area ---
        const content = document.createElement('div');
        content.className = 'fe-content';

        const sidebar = document.createElement('div');
        sidebar.className = 'fe-sidebar';

        const shortcutData = [
            { label: 'Home', path: '/home/nelson', icon: '🏠' },
            { label: 'Desktop', path: '/home/nelson/Desktop', icon: '🖥️' },
            { label: 'Pictures', path: '/home/nelson/Pictures', icon: '🖼️' },
            { label: 'Documents', path: '/home/nelson/Documents', icon: '📄' },
            { label: 'Projects', path: '/home/nelson/Projects', icon: '📁' },
            { label: 'File System', path: '/', icon: '💻' },
        ];

        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'fe-sidebar-section';
        sectionLabel.textContent = 'Places';
        sidebar.appendChild(sectionLabel);

        for (const item of shortcutData) {
            const el = document.createElement('div');
            el.className = 'fe-sidebar-item';
            el.dataset.path = item.path;
            el.innerHTML = '<span class="icon">' + item.icon + '</span>' + item.label;
            el.addEventListener('click', () => { navigateTo(item.path); bringToFront(); });
            sidebar.appendChild(el);
        }

        const fileList = document.createElement('div');
        fileList.className = 'fe-file-list';

        const header = document.createElement('div');
        header.className = 'fe-file-header';
        header.innerHTML = `
            <span class="col-name">Name</span>
            <span class="col-size">Size</span>
            <span class="col-type">Type</span>
            <span class="col-modified">Modified</span>
        `;
        fileList.appendChild(header);

        const filesContainer = document.createElement('div');
        filesContainer.className = 'fe-files-container';
        fileList.appendChild(filesContainer);

        content.appendChild(sidebar);
        content.appendChild(fileList);

        // --- Status bar ---
        const statusBar = document.createElement('div');
        statusBar.className = 'fe-statusbar';
        statusBar.innerHTML = `
            <span class="fe-statusbar-left"></span>
            <span class="fe-statusbar-right"></span>
        `;

        // Assemble
        win.appendChild(titleBar);
        win.appendChild(toolbar);
        win.appendChild(content);
        win.appendChild(statusBar);

        document.body.appendChild(win);

        fileExplorerEl = win;

        // Make draggable
        makeDraggable(win, titleBar);

        // Click on title bar brings to front
        titleBar.addEventListener('mousedown', bringToFront);

        // Click on any part of the window brings to front
        win.addEventListener('mousedown', bringToFront);

        // Restore saved position, else default (left side, top area)
        // Use CSS-declared dimensions for clamping (820x540), since the
        // element is still hidden (display: none) so offsetWidth is 0.
        const saved = getCookie('fileExplorerPos');
        const feW = 820;
        const feH = 540;
        if (saved) {
            const parts = saved.split(',');
            const savedX = parseInt(parts[0], 10);
            const savedY = parseInt(parts[1], 10);
            const clampedX = Math.max(0, Math.min(savedX, window.innerWidth - feW));
            const clampedY = Math.max(0, Math.min(savedY, window.innerHeight - feH));
            win.style.left = clampedX + 'px';
            win.style.top = clampedY + 'px';
        } else {
            win.style.left = '40px';
            win.style.top = '20px';
            // Seed the cookie with the default position
            setCookie('fileExplorerPos', '40,20');
        }

        // Render
        navigateTo('/home/nelson');
    }
    // ─────────────────────────────────────────────
    //  DRAG
    // ─────────────────────────────────────────────
    function makeDraggable(win, handle) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        handle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.classList.contains('fe-title-btn')) return;
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

            // Save position to cookie (same pattern as bash-console.js)
            const left = parseInt(win.style.left, 10);
            const top = parseInt(win.style.top, 10);
            if (!isNaN(left) && !isNaN(top)) {
                setCookie('fileExplorerPos', left + ',' + top);
            }
        }
    }

    // ─────────────────────────────────────────────
    //  OPEN / CLOSE / MINIMIZE
    // ─────────────────────────────────────────────
    function openExplorer() {
        if (!fileExplorerEl) buildExplorer();
        fileExplorerEl.style.display = 'flex';
        fileExplorerEl.classList.add('open');
        isOpen = true;
        saveOpenState(true);
        bringToFront();
        if (currentDir) renderFileList(currentDir);
        updateNavButtons();
    }

    function closeExplorer() {
        if (fileExplorerEl) {
            fileExplorerEl.style.display = 'none';
            fileExplorerEl.classList.remove('open');
            isOpen = false;
            saveOpenState(false);
        }
    }

    function minimizeExplorer() {
        closeExplorer();
    }

    // ─────────────────────────────────────────────
    //  PUBLIC API
    // ─────────────────────────────────────────────
    window.FileExplorer = {
        open: openExplorer,
        close: closeExplorer,
        toggle: function () {
            if (isOpen) closeExplorer();
            else openExplorer();
        }
    };

    // ─────────────────────────────────────────────
    //  HOOK DESKTOP ICONS & TASKBAR
    //  + AUTO-OPEN on page load if it was open before
    // ─────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        // Hook "File Explorer" desktop icon
        const desktopIcons = document.querySelectorAll('.desktop-icon');
        for (const icon of desktopIcons) {
            const label = icon.querySelector('.label');
            if (label && label.textContent.trim() === 'File Explorer') {
                icon.style.cursor = 'pointer';
                icon.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    FileExplorer.toggle();
                });
                break;
            }
        }

        // Hook 📂 taskbar icon
        const taskbarItems = document.querySelectorAll('.taskbar-item');
        for (const item of taskbarItems) {
            if (item.textContent.trim() === '📂') {
                item.style.cursor = 'pointer';
                item.addEventListener('click', function (e) {
                    e.stopPropagation();
                    FileExplorer.toggle();
                });
                break;
            }
        }

        // Auto-open if it was open before page refresh
        if (wasOpenBefore()) {
            FileExplorer.open();
        }
    });

})();

