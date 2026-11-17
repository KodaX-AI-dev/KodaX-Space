# Run 标记 · 方向选择

2026-11-17。spinner 回到对话流末尾，上翻时“返回最新消息”按钮带上 Run 进度；原来的 comet 圆环换成 KodaX 自己的 Run 标记。参照 ZCode 的点阵星球聚成 Z，但不照搬：我们做 K。

## 过程

- 第一轮是 CSS 笔画和粒子方案，用户不满意：「感觉B方案不够好看，ZCode原来那个感觉酷多了，一个星球很多点一直转圈，然后变成一个Z的感觉。你能不能再参考调研下互联网上别的动效组件，做个更好看的？」
- 调研了点阵球类 thinking 指示器（thinking-orbs、ONCE agent orb、ZCode）。它们都用 2D canvas，在 JS 里算 3D 旋转、深度明暗和前后排序，共用一个时钟，离屏或页面隐藏时暂停，减少动效时画静止帧。之后改用同样的 canvas 点阵引擎出方案。
- 第二轮扩展了备选。用户：「B确实不错，C也还行，能不能再做几个好看的备选对比一下」；「我还是有点犹豫B和C，C的终端感真的不错。有没有可能融合一下？」
- `index.html` 是最后一轮的对比页：B 星尘旋涡、C 体素方阵，加三个 B×C 融合（H1 旋涡 → 像素 K、H2 扭转体素、H3 点阵屏旋涡），每个都在 112px 大图、18px spinner 行和 14px 返回按钮里预览。

用户原话：「还是直接用C吧」。

## 定稿：C · 体素方阵

5×7×3 的点阵方块在空中翻滚，压平后像 LED 点阵屏一样亮出像素 K，高光扫过，再松开继续翻滚，每 5.6 秒一轮。18px 以下不画暗格，只留 K 的 14 个亮点。

## 实现

- `apps/desktop/renderer/src/shell/runMarkGeometry.ts` 是纯几何：体素、时间线、投影和明暗。翻滚中的方块比 K 小 0.88 倍。不缩的话，方块的角会超出画布约 11%，预览页里能看到被裁掉。
- `apps/desktop/renderer/src/shell/RunMark.tsx` 是 canvas 组件：
  - 所有标记共用一个 rAF 循环，高刷屏上限约 60fps；
  - 离屏的标记用 IntersectionObserver 停掉，窗口隐藏时 rAF 本身也会停；
  - 颜色取主题的 `--warn`；
  - `prefers-reduced-motion` 和极简档只画静止的 K。
- `ActivitySpinner` 的完整行用 18px，返回按钮里的紧凑版用 14px。QuickAsk 和 DiffPanel 仍用 comet。
