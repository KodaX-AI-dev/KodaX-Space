/* Preview preferences are shared between the cached workspace and settings frames. */
(() => {
  const root = document.documentElement;
  const qualityValues = ['minimal', 'balanced', 'full'];
  const motionValues = ['standard', 'reduced'];
  const params = new URLSearchParams(location.search);
  let quality = qualityValues.includes(params.get('quality')) ? params.get('quality') : 'balanced';
  let motion = motionValues.includes(params.get('motion'))
    ? params.get('motion')
    : matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'reduced'
      : 'standard';
  function applyAppearance(nextQuality = quality, nextMotion = motion) {
    if (qualityValues.includes(nextQuality)) quality = nextQuality;
    if (motionValues.includes(nextMotion)) motion = nextMotion;
    root.dataset.quality = quality;
    root.dataset.motion = motion;
    document.querySelectorAll('[data-quality-choice]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.qualityChoice === quality));
    });
    document.querySelectorAll('[data-motion-choice]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.motionChoice === motion));
    });
  }
  function notifyAppearance() {
    if (parent !== window)
      parent.postMessage(
        { type: 'space-preview-appearance-change', quality, motion },
        location.origin,
      );
  }
  document.querySelectorAll('[data-quality-choice]').forEach((button) =>
    button.addEventListener('click', () => {
      applyAppearance(button.dataset.qualityChoice);
      notifyAppearance();
    }),
  );
  document.querySelectorAll('[data-motion-choice]').forEach((button) =>
    button.addEventListener('click', () => {
      applyAppearance(quality, button.dataset.motionChoice);
      notifyAppearance();
    }),
  );
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (event.data?.type === 'space-preview-appearance')
      applyAppearance(event.data.quality, event.data.motion);
    if (event.data?.type === 'space-preview-activity') {
      const activity = document.querySelector('#background-activity');
      if (activity)
        activity.textContent = `${event.data.running} 运行 · ${event.data.awaiting} 待确认`;
    }
  });
  applyAppearance();
})();
