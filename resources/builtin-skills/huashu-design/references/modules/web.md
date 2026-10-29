# 模块 · 网页 / 落地页 / 官网 / 界面原型

可点击的站点、落地页、官网、Dashboard 和桌面端界面原型走这里（手机 App 走 `references/app-prototype.md`）。按 SKILL.md 的本次范围、交付格式与方向需求工作，下面的配方按需采用。

## 首屏：先放题材世界里最有特点的东西

首屏是观众第一眼看到的。用这个题材世界里最有特点的东西开场，形式选最合适的那种：一句标题、一张图、一段动画、一个能玩的 demo、一个交互瞬间。

「大数字＋小标签＋一排辅助数据＋渐变点缀」是首屏的默认答案，只有它真的最合适时才用。「大 hero＋三栏特性＋用户评价＋CTA」这套落地页模板同理。

## 做的顺序

1. 沿用已知方向实现；需要比较时按 `references/directions.md` 做适量代表页和真实截图。
2. 按 `references/workflow.md` 填入真实内容并验证结构与交互；局部修改保持其他内容，不另设占位稿审批。
3. 用户需要自行调参时再加 Tweaks（`references/tweaks-system.md`），并验证相关控制确实可用。

## 硬规则

- 正文 ≥14px（移动端 16px），可点元素 ≥44×44px，正文对比度 ≥4.5:1
- 响应式：至少验 1440 和 375 两个宽度（`python3 "$HD/scripts/verify.py" page.html --viewports 1440x900,375x812`）
- 交互要真能点：导航、tab、展开、表单状态做出来，控制台零报错
- 不编造数据、评价和 logo 墙；没有就留诚实占位或问用户要
- 动效：一次编排好的页面载入，胜过每个区块都 fade-up；回应用户动作的动效（展开、确认）才是好动效

## 起手组件

| 文件 | 用途 |
|---|---|
| `assets/browser_window.jsx` | 把网页放进浏览器窗口里展示（URL 栏＋标签栏） |
| `assets/macos_window.jsx` | 桌面 App 窗口外壳 |
| `assets/design_canvas.jsx` | 多个静态变体并排对比 |

React＋Babel 的写法与三条技术红线（样式对象必须唯一命名、多个 babel script 之间用 `Object.assign(window, …)` 共享、不用 `scrollIntoView`）：`references/react-setup.md`。

## 相关文件

| 要做什么 | 读 |
|---|---|
| 风格库与样张（秒数轮盘的网页分区，外加跨媒介的中文与东亚分区） | `references/design-styles.md` |
| 字体配对与中文排印 | `references/typography.md` |
| 用户有 codebase / design system | `references/design-context.md` |
| 交付前验证 | `references/verification.md` |
