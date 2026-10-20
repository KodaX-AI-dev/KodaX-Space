(() => {
  const nav = document.querySelector('.nav');
  const plate = document.createElement('span');
  plate.className = 'navigation-plate';
  plate.setAttribute('aria-hidden', 'true');
  nav.prepend(plate);
  function placeSelection() {
    const current = nav.querySelector('[aria-current="page"]');
    plate.hidden = !current;
    if (!current) return;
    const target = current.getBoundingClientRect();
    const parentBox = nav.getBoundingClientRect();
    plate.style.setProperty('--selection-y', `${target.top - parentBox.top + nav.scrollTop}px`);
    plate.style.setProperty('--selection-height', `${target.height}px`);
  }
  const observer = new MutationObserver(placeSelection);
  observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  new ResizeObserver(placeSelection).observe(nav);
  document.querySelectorAll('[data-category], [data-subview]').forEach((button) =>
    button.addEventListener('click', () => {
      const visible = [...document.querySelectorAll('[data-panel]')].find((panel) => !panel.hidden);
      if (!visible) return;
      visible.classList.remove('experience-arrival');
      void visible.offsetWidth;
      visible.classList.add('experience-arrival');
    }),
  );
  placeSelection();
})();
