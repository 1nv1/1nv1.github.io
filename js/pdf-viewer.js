/**
 * PDF Viewer — simulated native document reader (Evince/Okular-like)
 * Renders real PDF files inside a draggable OS window using Mozilla PDF.js.
 *
 * Public API:
 *   window.PDFViewer.open(fileName, fileUrl)
 *   window.PDFViewer.close()
 *   window.PDFViewer.isOpen()
 *
 * Relies on the global `window.pdfjsLib` (loaded from the CDN in index.html).
 * Reuses the shared window.__topZ counter so the last-clicked window stays on top.
 */
(function () {
    'use strict';

    let viewerEl = null;
    let isOpen = false;

    let pdfLib = (typeof window !== 'undefined' && window.pdfjsLib) ? window.pdfjsLib : null;

    // ---- Current document state ----
    let pdfDoc = null;          // pdf.js document proxy
    let baseScale = 1.0;        // scale that fits a page's width inside the viewport
    let zoom = 1.0;             // user multiplier on top of baseScale (100% == fit width)
    let curPage = 1;            // 1-indexed page being shown
    let renderToken = 0;        // guards against stale async renders
    let docTitle = 'document.pdf';

    // pdf.worker must ship from the same origin to allow a true web worker.
    // It is self-hosted at libs/pdfjs/ and loaded from index.html.
    function configurePdfJs() {
        if (pdfLib && !pdfLib.GlobalWorkerOptions.workerSrc) {
            pdfLib.GlobalWorkerOptions.workerSrc = 'libs/pdfjs/pdf.worker.min.js';
        }
    }

    // ---- Cookie helpers (mirror the other OS windows) ----
    function getCookie(n) {
        const m = document.cookie.match('(^|;)\\s*' + n + '\\s*=\\s*([^;]+)');
        return m ? decodeURIComponent(m[2]) : null;
    }
    function setCookie(n, v, days) {
        const d = new Date();
        d.setTime(d.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
        document.cookie = n + '=' + encodeURIComponent(v) + '; expires=' + d.toUTCString() + '; path=/';
    }

    // ---- Shared z-index management (kept in sync with other windows) ----
    if (typeof window.__topZ === 'undefined') { window.__topZ = 2000; }
    function bringToFront() {
        window.__topZ++;
        if (viewerEl) viewerEl.style.zIndex = window.__topZ;
    }

    // ---- Tiny helpers ----
    function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
    function sep() { return el('div', 'pv-sep'); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function cssPx(points) { return points * (96 / 72); }   // pdf points -> css px

    // Inline SVG icons used in the toolbar
    const IC = {
        prev:   '<svg width="11" height="14" viewBox="0 0 10 14" fill="currentColor"><path d="M8 0L0 7l8 7V0z"/></svg>',
        next:   '<svg width="11" height="14" viewBox="0 0 10 14" fill="currentColor"><path d="M2 0l8 7-8 7V0z"/></svg>',
        zoomin: '<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="8" r="5.5"/><path d="M12 12l4 4M5.5 8h5M8 5.5v5"/></svg>',
        zoomout:'<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="8" r="5.5"/><path d="M12 12l4 4M5.5 8h5"/></svg>',
        fitw:   '<svg width="15" height="14" viewBox="0 0 18 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4v8M16 4v8M6 3h6M6 13h6"/></svg>',
        rotate: '<svg width="15" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 8a8 8 0 1 1-2.5-5.8M14.5 1.5V6H10"/></svg>'
    };

    // ------------------------------------------------------------------
    //  DOM BUILD
    // ------------------------------------------------------------------
    function buildViewer() {
        const win = el('div', 'pdf-viewer');
        win.id = 'pdfViewerWindow';

        // --- Title bar ---
        const titleBar = el('div', 'pv-title-bar');
        const tBtns = el('div', 'pv-title-buttons');
        [['close', closeViewer], ['minimize', minimizeViewer], ['maximize', fitWidth]].forEach(function (pair) {
            const b = el('div', 'pv-title-btn ' + pair[0]);
            b.addEventListener('click', pair[1]);
            tBtns.appendChild(b);
        });
        const titleText = el('div', 'pv-title-text');
        titleText.textContent = '❯ Document Viewer — nelson@portfolio';
        titleBar.appendChild(tBtns);
        titleBar.appendChild(titleText);

        // --- Toolbar ---
        const toolbar = el('div', 'pv-toolbar');
        function tbtn(innerHTML, title, fn) {
            const b = el('button', 'pv-btn');
            b.innerHTML = innerHTML;
            b.title = title;
            b.addEventListener('click', fn);
            return b;
        }
        const prevBtn = tbtn(IC.prev, 'Previous page', function () { gotoPage(curPage - 1); });
        const nextBtn = tbtn(IC.next, 'Next page', function () { gotoPage(curPage + 1); });
        const zoomOutB = tbtn(IC.zoomout, 'Zoom out', function () { setZoom(zoom - 0.15); });
        const zoomLbl = el('span', 'pv-zoom-indicator'); zoomLbl.textContent = '100%';
        const zoomInB = tbtn(IC.zoomin, 'Zoom in', function () { setZoom(zoom + 0.15); });
        const fitB = tbtn(IC.fitw, 'Fit page width', fitWidth);
        const rotB = tbtn(IC.rotate, 'Rotate page', rotatePage);

        toolbar.appendChild(prevBtn);
        toolbar.appendChild(nextBtn);
        toolbar.appendChild(sep());
        toolbar.appendChild(zoomOutB);
        toolbar.appendChild(zoomLbl);
        toolbar.appendChild(zoomInB);
        toolbar.appendChild(sep());
        toolbar.appendChild(fitB);
        toolbar.appendChild(rotB);

        const pageNav = el('div', 'pv-page-nav');
        const input = el('input', 'pv-page-input');
        input.type = 'text'; input.value = '1';
        input.title = 'Go to page (Enter)';
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { const n = parseInt(input.value, 10); if (!isNaN(n)) gotoPage(n); }
        });
        const total = el('span', 'pv-page-total'); total.textContent = '/ 0';
        pageNav.appendChild(document.createTextNode('Pg '));
        pageNav.appendChild(input);
        pageNav.appendChild(total);
        toolbar.appendChild(pageNav);

        // --- Body: thumbs + viewport ---
        const body = el('div', 'pv-body');
        const thumbs = el('div', 'pv-thumbs');
        const viewport = el('div', 'pv-viewport');
        const wrap = el('div', 'pv-pages-wrap');
        wrap.innerHTML = '<div class="pv-loading"><div class="spinner"></div><span>Ready to read documents</span></div>';
        viewport.appendChild(wrap);
        body.appendChild(thumbs);
        body.appendChild(viewport);

        // --- Status bar ---
        const st = el('div', 'pv-statusbar');
        const statusL = el('span'); statusL.className = 'pv-status-left'; statusL.textContent = 'No document loaded';
        const statusR = el('span'); statusR.className = 'pv-status-right'; statusR.textContent = 'PDF';
        st.appendChild(statusL); st.appendChild(statusR);

        win.appendChild(titleBar);
        win.appendChild(toolbar);
        win.appendChild(body);
        win.appendChild(st);
        document.body.appendChild(win);
        viewerEl = win;

        // Store element handles on the window object
        win._title = titleText;
        win._thumbs = thumbs;
        win._viewport = viewport;
        win._wrap = wrap;
        win._input = input;
        win._total = total;
        win._zoom = zoomLbl;
        win._prevBtn = prevBtn;
        win._nextBtn = nextBtn;
        win._status = statusL;
        win.__rotate = 0;

        // --- Drag ---
        makeDraggable(win, titleBar);
        titleBar.addEventListener('mousedown', bringToFront);
        win.addEventListener('mousedown', bringToFront);

        // Sync "current page" as user scrolls
        let stT = null;
        viewport.addEventListener('scroll', function () { clearTimeout(stT); stT = setTimeout(syncFromScroll, 90); });

        // Keyboard shortcuts
        document.addEventListener('keydown', keyHandler);

        // --- Position ---
        const saved = getCookie('pdfViewerPos');
        const W = 860, H = 600;
        if (saved) {
            const p = saved.split(',');
            win.style.left = clamp(parseInt(p[0], 10) || W, 0, window.innerWidth - W) + 'px';
            win.style.top = clamp(parseInt(p[1], 10) || H, 0, window.innerHeight - H) + 'px';
        } else {
            win.style.left = '470px'; win.style.top = '50px';
            setCookie('pdfViewerPos', '470,50');
        }
    }

    // Accessor helpers after window built
    function $() {
        if (!viewerEl) return {};
        return {
            title: viewerEl._title, thumbs: viewerEl._thumbs, viewport: viewerEl._viewport,
            wrap: viewerEl._wrap, input: viewerEl._input, total: viewerEl._total,
            zoom: viewerEl._zoom, prevBtn: viewerEl._prevBtn, nextBtn: viewerEl._nextBtn,
            status: viewerEl._status
        };
    }

    // ------------------------------------------------------------------
    //  KEYBOARD
    // ------------------------------------------------------------------
    function keyHandler(e) {
        if (!isOpen || !pdfDoc) return;
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { gotoPage(curPage + 1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { gotoPage(curPage - 1); e.preventDefault(); }
        else if (e.key === '+' || e.key === '=') { setZoom(zoom + 0.15); }
        else if (e.key === '-') { setZoom(zoom - 0.15); }
        else if (e.key === 'f' || e.key === 'F') { fitWidth(); }
    }

    // ------------------------------------------------------------------
    //  CLEAR / STATE
    // ------------------------------------------------------------------
    function clearView() {
        const el = $();
        if (el.wrap) el.wrap.innerHTML = '';
        if (el.thumbs) el.thumbs.innerHTML = '';
        if (el.input) el.input.value = '1';
        if (el.total) el.total.textContent = '/ 0';
        if (el.zoom) el.zoom.textContent = '100%';
    }

    function updateStatus() {
        const el = $();
        if (el.status && pdfDoc) el.status.textContent = docTitle + ' — page ' + curPage + ' of ' + pdfDoc.numPages;
    }

    // ------------------------------------------------------------------
    //  RENDER
    // ------------------------------------------------------------------
    // Fit width of page 1 to the viewport -> baseScale (zoom 100%).
    function computeBaseScale() {
        return pdfDoc.getPage(1).then(function (p1) {
            const el = $();
            const avail = Math.max(120, (el.viewport ? el.viewport.clientWidth : 700) - 90);
            const vp = p1.getViewport({ scale: 1 });
            const cssW = cssPx(vp.width);
            baseScale = clamp(avail / cssW, 0.2, 8);
            return baseScale;
        });
    }

    function renderDocument(token) {
        if (!pdfDoc) return;
        const myToken = token !== undefined ? token : ++renderToken;
        if (myToken !== renderToken) return;

        const el = $();
        if (!el.wrap) return;
        el.wrap.innerHTML = '';
        el.thumbs.innerHTML = '';
        curPage = Math.min(curPage, pdfDoc.numPages) || 1;

        const n = pdfDoc.numPages;
        if (el.total) el.total.textContent = '/ ' + n;

        // Create all page shells + thumb tiles
        for (let i = 1; i <= n; i++) {
            const shell = el1('div', 'pv-page-canvas', i);       // data-page
            el.wrap.appendChild(shell);

            const tile = el2('div', 'pv-thumb', i);              // data-page
            tile.title = 'Page ' + i;
            tile.addEventListener('click', (function (p) { return function () { gotoPage(p); }; })(i));
            el.thumbs.appendChild(tile);
        }

        drawPages(myToken);
        updateNavState();
        syncFromScroll();
    }

    // Page sizes vary; set CSS width of each shell to the effective css width.
    function drawPages(token) {
        if (token !== renderToken) return;
        const el = $();
        const shells = Array.prototype.slice.call(el.wrap.querySelectorAll('.pv-page-canvas'));
        const targetScaleCss = effectiveScale();

        const draw = async function () {
            for (const shell of shells) {
                if (token !== renderToken) return;
                const pageNum = parseInt(shell.getAttribute('data-page'), 10);
                try {
                    const page = await pdfDoc.getPage(pageNum);
                    const rotation = ((page.rotate || 0) + viewerEl.__rotate) % 360;
                    const cssW = cssPx(page.getViewport({ scale: 1, rotation }).width);
                    shell.style.width = (cssW * targetScaleCss) + 'px';

                    const vp = page.getViewport({ scale: targetScaleCss * 1.3333, rotation });
                    const cv = el2('canvas', '', pageNum);
                    cv.width = Math.max(1, Math.floor(vp.width));
                    cv.height = Math.max(1, Math.floor(vp.height));
                    shell.appendChild(cv);
                    await page.render({
                        canvasContext: cv.getContext('2d'),
                        viewport: vp
                    }).promise;
                } catch (err) {
                    if (!/destroy/i.test(String((err && err.message) || err))) console.warn('page render', err);
                }
            }
            drawThumbs(token);
        };
        draw();
    }

    async function drawThumbs(token) {
        if (token !== renderToken) return;
        const el = $();
        const tiles = Array.prototype.slice.call(el.thumbs.querySelectorAll('.pv-thumb'));
        for (const tile of tiles) {
            if (token !== renderToken) return;
            if (tile.querySelector('canvas')) continue;
            const pageNum = parseInt(tile.getAttribute('data-page'), 10);
            try {
                const page = await pdfDoc.getPage(pageNum);
                const rotation = ((page.rotate || 0) + viewerEl.__rotate) % 360;
                const vp1 = page.getViewport({ scale: 1, rotation });
                const tc = el2('canvas', '', pageNum);
                const targetW = 120;
                const ts = targetW / vp1.width;
                tc.width = Math.max(1, Math.floor(vp1.width * ts));
                tc.height = Math.max(1, Math.floor(vp1.height * ts));
                tc.style.width = '100%';
                tc.style.height = 'auto';
                tile.insertBefore(tc, tile.firstChild);
                await page.render({
                    canvasContext: tc.getContext('2d'),
                    viewport: page.getViewport({ scale: ts, rotation })
                }).promise;
            } catch (err) {
                if (!/destroy/i.test(String((err && err.message) || err))) console.warn('thumb render', err);
            }
        }
    }

    function effectiveScale() { return baseScale * zoom; }

    // create element with a numeric data-page attr
    function el1(tag, cls, page) { const n = el(tag, cls); n.setAttribute('data-page', page); return n; }
    function el2(tag, cls, page) { const n = el(tag, cls); if (page !== undefined) n.setAttribute('data-page', page); return n; }

    // ------------------------------------------------------------------
    //  ZOOM / NAV / ROTATE
    // ------------------------------------------------------------------
    function setZoom(z) {
        if (!pdfDoc) return;
        zoom = clamp(Math.round(z * 100) / 100, 0.25, 5);
        const o = $();
        if (o.zoom) o.zoom.textContent = Math.round(zoom * 100) + '%';
        renderDocument();
    }
    function fitWidth() {
        if (!pdfDoc) return;
        computeBaseScale().then(function () { zoom = 1.0; const o = $(); if (o.zoom) o.zoom.textContent = '100%'; renderDocument(); });
    }
    function rotatePage() {
        if (!pdfDoc) return;
        viewerEl.__rotate = ((viewerEl.__rotate || 0) + 90) % 360;
        renderDocument();
    }
    function gotoPage(n) {
        if (!pdfDoc) return;
        n = clamp(n, 1, pdfDoc.numPages);
        curPage = n;
        const o = $();
        const shell = o.wrap && o.wrap.querySelector('.pv-page-canvas[data-page="' + n + '"]');
        if (shell) shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
        syncFromScroll();
    }
    function syncFromScroll() {
        if (!pdfDoc || !viewerEl) return;
        const o = $();
        if (!o.wrap) return;
        const vpRect = o.viewport.getBoundingClientRect();
        const shells = o.wrap.querySelectorAll('.pv-page-canvas');
        let target = curPage;
        for (const sh of shells) {
            const r = sh.getBoundingClientRect();
            if (r.top <= vpRect.top + 12) target = parseInt(sh.getAttribute('data-page'), 10);
        }
        curPage = target;

        if (o.input && document.activeElement !== o.input) o.input.value = curPage;
        if (o.prevBtn) o.prevBtn.disabled = curPage <= 1;
        if (o.nextBtn) o.nextBtn.disabled = curPage >= pdfDoc.numPages;
        o.thumbs.querySelectorAll('.pv-thumb').forEach(function (t) {
            const active = parseInt(t.getAttribute('data-page'), 10) === curPage;
            t.classList.toggle('pv-thumb-active', active);
        });
        updateStatus();
    }
    function updateNavState() {
        const o = $();
        if (!pdfDoc || !o.prevBtn) return;
        o.prevBtn.disabled = curPage <= 1;
        o.nextBtn.disabled = curPage >= pdfDoc.numPages;
    }

    // ------------------------------------------------------------------
    //  DRAG
    // ------------------------------------------------------------------
    function makeDraggable(win, handle) {
        let dragging = false, sx, sy, ix, iy;
        handle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.classList.contains('pv-title-btn')) return;
            dragging = true; handle.style.cursor = 'grabbing';
            const r = win.getBoundingClientRect();
            ix = r.left; iy = r.top; sx = e.clientX; sy = e.clientY;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDragEnd);
            e.preventDefault();
        });
        function onDrag(e) {
            if (!dragging) return;
            const W = win.offsetWidth, H = win.offsetHeight;
            win.style.left = clamp(ix + (e.clientX - sx), 0, Math.max(0, window.innerWidth - W)) + 'px';
            win.style.top = clamp(iy + (e.clientY - sy), 0, Math.max(0, window.innerHeight - H)) + 'px';
        }
        function onDragEnd() {
            dragging = false; handle.style.cursor = 'grab';
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onDragEnd);
            const l = parseInt(win.style.left, 10), t = parseInt(win.style.top, 10);
            if (!isNaN(l) && !isNaN(t)) setCookie('pdfViewerPos', l + ',' + t);
        }
    }

    // ------------------------------------------------------------------
    //  OPEN / CLOSE
    // ------------------------------------------------------------------
    const LOADING_HTML = '<div class="pv-loading"><div class="spinner"></div><span>Rendering pages…</span></div>';

    // PDF.js cannot fetch files or launch its worker from a `file://` origin
    // (browser security). It only works over real HTTP(S) — which is exactly
    // how the deployed GitHub Pages site is served.
    function runningOverFileProtocol() {
        return (typeof location !== 'undefined') && location.protocol === 'file:';
    }

    function openViewer(fileName, fileUrl) {
        if (!viewerEl) buildViewer();
        configurePdfJs();

        docTitle = fileName || 'document.pdf';
        viewerEl._title.textContent = '❯ Document Viewer — ' + docTitle;

        // show window
        viewerEl.style.display = 'flex';
        viewerEl.classList.add('open');
        isOpen = true;
        bringToFront();

        clearView();
        viewerEl._wrap.innerHTML = LOADING_HTML;
        if (viewerEl._status) viewerEl._status.textContent = 'Loading ' + docTitle + '…';

        if (!pdfLib) {
            viewerEl._wrap.innerHTML = '<div class="pv-error"><div class="icon">📄</div><span>PDF.js library failed to load.</span></div>';
            return;
        }

        // Guard: a `file://` origin cannot load/fetch the PDF in a browser.
        // Let the viewer explain what to do rather than showing pdf.js errors.
        if (runningOverFileProtocol()) {
            showFileProtocolError(docTitle);
            return;
        }

        pdfLib.getDocument(fileUrl).promise.then(function (doc) {
            pdfDoc = doc;
            renderToken++;            // cancel any previous render
            baseScale = 1; zoom = 1.0;
            viewerEl._zoom.textContent = '100%';
            viewerEl.__rotate = 0;
            computeBaseScale().then(function () { renderDocument(++renderToken); });
        }).catch(function (err) {
            viewerEl._wrap.innerHTML =
                '<div class="pv-error"><div class="icon">📄</div><span>Could not open this PDF.</span>' +
                '<div class="pv-detail">' + String((err && err.message) || err) + '</div></div>';
            if (viewerEl._status) viewerEl._status.textContent = 'Error opening document';
            console.error('pdf open error', err);
        });
    }

    // Friendly explanation when someone opens index.html directly (file://).
    function showFileProtocolError(title) {
        if (viewerEl._status) viewerEl._status.textContent = 'Blocked: opened as file://';
        viewerEl._wrap.innerHTML =
            '<div class="pv-error"><div class="icon">🔒</div><span>' +
            '<b>PDFs can’t render from a local file (file://) URL.</b></span>' +
            '<div class="pv-detail">Your browser blocks PDF.js from fetching this PDF when the page is opened ' +
            'directly as a file. From the project root, serve it over HTTP instead and open the shown address:</div>' +
            '<div class="pv-code">python3 -m http.server 8080<br>open http://localhost:8080/</div>' +
            '<div class="pv-detail">On the deployed GitHub Pages site (https) it works normally without this step.</div>' +
            '<div class="pv-title-small">Document:</div>' +
            '<div class="pv-fname">' + title + '</div></div>';
        if (pdfDoc) { try { pdfDoc.destroy && pdfDoc.destroy(); } catch (e) {} pdfDoc = null; }
    }

    function closeViewer() {
        if (viewerEl) {
            viewerEl.style.display = 'none';
            viewerEl.classList.remove('open');
            isOpen = false;
            if (pdfDoc) { try { pdfDoc.destroy && pdfDoc.destroy(); } catch (e) { /* ignore */ } pdfDoc = null; }
        }
    }
    function minimizeViewer() { closeViewer(); }

    // ------------------------------------------------------------------
    //  PUBLIC API
    // ------------------------------------------------------------------
    window.PDFViewer = {
        open: openViewer,
        close: closeViewer,
        isOpen: function () { return !!viewerEl && viewerEl.style.display === 'flex'; },
        zoomIn: function () { setZoom(zoom + 0.15); },
        zoomOut: function () { setZoom(zoom - 0.15); },
        gotoPage: gotoPage
    };

})();
