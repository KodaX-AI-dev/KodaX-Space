import { readFile } from 'node:fs/promises';

const key = (name, frames, action = 'rest', pose = 'seated') =>
  ({ file: 'keyframes/' + name + '.png', frames, action, pose });
const neutral = (frames, action = 'rest') => key('neutral', frames, action);

const idle = {
  label: '待机 · 关键姿态补帧',
  description: '短摇尾逐渐收住，眨眼后自然停顿；八秒闭环，四足安稳落地。仅预览。',
  keys: [neutral(30), neutral(6), key('tail-a', 6), key('tail-b', 6), key('tail-c', 6),
    key('tail-d', 6), neutral(30), neutral(2), key('blink-half', 2), key('blink-closed', 2),
    key('blink-half', 2), neutral(48), neutral(2), key('blink-half', 2), key('blink-closed', 2),
    key('blink-half', 2), neutral(38), neutral(0)],
};

const thinking = {
  label: '思考 · 关键姿态补帧',
  description: '抬眼观察，向两侧歪头比较，慢眨眼后回正；观察之间留出停顿。仅预览。',
  reducedKey: 3,
  keys: [neutral(18), neutral(12, 'observe'), key('task-0', 12, 'observe'),
    key('task-1', 24, 'observe'), key('task-1', 12, 'consider'),
    key('task-0', 12, 'consider'), key('task-2', 24, 'consider'),
    key('task-2', 12, 'consider'), key('task-3', 12, 'settle'),
    key('task-0', 12, 'settle'), neutral(24), neutral(0)],
};

const waiting = {
  label: '等待确认 · 关键姿态补帧',
  description: '前爪只抬起一次，之后安静保持、轻偏头与眨眼；确认后先放稳前爪。仅预览。',
  loopKey: 3,
  keys: [neutral(8, 'ask'), key('task-0', 8, 'ask'), key('task-4', 8, 'ask'),
    key('task-5', 30, 'hold'), key('task-5', 12, 'hold'), key('task-6', 24, 'hold'),
    key('task-6', 12, 'hold'), key('task-5', 24, 'hold'), key('task-5', 6, 'hold'),
    key('task-7', 6, 'hold'), key('task-5', 24, 'hold'), key('task-5', 0, 'hold')],
  release: [key('task-5', 8, 'settle'), key('task-4', 8, 'settle'),
    key('task-0', 8, 'settle'), neutral(0)],
  reducedKey: 3,
};

const complete = {
  label: '完成 · 关键姿态补帧',
  description: '开心起身，做一次邀玩俯身，再抬身坐回；庆祝一次后收住。仅预览。',
  once: true,
  reducedKey: 1,
  keys: [neutral(8, 'celebrate'), key('happy-0', 24, 'celebrate'), key('happy-1', 12, 'celebrate', 'standing'),
    key('happy-2', 12, 'celebrate', 'standing'), key('happy-3', 12, 'playbow', 'bowing'),
    key('happy-4', 12, 'playbow', 'bowing'), key('happy-4', 24, 'playbow', 'bowing'),
    key('happy-5', 8, 'settle', 'bow-to-seated'), key('rise-0', 12, 'settle', 'standing'),
    key('rise-1', 12, 'settle', 'standing'), key('rise-2', 6, 'settle', 'standing-to-seated'),
    key('rise-3', 6, 'settle', 'standing-to-seated'), key('happy-6', 12, 'settle'),
    key('happy-7', 12, 'settle'), neutral(24), neutral(0)],
};

export async function animations() {
  const previous = JSON.parse(await readFile(new URL('../companion-dog-v10/keyposes.json', import.meta.url)));
  const keys = previous.map(source => key(source.sourceCel ? 'work-' + source.sourceCel : 'neutral',
    source.action === 'rest' ? 0 : 8, source.action, source.pose));
  keys.at(-1).frames = 48;
  keys.push(neutral(0));
  return { idle, thinking, working: {
    label: '工作 · 遮挡精修与关键姿态补帧',
    description: '保留起身叼取、搬运、趴下检查、回应与坐回；精修嘴部与前爪边缘采样。仅预览。',
    keys, reducedKey: keys.findIndex(item => item.file === 'keyframes/work-62.png'),
  }, waiting, complete };
}
