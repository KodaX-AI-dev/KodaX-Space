/* This file deliberately reuses the existing prototype session and diff functions. */
/* global dialog, navigation, sessionsById, currentSessionId, selectSession, updateProjectNavigation */
let integratedReviewReturn = null;
// eslint-disable-next-line no-unused-vars -- Called by inline prototype event handlers.
function openWorkspaceReview() {
  integratedReviewReturn = document.activeElement;
  dialog.hidden = false;
  document.querySelector('.workspace').inert = true;
  document.querySelector('.inspector').inert = true;
  dialog.classList.remove('experience-arrival');
  void dialog.offsetWidth;
  dialog.classList.add('experience-arrival');
  document.getElementById('close-review').focus({ preventScroll: true });
}
function closeWorkspaceReview(restoreFocus = true) {
  dialog.hidden = true;
  document.querySelector('.workspace').inert = false;
  document.querySelector('.inspector').inert = false;
  document.body.classList.remove('experience-focused');
  document.getElementById('review-focus').setAttribute('aria-pressed', 'false');
  if (restoreFocus) integratedReviewReturn?.focus({ preventScroll: true });
}
(() => {
  const plate = document.createElement('span');
  plate.className = 'navigation-plate';
  plate.setAttribute('aria-hidden', 'true');
  navigation.prepend(plate);
  const notice = document.getElementById('workspace-notice');
  const timers = [];
  let noticeTarget = 'research';
  let noticeTimer;
  function post(message) {
    if (parent !== window) parent.postMessage(message, location.origin);
  }
  function placeSelection() {
    const current = navigation.querySelector('[aria-current="page"]');
    plate.hidden = !current || current.getClientRects().length === 0;
    if (plate.hidden) return;
    const row = current.getBoundingClientRect();
    const box = navigation.getBoundingClientRect();
    plate.style.setProperty('--selection-y', `${row.top - box.top + navigation.scrollTop}px`);
    plate.style.setProperty('--selection-height', `${row.height}px`);
  }
  function shareActivity() {
    const sessions = [...sessionsById.values()];
    post({
      type: 'space-preview-activity',
      running: sessions.filter((s) => s.status === 'running').length,
      awaiting: sessions.filter((s) => s.status === 'awaiting').length,
    });
    document.getElementById('artifact-list').hidden = currentSessionId !== 'workspace';
    placeSelection();
  }
  const observer = new MutationObserver(shareActivity);
  observer.observe(navigation, {
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-current', 'data-status'],
  });
  new ResizeObserver(placeSelection).observe(navigation);
  navigation.addEventListener('toggle', () => requestAnimationFrame(placeSelection), true);
  navigation.addEventListener('click', (event) => {
    if (!event.target.closest('[data-session]')) return;
    closeWorkspaceReview(false);
    const stream = document.getElementById('conversation');
    stream.classList.remove('experience-arrival');
    void stream.offsetWidth;
    stream.classList.add('experience-arrival');
    shareActivity();
  });
  document.querySelectorAll('[data-content-view]').forEach((button) =>
    button.addEventListener('click', () => {
      const result = button.dataset.contentView === 'result';
      document.body.dataset.contentView = button.dataset.contentView;
      document.querySelectorAll('[data-content-view]').forEach((entry) => {
        entry.setAttribute('aria-pressed', String(entry === button));
      });
      document
        .querySelector('.experience-switch-plate')
        .style.setProperty('--content-selection-x', result ? '45px' : '0px');
      document.querySelector('.outcome').classList.remove('experience-arrival');
      void document.querySelector('.outcome').offsetWidth;
      document.querySelector('.outcome').classList.add('experience-arrival');
    }),
  );
  document.getElementById('review-focus').addEventListener('click', (event) => {
    const focused = document.body.classList.toggle('experience-focused');
    event.currentTarget.setAttribute('aria-pressed', String(focused));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dialog.hidden) closeWorkspaceReview();
  });
  function playSheen(surface) {
    let sheen = surface.querySelector('.ks-sheen');
    if (!sheen) {
      sheen = document.createElement('span');
      sheen.className = 'ks-sheen';
      sheen.setAttribute('aria-hidden', 'true');
      sheen.addEventListener('animationend', () => sheen.classList.remove('is-playing'));
      surface.append(sheen);
    }
    sheen.classList.remove('is-playing');
    void sheen.offsetWidth;
    sheen.classList.add('is-playing');
  }
  function showCompletion(id, title, detail) {
    noticeTarget = id;
    clearTimeout(noticeTimer);
    document.getElementById('workspace-notice-title').textContent = title;
    document.getElementById('workspace-notice-detail').textContent = detail;
    notice.hidden = false;
    notice.classList.add('experience-arrival');
    playSheen(notice);
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, 6000);
  }
  function setProgress(id, changes) {
    const session = sessionsById.get(id);
    Object.assign(session, changes);
    if (currentSessionId === id) {
      const stream = document.getElementById('conversation');
      const position = stream.scrollTop;
      selectSession(id);
      stream.scrollTop = position;
    } else updateProjectNavigation();
    shareActivity();
  }
  function playParallelScene() {
    timers.forEach(clearTimeout);
    timers.length = 0;
    notice.hidden = true;
    post({ type: 'space-preview-play-state', playing: true });
    setProgress('research', {
      status: 'running',
      label: '运行中 · 归纳研究记录',
      stage: '正在整理研究记录',
      result: '研究资料正在归纳',
    });
    setProgress('streaming', {
      status: 'running',
      label: '运行中 · 采集输出时间线',
      stage: '正在采集时间线',
      result: '正在定位流式输出延迟',
    });
    playSheen(document.getElementById('composer'));
    timers.push(
      setTimeout(() => {
        setProgress('research', {
          status: currentSessionId === 'research' ? 'done' : 'unread',
          label: '已完成 · 研究摘要',
          stage: '研究摘要已整理',
          result: '研究摘要已经准备好',
          kicker: '研究成果 · 示例',
          lead: '三组参考与设计依据已整理，可以继续转成下一步方案。',
          detail: '示例结果：已归纳导航、材质和动效三组建议。其他项目继续运行。',
        });
        showCompletion('research', '研究摘要已经准备好', 'Design Notes · 其他项目继续运行');
      }, 3200),
    );
    timers.push(
      setTimeout(() => {
        setProgress('streaming', {
          status: currentSessionId === 'streaming' ? 'done' : 'unread',
          label: '已完成 · 性能时间线',
          stage: '时间线已采集',
          result: '延迟排查结果已经准备好',
          kicker: '排查成果 · 示例',
          lead: '首字响应与工具回传的示例时间线已整理，可以开始审阅。',
          detail: '仅演示任务完成、未读与通知衔接，没有执行性能测试。',
        });
        showCompletion('streaming', '延迟排查已有结果', 'KodaX-Space · Atlas Web 仍待你确认');
      }, 6500),
    );
    timers.push(setTimeout(() => post({ type: 'space-preview-play-state', playing: false }), 7800));
  }
  document.getElementById('workspace-notice-close').addEventListener('click', () => {
    notice.hidden = true;
  });
  document.getElementById('workspace-notice-open').addEventListener('click', () => {
    closeWorkspaceReview(false);
    navigation.querySelector(`[data-session="${noticeTarget}"]`).closest('details').open = true;
    selectSession(noticeTarget);
    notice.hidden = true;
  });
  document
    .getElementById('composer')
    .addEventListener('submit', () => playSheen(document.getElementById('composer')));
  document.querySelectorAll('[data-approval]').forEach((button) =>
    button.addEventListener('click', () => {
      playSheen(document.getElementById('session-stage'));
      shareActivity();
    }),
  );
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (event.data?.type === 'space-preview-play') playParallelScene();
  });
  document.body.dataset.contentView = 'conversation';
  if (innerHeight < 760) {
    navigation.querySelectorAll('[data-project]').forEach((group) => {
      if (group.dataset.current !== 'true') group.open = false;
    });
  }
  document.fonts.ready.then(placeSelection);
  shareActivity();
})();
