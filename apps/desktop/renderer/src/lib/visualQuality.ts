// visualQuality — F060 视觉质量档位
//
// 玻璃拟态 + 景深 + aurora 背景的总开关。三档：
//   - minimal  极简：玻璃退化为实色（无 backdrop-filter）、无景深叠加、无 aurora。
//              远程桌面 / 弱核显 / 省电场景最稳。
//   - balanced 均衡（默认）：CSS 玻璃 + 景深 + 纯 CSS aurora。无 WebGL，性能最稳的「好看」。
//   - full     全特效：更通透的局部玻璃 + 更强景深与缓慢环境光。纯 CSS。
//
// 实现方式：在 <html> 上挂 class `q-minimal` / `q-balanced` / `q-full`，styles.css 里
// 每档定义一组 CSS 变量（--glass-blur / --glass-alpha / --depth / --aurora-opacity）。
// 于是所有 .glass / .lift 工具类零改动随档切换。持久化到 localStorage（镜像 theme）。

export type VisualQuality = 'minimal' | 'balanced' | 'full';

export const VISUAL_QUALITY_KEY = 'kodax-space.visualQuality';

const ALL: ReadonlyArray<VisualQuality> = ['minimal', 'balanced', 'full'];
const CLASS_PREFIX = 'q-';

export const VISUAL_QUALITY_OPTIONS: ReadonlyArray<{
  key: VisualQuality;
  label: string;
  hint: string;
}> = [
  { key: 'minimal', label: '极简', hint: '实色无模糊 · 最省，远程/弱机首选' },
  { key: 'balanced', label: '均衡', hint: '液态玻璃 + 光标高光 · 默认，性能稳' },
  { key: 'full', label: '全特效', hint: '通透玻璃 + 更强景深 · 视觉最完整' },
];

export function isVisualQuality(v: unknown): v is VisualQuality {
  return typeof v === 'string' && (ALL as readonly string[]).includes(v);
}

/** 读 localStorage 持久值，坏值 / 缺失一律回退 'balanced'。 */
export function readVisualQuality(): VisualQuality {
  try {
    const raw = localStorage.getItem(VISUAL_QUALITY_KEY);
    if (isVisualQuality(raw)) return raw;
  } catch {
    /* 隐私模式 / 配额满 — 静默回退 */
  }
  return 'balanced';
}

/** 把档位写到 <html> class（先清掉旧的 q-* 再加新的）。不碰 localStorage。 */
export function applyVisualQualityToDocument(q: VisualQuality): void {
  const el = document.documentElement;
  for (const k of ALL) el.classList.remove(`${CLASS_PREFIX}${k}`);
  el.classList.add(`${CLASS_PREFIX}${q}`);
}
