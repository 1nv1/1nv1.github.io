/**
 * Bash Console Draggable Window
 * Makes the bash-console element draggable by its title bar.
 * Saves/restores position from a cookie.
 */

(function () {
    'use strict';

    const consoleEl = document.querySelector('.bash-console');
    if (!consoleEl) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    // Position on the right side of the screen, vertically centered
    consoleEl.style.position = 'fixed';
    consoleEl.style.zIndex = '1000';
    consoleEl.style.margin = '0';

    const winW = 800;
    const winH = 480;
    const gapRight = 40; // gap from right edge

    // Cookie helpers
    function getCookie(name) {
        const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return match ? decodeURIComponent(match[2]) : null;
    }

    function setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
        document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + date.toUTCString() + '; path=/';
    }

    // Restore saved position, else default and save it
    const saved = getCookie('bashConsolePos');
    if (saved) {
        const parts = saved.split(',');
        const savedX = parseInt(parts[0], 10);
        const savedY = parseInt(parts[1], 10);
        // Clamp to viewport in case screen size changed
        const clampedX = Math.max(0, Math.min(savedX, window.innerWidth - winW));
        const clampedY = Math.max(0, Math.min(savedY, window.innerHeight - winH));
        consoleEl.style.left = clampedX + 'px';
        consoleEl.style.top = clampedY + 'px';
    } else {
        const posX = window.innerWidth - winW - gapRight;
        const posY = (window.innerHeight - winH) / 2;
        consoleEl.style.left = Math.max(0, posX) + 'px';
        consoleEl.style.top = Math.max(0, posY) + 'px';
        // Seed the cookie with the default position
        setCookie('bashConsolePos', Math.max(0, posX) + ',' + Math.max(0, posY));
    }
    consoleEl.style.width = winW + 'px';
    consoleEl.style.height = winH + 'px';

    const titleBar = consoleEl.querySelector('.window-title');
    if (!titleBar) return;

    titleBar.style.userSelect = 'none';

    titleBar.addEventListener('mousedown', onDragStart);

    function onDragStart(e) {
        if (e.button !== 0) return;
        isDragging = true;
        titleBar.style.cursor = 'grabbing';

        const rect = consoleEl.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        startX = e.clientX;
        startY = e.clientY;

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onDragEnd);
        e.preventDefault();
    }

    function onDrag(e) {
        if (!isDragging) return;

        let newX = initialX + (e.clientX - startX);
        let newY = initialY + (e.clientY - startY);

        // Keep window within viewport bounds
        newX = Math.max(0, Math.min(newX, window.innerWidth - winW));
        newY = Math.max(0, Math.min(newY, window.innerHeight - winH));

        consoleEl.style.left = newX + 'px';
        consoleEl.style.top = newY + 'px';
    }

    function onDragEnd() {
        isDragging = false;
        titleBar.style.cursor = 'grab';
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDragEnd);

        // Save current position to cookie
        const left = parseInt(consoleEl.style.left, 10);
        const top = parseInt(consoleEl.style.top, 10);
        if (!isNaN(left) && !isNaN(top)) {
            setCookie('bashConsolePos', left + ',' + top);
        }
    }

})();

