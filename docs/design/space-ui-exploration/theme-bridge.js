// Keep the preview's layout selection separate from its light/dark preference.
(() => {
  const media = matchMedia('(prefers-color-scheme: dark)');
  const validThemes = ['light', 'dark', 'system'];
  const queryTheme = new URLSearchParams(location.search).get('theme');
  let preference = validThemes.includes(queryTheme)
    ? queryTheme
    : document.documentElement.dataset.theme || 'light';
  let applied = '';

  function applyPreference() {
    applied = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = applied;
    const toggle = document.querySelector('#theme-toggle, #themeToggle');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(applied === 'light'));
    toggle.innerHTML = ICONS[applied === 'light' ? 'Moon' : 'Sun'];
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type !== 'space-preview-theme' || !validThemes.includes(event.data.theme))
      return;
    preference = event.data.theme;
    applyPreference();
  });
  media.addEventListener('change', () => {
    if (preference === 'system') applyPreference();
  });
  new MutationObserver(() => {
    const actual = document.documentElement.dataset.theme;
    if (actual === applied || !['light', 'dark'].includes(actual)) return;
    preference = actual;
    applied = actual;
    if (window.parent !== window)
      window.parent.postMessage(
        { type: 'space-preview-theme-change', theme: actual },
        location.origin === 'null' ? '*' : location.origin,
      );
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  applyPreference();
})();
/* global ICONS */
