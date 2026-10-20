(() => {
  const study = document.querySelector('#material-study');
  if (!study) return;
  const scene = study.querySelector('.material-scene');
  const panel = study.querySelector('#material-command');
  const trigger = study.querySelector('#material-launch');
  const options = [...study.querySelectorAll('.material-option')];
  const status = study.querySelector('#material-status');
  const play = study.querySelector('#material-play');
  const selection = study.querySelector('.material-selection');
  const result = study.querySelector('#material-result');
  const timers = [];
  const tasks = [
    {
      title: '让细节，值得被看见。',
      project: 'KodaX-Space',
      task: '界面与交互重构',
      detail: '连续画布、局部玻璃，以及恰到好处的光。',
      resultHint: '3 个示例文件 · 可以开始审阅',
    },
    {
      title: '让每一次登录，都自然顺畅。',
      project: 'Atlas Web',
      task: '登录流程回归',
      detail: '当前等待人工确认；切换项目保留原有任务状态。',
      resultHint: '需要你确认 · 测试账号的使用范围',
    },
    {
      title: '把研究，整理成下一步。',
      project: 'Design Notes',
      task: '研究记录整理',
      detail: '研究记录正在后台整理；这里展示材质与状态衔接。',
      resultHint: '后台运行中 · 正在归纳研究记录',
    },
  ];
  let selected = 0;
  function animateOnce(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }
  study.querySelectorAll('.ks-sheen').forEach((element) => {
    element.addEventListener('animationend', () => element.classList.remove('is-playing'));
  });
  function sweep() {
    study.querySelectorAll('.ks-sheen').forEach((element) => animateOnce(element, 'is-playing'));
  }
  function setPanel(open, focus = false) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      animateOnce(panel, 'is-opening');
      sweep();
      if (focus) options[selected].focus({ preventScroll: true });
    } else if (focus) trigger.focus({ preventScroll: true });
  }
  function selectTask(index, focus = false) {
    selected = index;
    const task = tasks[index];
    options.forEach((option, position) => {
      option.setAttribute('aria-pressed', String(position === index));
      option.tabIndex = position === index ? 0 : -1;
    });
    selection.style.setProperty('--material-selection-y', `${options[index].offsetTop}px`);
    study.querySelector('#material-project').textContent = task.project;
    study.querySelector('#material-task').textContent = task.task;
    study.querySelector('#material-result-hint').textContent = task.resultHint;
    study.querySelector('#material-title').textContent = task.title;
    study.querySelector('#material-detail').textContent = task.detail;
    if (focus) options[index].focus({ preventScroll: true });
  }
  function cancelPlayback() {
    timers.forEach(clearTimeout);
    timers.length = 0;
    play.disabled = false;
    play.querySelector('span:last-child').textContent = '播放光影演示';
  }
  function schedule(action, delay) {
    timers.push(setTimeout(action, delay));
  }
  options.forEach((option, index) =>
    option.addEventListener('click', () => {
      cancelPlayback();
      selectTask(index);
      status.textContent = `已切换到 ${tasks[index].project} · ${tasks[index].task}。底板滑动结束后保持静止。`;
    }),
  );
  study.querySelectorAll('[data-material-quality]').forEach((button) =>
    button.addEventListener('click', () => {
      scene.dataset.quality = button.dataset.materialQuality;
      study.querySelectorAll('[data-material-quality]').forEach((entry) => {
        entry.setAttribute('aria-pressed', String(entry === button));
      });
      const notes = {
        minimal: '极简：实色表面，无背景模糊；保留清楚的排版和选中反馈。',
        balanced: '均衡：局部雾面玻璃、细边高光与柔和景深；背景保持静止。',
        full: '全特效：提高通透感、模糊与景深；未加入持续流动的背景。',
      };
      status.textContent = notes[scene.dataset.quality];
    }),
  );
  trigger.addEventListener('click', () => {
    cancelPlayback();
    setPanel(panel.hidden, true);
  });
  study.querySelector('#material-command-close').addEventListener('click', () => {
    cancelPlayback();
    setPanel(false, true);
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      cancelPlayback();
      setPanel(false, true);
    }
    if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      cancelPlayback();
      selectTask((selected + (event.key === 'ArrowDown' ? 1 : 2)) % 3, true);
    }
  });
  study.querySelector('#material-send').addEventListener('click', () => {
    cancelPlayback();
    setPanel(false);
    animateOnce(result, 'is-revealing');
    sweep();
    status.textContent = '成果在原位置揭示，输入框短暂提亮；结束后保持静止。仅为视觉演示。';
  });
  play.addEventListener('click', () => {
    cancelPlayback();
    play.disabled = true;
    play.querySelector('span:last-child').textContent = '演示中…';
    setPanel(true);
    selectTask(0);
    status.textContent = '光影演示：玻璃操作面出现 → 选中底板滑动 → 成果揭示 → 回到静止。';
    schedule(() => selectTask(1), 1000);
    schedule(() => selectTask(2), 1800);
    schedule(() => selectTask(0), 2600);
    schedule(() => {
      setPanel(false);
      animateOnce(result, 'is-revealing');
      sweep();
    }, 3500);
    schedule(() => {
      cancelPlayback();
      status.textContent = '演示结束。没有常驻动画；可以再次打开任务切换，或比较三档材质。';
    }, 4500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelPlayback();
  });
  selectTask(0);
})();
