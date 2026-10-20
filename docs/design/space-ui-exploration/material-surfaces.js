/* Local pointer light; no animation loop runs while idle. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.ks-glass').forEach((surface) => {
    let pendingFrame = 0;
    let bounds;
    let point;
    surface.addEventListener('pointerenter', () => {
      bounds = surface.getBoundingClientRect();
    });
    surface.addEventListener('pointermove', (event) => {
      if (reduced.matches || document.documentElement.dataset.motion === 'reduced') return;
      if (surface.closest('[data-quality="minimal"]')) return;
      point = { x: event.clientX, y: event.clientY };
      if (pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        if (!bounds) return;
        surface.style.setProperty('--ks-light-x', `${point.x - bounds.left}px`);
        surface.style.setProperty('--ks-light-y', `${point.y - bounds.top}px`);
      });
    });
    surface.addEventListener('pointerleave', () => {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
      surface.style.removeProperty('--ks-light-x');
      surface.style.removeProperty('--ks-light-y');
    });
  });
})();
