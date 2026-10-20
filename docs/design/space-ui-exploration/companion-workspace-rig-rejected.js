import { CompanionMotion } from './companion-rig.js';

// This page is a self-contained simulation. It never calls production IPC or a model.
const bridge = window.companionPreviewBridge;
const stateDetails = {
  idle: {
    label: '待机',
    headline: '准备好继续了',
    detail: '任务伴侣保持安静，主工作区可以正常输入和切换项目。',
    stage: '就绪 · 尚未开始新一轮',
    hint: '转头看向用户、眨眼、耳朵跟随和短摇尾；双前爪保持着地。',
    status: 'ready',
    step: 0,
  },
  thinking: {
    label: '思考',
    headline: '正在梳理本轮改动',
    detail: '先核对现有入口、任务状态与设置，再确定本轮修改的范围。',
    stage: '正在整理已有上下文',
    hint: '侧头、抬前爪到下巴附近、再放回；头、耳和手臂分别运动。',
    status: 'running',
    step: 0,
  },
  working: {
    label: '工作',
    headline: '正在修改并验证',
    detail: '布局改动已经进入验证阶段，当前结果仍待核对。',
    stage: '正在运行验证 · 尚未取得结果',
    hint: '四足前倾，低头检查、左右交替点爪，耳朵与尾巴连续跟随。',
    status: 'running',
    step: 1,
  },
  waiting: {
    label: '等待确认',
    headline: '有一项决定需要你',
    detail: '样稿已准备好。是否保留当前的项目栏停靠位置，继续看完成动作？',
    stage: '等待示例确认 · 不会自动批准',
    hint: '前爪从落地连续抬起后保持，头和尾巴仍有动作；不反复招手。',
    status: 'awaiting',
    step: 2,
  },
  complete: {
    label: '完成',
    headline: '本轮结果可以查看了',
    detail: '这是预览中的完成状态。宠物庆祝一次后收住，其他项目继续保持各自状态。',
    stage: '示例任务已结束 · 可继续审阅',
    hint: '蓄力、小跃、落地缓冲与耳朵回摆；2.4 秒后回到安静待机。',
    status: 'done',
    step: 3,
  },
  acknowledge: {
    label: '回应',
    headline: '收到，继续看动作',
    detail: '这是轻量回应示例：看向用户、点头和短摇尾，然后回正。',
    stage: '回应动作示例 · 不代表真实任务完成',
    hint: '一次点头与短摇尾，约 1.2 秒后收束。',
    status: 'ready',
    step: 0,
  },
  checking: {
    label: '检查',
    headline: '有一项结果值得再看',
    detail: '小狗低头看向旁侧，具体需要检查的内容仍由文字解释。',
    stage: '检查动作示例 · 无真实错误',
    hint: '头部前探、低头、再回正，耳朵稍后落下；没有恐慌表情。',
    status: 'awaiting',
    step: 2,
  },
  walking: {
    label: '小步走',
    headline: '四足步态观察',
    detail: '完整步态在停靠位内演示，不沿工作区奔跑，也不改变任务输入焦点。',
    stage: '步态动作示例 · 并非任务进度',
    hint: '四足支撑、摆腿与落地交替，头部、耳朵和身体随步态运动。',
    status: 'running',
    step: 1,
  },
  resting: {
    label: '休息',
    headline: '安静休息一会儿',
    detail: '休息是独立动作示例，正式设计中仅适用于无任务或用户明确休息的情况。',
    stage: '休息动作示例 · 不代表任务卡住',
    hint: '身体降低、头靠近前爪、眼睛闭合；保留缓慢的呼吸。',
    status: 'ready',
    step: 0,
  },
  reading: {
    label: '阅读',
    headline: '正在阅读上下文',
    detail: '低头、左右扫视，表示在整理已有信息；这是动作示例。',
    stage: '阅读动作示例 · 无真实文件读取',
    hint: '头部降低后左右扫视，与抬爪思考的体态区分。',
    status: 'running',
    step: 0,
  },
  searching: {
    label: '搜索',
    headline: '正在寻找相关线索',
    detail: '前倾、探鼻和小幅换足，表示正在搜寻线索；这是动作示例。',
    stage: '搜索动作示例 · 无真实搜索请求',
    hint: '四足站立，头部前探、低头嗅查，再沿小弧线抬起。',
    status: 'running',
    step: 1,
  },
  blocked: {
    label: '受阻',
    headline: '需要一条新的线索',
    detail: '轻挠脸颊后看向用户，具体阻塞原因由文字说明，不靠宠物猜测。',
    stage: '阻塞动作示例 · 无真实错误',
    hint: '抬爪、轻挠脸颊、放回；一次结束，无哭泣或反复催促。',
    status: 'awaiting',
    step: 2,
  },
  stretching: {
    label: '伸展',
    headline: '伸个懒腰，再继续',
    detail: '伸展属于可主动查看的趣味动作，执行任务时不会自动插入。',
    stage: '伸展动作示例 · 不改变任务状态',
    hint: '前爪前伸、身体前压、再站稳；约 3.3 秒完成一次。',
    status: 'ready',
    step: 0,
  },
};

document.body.classList.add('companion-preview');
const $ = (selector) => document.querySelector(selector);
const sessionStates = new Map();
const toolbar = document.createElement('div');
toolbar.className = 'motion-toolbar';
toolbar.setAttribute('aria-label', '任务伴侣动画预览控制');
toolbar.innerHTML = `<strong>任务伴侣 · 连续动作 v4</strong><span class="preview-only">独立预览</span>
  <div class="motion-choices" role="group" aria-label="动作状态">${Object.entries(stateDetails)
    .map(
      ([key, value]) =>
        `<button type="button" data-motion-state="${key}" aria-pressed="false">${value.label}</button>`,
    )
    .join('')}</div>
  <button class="motion-control" id="motion-flow">播放流程</button>
  <button class="motion-control" id="motion-pause" aria-pressed="false">暂停</button>
  <select id="motion-speed" aria-label="动画速度"><option value="0.5">0.5× 慢放</option><option value="1" selected>1× 原速</option><option value="1.5">1.5×</option></select>`;
document.body.prepend(toolbar);

const seat = document.createElement('button');
seat.className = 'companion-seat';
seat.id = 'companion-seat';
seat.setAttribute('aria-label', '打开任务伴侣');
seat.setAttribute('aria-expanded', 'true');
seat.innerHTML = `<canvas id="companion-canvas" aria-hidden="true"></canvas><span class="companion-seat-copy"><span class="companion-seat-title">任务伴侣</span><span class="companion-seat-detail" id="companion-seat-detail">正在载入小狗…</span><span class="companion-seat-caption" id="companion-seat-caption">当前任务</span></span>`;
$('.sidebar-bottom').prepend(seat);

const companionTab = document.createElement('button');
companionTab.type = 'button';
companionTab.id = 'companion-tab';
companionTab.className = 'companion-tab';
companionTab.setAttribute('role', 'tab');
companionTab.setAttribute('aria-controls', 'companion-panel');
companionTab.setAttribute('aria-selected', 'true');
companionTab.textContent = '伴侣';
$('.inspector-tabs').append(companionTab);

const panel = document.createElement('section');
panel.id = 'companion-panel';
panel.setAttribute('role', 'tabpanel');
panel.setAttribute('aria-labelledby', 'companion-tab');
panel.innerHTML = `<p class="companion-context" id="companion-context">当前任务</p>
  <div class="companion-brief"><h3 id="companion-brief-heading">正在整理本轮改动</h3><p id="companion-brief-detail"></p><p class="phase-note" id="companion-phase-note"></p></div>
  <div class="motion-observer"><div class="observer-heading"><strong>动作观察</strong><button id="motion-replay">从头重播</button></div>
    <div class="observer-stage" id="observer-stage" data-size="120"><canvas id="companion-loupe" aria-label="当前小狗动作放大观察"></canvas></div>
    <div class="observer-sizes"><span>坐姿基准</span><button data-observer-size="40" aria-pressed="false">40 px</button><button data-observer-size="64" aria-pressed="false">64 px</button><button data-observer-size="120" aria-pressed="true">120 px</button></div>
    <div class="motion-scrubber"><input id="motion-seek" aria-label="动作时间" type="range" min="0" max="8" step="0.033333" value="0" /><output id="motion-time">0.0s</output></div>
    <div class="motion-playback"><button id="motion-back">上一帧</button><button id="motion-forward">下一帧</button><button id="motion-resume">继续播放</button></div>
    <p class="motion-description" id="motion-description"></p>
  </div>
  <div class="motion-settings"><label><input id="motion-reduced" type="checkbox" /> 减少动画</label><label><input id="motion-quiet" type="checkbox" /> 极简材质</label></div>
  <details class="motion-diagnostics"><summary>播放与性能信息</summary><p id="motion-metrics">素材载入中</p><p>同一动画画面供实际尺寸与放大观察共用。页面可见时持续播放，后台、暂停或减少动画时停止绘制；数值是本次浏览器测量，不代表所有设备。</p></details>`;
$('#inspector').append(panel);

const taskFlow = document.createElement('div');
taskFlow.className = 'companion-task-flow';
taskFlow.innerHTML = `<h3 class="companion-task-heading"><span></span><span id="companion-task-heading"></span></h3><p class="companion-task-description" id="companion-task-description"></p>
  <div class="companion-sample-approval" id="companion-sample-approval" hidden><strong>等待你的示例确认</strong><p>这里仅推进预览状态，正式任务和产品文件保持不变。</p><button id="companion-confirm">示例确认，看看完成动作</button></div>
  <div class="companion-task-evidence"><span id="companion-task-evidence">整理项目入口</span><code id="companion-task-command">准备中</code></div>
  <ol class="companion-task-plan"><li><i></i>核对工作区与设置入口</li><li><i></i>验证多项目与任务状态</li><li><i></i>确认伴侣的停靠与动作</li><li><i></i>查看本轮成果</li></ol>
`;
$('.agent-intro').after(taskFlow);

let lastMetric = 0;
let flowPlaying = false;
let flowStage = 0;
let heldSession = null;
const flow = [
  { state: 'idle', duration: 4 },
  { state: 'thinking', duration: 6 },
  { state: 'working', duration: 6 },
  { state: 'waiting', duration: Infinity },
];
const motion = new CompanionMotion($('#companion-canvas'), tick);
motion.addObserver($('#companion-loupe'));

function currentSession() {
  return bridge.sessions.get(bridge.current());
}
function projectName(session) {
  return bridge.projects.find((project) => project.id === session.project)?.name ?? '当前项目';
}
function stateFromSession(session) {
  if (sessionStates.has(session.id)) return sessionStates.get(session.id);
  if (session.status === 'awaiting') return 'waiting';
  if (session.status === 'running') return 'working';
  return session.status === 'done' || session.status === 'unread' ? 'complete' : 'idle';
}

function openCompanion() {
  document.body.classList.add('companion-open');
  $('#app').classList.remove('inspector-hidden');
  $('#inspector-toggle').setAttribute('aria-expanded', 'true');
  companionTab.setAttribute('aria-selected', 'true');
  $('#changes-tab').setAttribute('aria-selected', 'false');
  $('#tasks-tab').setAttribute('aria-selected', 'false');
  seat.setAttribute('aria-expanded', 'true');
  motion.dirty = true;
}

function closeCompanion() {
  document.body.classList.remove('companion-open');
  companionTab.setAttribute('aria-selected', 'false');
  seat.setAttribute('aria-expanded', 'false');
}

function updateStateUI(state) {
  const info = stateDetails[state];
  const session = currentSession();
  document.body.dataset.companionState = state;
  document
    .querySelectorAll('[data-motion-state]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.motionState === state)),
    );
  $('#companion-seat-detail').textContent = info.headline;
  $('#companion-seat-caption').textContent = `${projectName(session)} · ${info.label}`;
  $('#companion-context').textContent = `${projectName(session)} / ${session.title} · 示例`;
  $('#companion-brief-heading').textContent = info.headline;
  $('#companion-brief-detail').textContent = info.detail;
  $('#companion-phase-note').textContent = info.stage;
  $('#motion-description').textContent = info.hint;
  $('#companion-task-heading').textContent = info.headline;
  $('#companion-task-description').textContent = info.detail;
  $('#companion-task-evidence').textContent = {
    idle: '待机',
    thinking: '整理项目与任务上下文',
    working: '验证执行过程',
    waiting: '等待你的选择',
    complete: '结果可查看',
    acknowledge: '回应示例',
    checking: '检查示例',
    walking: '步态观察',
    resting: '休息示例',
    reading: '阅读上下文',
    searching: '搜索线索',
    blocked: '等待新的线索',
    stretching: '伸展示例',
  }[state];
  $('#companion-task-command').textContent =
    state === 'working' ? 'validation · 示例运行' : '本地交互示例';
  taskFlow.querySelectorAll('li').forEach((item, index) => {
    item.dataset.done = String(index < info.step || state === 'complete');
    item.dataset.current = String(index === info.step);
  });
  $('#companion-sample-approval').hidden = state !== 'waiting';
  $('#session-stage').hidden = true;
  if (state === 'complete') {
    $('#result-heading').textContent = '示例结果已经准备好';
    $('#outcome-lead').textContent =
      '宠物完成一次庆祝后会收住。你可以继续查看成果、审阅或切到其他项目。';
    $('#result-kicker').textContent = '任务伴侣 · 完成状态示例';
  }
}

function chooseState(state, { keepFlow = false, instant = false } = {}) {
  if (!keepFlow) stopFlow();
  const session = currentSession();
  sessionStates.set(session.id, state);
  session.status = stateDetails[state].status;
  session.label = `${stateDetails[state].label} · 动画示例`;
  bridge.update();
  motion.setState(state, instant);
  if (instant && state === 'complete') motion.seek(2.5);
  updateStateUI(state);
}

function stopFlow() {
  flowPlaying = false;
  $('#motion-flow').textContent = '播放流程';
}
function startFlow() {
  if (flowPlaying) {
    stopFlow();
    return;
  }
  flowStage = 0;
  flowPlaying = true;
  heldSession = bridge.current();
  motion.setPaused(false);
  setPauseButton();
  $('#motion-flow').textContent = '停止流程';
  chooseState(flow[0].state, { keepFlow: true });
}

function setPauseButton() {
  $('#motion-pause').textContent = motion.paused ? '继续' : '暂停';
  $('#motion-pause').setAttribute('aria-pressed', String(motion.paused));
}

function tick(info) {
  if (flowPlaying && (heldSession !== bridge.current() || info.reduced)) stopFlow();
  if (flowPlaying && info.time >= flow[flowStage].duration) {
    flowStage++;
    chooseState(flow[flowStage].state, { keepFlow: true });
    if (flow[flowStage].state === 'waiting') stopFlow();
  }
  if (performance.now() - lastMetric < 250 && !info.paused && !info.reduced) return;
  lastMetric = performance.now();
  const time = Math.min(8, info.time);
  const timeLabel = `${time.toFixed(1)}s${info.time > 8 ? ' +' : ''}`;
  $('#motion-time').value = timeLabel;
  $('#motion-time').textContent = timeLabel;
  $('#motion-seek').value = String(time);
  $('#companion-canvas').dataset.frame = String(info.frames);
  $('#motion-metrics').textContent =
    `${info.reduced ? '静态降级' : info.paused ? '已暂停' : '播放中'} · 渲染 ${info.renderMs.toFixed(2)} ms/帧 · 已绘制 ${info.frames} 帧`;
}

seat.addEventListener('click', () =>
  document.body.classList.contains('companion-open') &&
  !$('#app').classList.contains('inspector-hidden')
    ? $('#changes-tab').click()
    : openCompanion(),
);
companionTab.addEventListener('click', openCompanion);
['#changes-tab', '#tasks-tab'].forEach((selector) =>
  $(selector).addEventListener('click', closeCompanion),
);
$('#close-inspector').addEventListener('click', closeCompanion);
$('#inspector-toggle').addEventListener('click', () =>
  seat.setAttribute(
    'aria-expanded',
    String(
      document.body.classList.contains('companion-open') &&
        !$('#app').classList.contains('inspector-hidden'),
    ),
  ),
);
document
  .querySelectorAll('[data-motion-state]')
  .forEach((button) =>
    button.addEventListener('click', () => chooseState(button.dataset.motionState)),
  );
$('#motion-flow').addEventListener('click', startFlow);
$('#motion-pause').addEventListener('click', () => {
  motion.setPaused(!motion.paused);
  setPauseButton();
});
$('#motion-speed').addEventListener('change', (event) =>
  motion.setSpeed(Number(event.target.value)),
);
$('#motion-replay').addEventListener('click', () => {
  motion.setState(motion.state, true);
  motion.setPaused(false);
  setPauseButton();
});
$('#motion-resume').addEventListener('click', () => {
  motion.setPaused(false);
  setPauseButton();
});
$('#motion-seek').addEventListener('input', (event) => {
  stopFlow();
  motion.setPaused(true);
  motion.seek(Number(event.target.value));
  setPauseButton();
});
$('#motion-back').addEventListener('click', () => {
  stopFlow();
  motion.setPaused(true);
  motion.seek(motion.time - 1 / 30);
  setPauseButton();
});
$('#motion-forward').addEventListener('click', () => {
  stopFlow();
  motion.setPaused(true);
  motion.seek(motion.time + 1 / 30);
  setPauseButton();
});
$('#companion-confirm').addEventListener('click', () => chooseState('complete'));
document.querySelectorAll('[data-observer-size]').forEach((button) =>
  button.addEventListener('click', () => {
    $('#observer-stage').dataset.size = button.dataset.observerSize;
    document
      .querySelectorAll('[data-observer-size]')
      .forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
  }),
);

const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
$('#motion-reduced').checked = systemMotion.matches;
function applyMotionPreference() {
  motion.setReduced(
    systemMotion.matches ||
      $('#motion-reduced').checked ||
      document.documentElement.dataset.quality === 'minimal' ||
      document.documentElement.dataset.motion === 'reduced',
  );
}
$('#motion-reduced').addEventListener('change', applyMotionPreference);
systemMotion.addEventListener('change', applyMotionPreference);
$('#motion-quiet').addEventListener('change', () => {
  const quality = $('#motion-quiet').checked ? 'minimal' : 'balanced';
  window.postMessage({ type: 'space-preview-appearance', quality }, location.origin);
});
new MutationObserver(() => {
  $('#motion-quiet').checked = document.documentElement.dataset.quality === 'minimal';
  applyMotionPreference();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-quality', 'data-motion'],
});
$('#project-navigation').addEventListener('click', (event) => {
  if (!event.target.closest('[data-session]')) return;
  stopFlow();
  chooseState(stateFromSession(currentSession()), { instant: true });
});

motion.ready
  .then(() => {
    chooseState('thinking', { instant: true });
    applyMotionPreference();
    openCompanion();
  })
  .catch((error) => {
    $('#companion-seat-detail').textContent = '小狗素材加载失败';
    $('#motion-metrics').textContent = error instanceof Error ? error.message : String(error);
  });
window.addEventListener('pagehide', () => motion.destroy(), { once: true });
