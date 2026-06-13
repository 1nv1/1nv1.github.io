/**
 * Bash Console Draggable Window
 * Makes the bash-console element draggable by its title bar.
 * Starts at 640x320, positioned on the right side of the screen.
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

    const winW = 640;
    const winH = 320;
    const gapRight = 40; // gap from right edge
    const posX = window.innerWidth - winW - gapRight;
    const posY = (window.innerHeight - winH) / 2;

    consoleEl.style.left = Math.max(0, posX) + 'px';
    consoleEl.style.top = Math.max(0, posY) + 'px';
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
        newX = Math.max(0, Math.min(newX, window.innerWidth - 640));
        newY = Math.max(0, Math.min(newY, window.innerHeight - 320));

        consoleEl.style.left = newX + 'px';
        consoleEl.style.top = newY + 'px';
    }

    function onDragEnd() {
        isDragging = false;
        titleBar.style.cursor = 'grab';
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDragEnd);
    }

})();
